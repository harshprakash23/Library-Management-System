const { Pool } = require("pg");
const { newDb } = require("pg-mem");
const bcrypt = require("bcryptjs");
const { getSeatNumbers, buildSeatMap } = require("./layout");

let activePool = null;

function getPoolConfig() {
  return process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 2000,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        database: process.env.PGDATABASE || "library_db",
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 2000,
      };
}

async function initializePool() {
  if (activePool) {
    return activePool;
  }

  const realPool = new Pool(getPoolConfig());
  try {
    const client = await realPool.connect();
    client.release();
    console.log("Connected to PostgreSQL database server.");
    activePool = realPool;
    return activePool;
  } catch (error) {
    console.log("No live PostgreSQL server reached at localhost:5432. Falling back to embedded PostgreSQL instance.");
    const memDb = newDb();
    memDb.public.registerFunction({
      name: "trim",
      implementation: (val) => (val ? String(val).trim() : ""),
    });
    const pgAdapter = memDb.adapters.createPg();
    activePool = new pgAdapter.Pool();
    return activePool;
  }
}

function convertSql(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

async function run(sql, params = []) {
  const result = await activePool.query(convertSql(sql), params);
  return {
    id: result.rows && result.rows.length > 0 ? result.rows[0].id : null,
    changes: result.rowCount,
  };
}

async function get(sql, params = []) {
  const result = await activePool.query(convertSql(sql), params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await activePool.query(convertSql(sql), params);
  return result.rows;
}

function summarizeSeats(seats) {
  const occupied = seats.filter((seat) => seat.status === "OCCUPIED").length;
  return {
    total: seats.length,
    occupied,
    vacant: seats.length - occupied,
  };
}

async function ensureDatabase() {
  await initializePool();

  await run(`
    CREATE TABLE IF NOT EXISTS library_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      logo_text TEXT NOT NULL,
      reset_key_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      seat_number INTEGER,
      action TEXT NOT NULL,
      status TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`);

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  const settings = await get(`SELECT id FROM library_settings WHERE id = 1`);
  if (!settings) {
    await run(
      `INSERT INTO library_settings (id, name, logo_text, reset_key_hash, updated_at)
       VALUES (1, ?, ?, ?, ?)`,
      [
        "Library Seat Management",
        "LSM",
        bcrypt.hashSync("RESET123", 10),
        new Date().toISOString(),
      ]
    );
  }

  const userCount = await get(`SELECT COUNT(*) AS count FROM users`);
  if (!userCount || Number(userCount.count) === 0) {
    await run(
      `INSERT INTO users (id, name, username, email, password_hash, role, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        "super-admin-1",
        "Super Admin",
        "Harsh@user",
        "superadmin@local.library",
        bcrypt.hashSync("Harsh", 10),
        "SUPER_ADMIN",
        new Date().toISOString(),
      ]
    );
    await run(
      `INSERT INTO users (id, name, username, email, password_hash, role, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        "admin-1",
        "Library Owner",
        "librarian",
        "admin@gmail.com",
        bcrypt.hashSync("Admin1234", 10),
        "ADMIN",
        new Date().toISOString(),
      ]
    );
  }

  const adminWithoutUsername = await all(
    `SELECT id, name FROM users WHERE role = 'ADMIN' AND (username IS NULL OR username = '')`
  );
  for (const user of adminWithoutUsername) {
    const baseUsername = String(user.name || "librarian")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "librarian";
    let username = baseUsername;
    let suffix = 1;
    while (await get(`SELECT id FROM users WHERE username = ? AND id != ?`, [username, user.id])) {
      suffix += 1;
      username = `${baseUsername}${suffix}`;
    }
    await run(`UPDATE users SET username = ?, updated_at = ? WHERE id = ?`, [
      username,
      new Date().toISOString(),
      user.id,
    ]);
  }

  const defaultLibrarian = await get(`SELECT id, username FROM users WHERE id = 'admin-1'`);
  const reservedLibrarian = await get(
    `SELECT id FROM users WHERE role = 'ADMIN' AND lower(username) = 'librarian' AND id != 'admin-1'`
  );
  if (
    defaultLibrarian &&
    defaultLibrarian.username !== "librarian" &&
    !reservedLibrarian
  ) {
    await run(
      `UPDATE users SET username = 'librarian', email = 'librarian@local.library', updated_at = ? WHERE id = 'admin-1'`,
      [new Date().toISOString()]
    );
  }

  const seatCount = await get(`SELECT COUNT(*) AS count FROM seats`);
  if (!seatCount || Number(seatCount.count) === 0) {
    const now = new Date().toISOString();
    for (const number of getSeatNumbers()) {
      await run(
        `INSERT INTO seats (id, number, status, updated_at) VALUES (?, ?, 'VACANT', ?)`,
        [`seat-${number}`, number, now]
      );
    }
  }
}

async function addActivityLogEntry({ seatNumber, action, status, details }) {
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO activity_log (seat_number, action, status, details, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [seatNumber ?? null, action, status ?? null, details ?? null, createdAt]
  );
  return getActivityLog(1);
}

async function getActivityLog(limit = 8) {
  const rows = await all(
    `SELECT seat_number, action, status, details, created_at
     FROM activity_log
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    seatNumber: row.seat_number,
    action: row.action,
    status: row.status,
    details: row.details,
    createdAt: row.created_at,
  }));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username || null,
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    createdAt: user.created_at,
    updatedAt: user.updated_at || null,
  };
}

async function getUserByEmail(email) {
  return get(`SELECT * FROM users WHERE lower(email) = lower(?)`, [email]);
}

async function getUserByUsername(username) {
  return get(`SELECT * FROM users WHERE lower(username) = lower(?)`, [String(username || "")]);
}

async function getUserById(id) {
  return get(`SELECT * FROM users WHERE id = ?`, [id]);
}

async function getLibrarySettingsRow() {
  const settings = await get(`SELECT * FROM library_settings WHERE id = 1`);
  if (!settings) {
    throw new Error("Library settings are missing from the database (row id=1 not found).");
  }
  return settings;
}

async function getLibrary() {
  const settings = await getLibrarySettingsRow();
  return {
    name: settings.name,
    logoText: settings.logo_text,
    updatedAt: settings.updated_at,
  };
}

async function getSeatRows() {
  return all(`SELECT id, number, status, updated_at FROM seats ORDER BY number ASC`);
}

async function getPublicLayoutPayload() {
  const [library, seats] = await Promise.all([getLibrary(), getSeatRows()]);
  return {
    library,
    seatSummary: summarizeSeats(seats),
    layout: buildSeatMap(seats),
  };
}

async function updateUserPassword(userId, passwordHash) {
  await run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [
    passwordHash,
    new Date().toISOString(),
    userId,
  ]);
}

async function updateSeatStatus(seatNumber, status, actor = {}) {
  const seat = await get(`SELECT * FROM seats WHERE number = ?`, [seatNumber]);
  if (!seat) {
    return null;
  }

  const previousStatus = seat.status;
  const updatedAt = new Date().toISOString();

  await run(`UPDATE seats SET status = ?, updated_at = ? WHERE number = ?`, [
    status,
    updatedAt,
    seatNumber,
  ]);

  const updatedSeat = await get(`SELECT id, number, status, updated_at FROM seats WHERE number = ?`, [seatNumber]);
  const details = [actor.name, actor.role].filter(Boolean).join(" • ");
  await addActivityLogEntry({
    seatNumber,
    action: previousStatus === status ? "updated" : "changed",
    status,
    details: details || `Seat ${seatNumber} updated`,
  });

  return { seat: updatedSeat, previousStatus };
}

async function resetAllSeats(actor = {}) {
  await run(`UPDATE seats SET status = 'VACANT', updated_at = ?`, [new Date().toISOString()]);
  const details = [actor.name, actor.role].filter(Boolean).join(" • ");
  await addActivityLogEntry({
    seatNumber: null,
    action: "reset",
    status: "VACANT",
    details: details || "All seats reset",
  });
  return getSeatRows();
}

async function verifyResetKey(key) {
  const settings = await getLibrarySettingsRow();
  return bcrypt.compare(String(key || ""), settings.reset_key_hash);
}

async function updateLibrarySettings({ name, logoText, resetKey }) {
  const settings = await getLibrarySettingsRow();
  const nextName = name ? String(name).trim() : settings.name;
  const nextLogo = logoText ? String(logoText).trim().slice(0, 3).toUpperCase() : settings.logo_text;
  const nextResetHash = resetKey
    ? await bcrypt.hash(String(resetKey).trim(), 10)
    : settings.reset_key_hash;

  await run(
    `UPDATE library_settings
     SET name = ?, logo_text = ?, reset_key_hash = ?, updated_at = ?
     WHERE id = 1`,
    [nextName, nextLogo, nextResetHash, new Date().toISOString()]
  );

  return getLibrary();
}

async function getAdminUsers() {
  return all(`SELECT * FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC`);
}

async function createAdminUser({ id, name, username, passwordHash }) {
  await run(
    `INSERT INTO users (id, name, username, email, password_hash, role, active, created_at)
     VALUES (?, ?, ?, ?, ?, 'ADMIN', 1, ?)`,
    [id, name, username, `${username}@local.library`, passwordHash, new Date().toISOString()]
  );
  return getUserById(id);
}

async function updateAdminUser(adminId, updates) {
  const admin = await getUserById(adminId);
  if (!admin || admin.role !== "ADMIN") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "active")) {
    await run(`UPDATE users SET active = ?, updated_at = ? WHERE id = ?`, [
      updates.active ? 1 : 0,
      new Date().toISOString(),
      adminId,
    ]);
  }

  if (updates.username) {
    await run(`UPDATE users SET username = ?, email = ?, updated_at = ? WHERE id = ?`, [
      updates.username,
      `${updates.username}@local.library`,
      new Date().toISOString(),
      adminId,
    ]);
  }

  if (updates.passwordHash) {
    await run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [
      updates.passwordHash,
      new Date().toISOString(),
      adminId,
    ]);
  }

  return getUserById(adminId);
}

async function deleteAdminUser(adminId) {
  return run(`DELETE FROM users WHERE id = ? AND role = 'ADMIN'`, [adminId]);
}

module.exports = {
  ensureDatabase,
  summarizeSeats,
  addActivityLogEntry,
  getActivityLog,
  sanitizeUser,
  getUserByEmail,
  getUserByUsername,
  getUserById,
  getLibrary,
  getSeatRows,
  getPublicLayoutPayload,
  updateUserPassword,
  updateSeatStatus,
  resetAllSeats,
  verifyResetKey,
  updateLibrarySettings,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
};