const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  ensureDatabase,
  sanitizeUser,
  getUserByEmail,
  getUserByUsername,
  getUserById,
  getLibrary,
  getSeatRows,
  getActivityLog,
  getPublicLayoutPayload,
  summarizeSeats,
  updateUserPassword,
  updateSeatStatus,
  resetAllSeats,
  verifyResetKey,
  updateLibrarySettings,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
} = require("./src/db");
const { buildSeatMap } = require("./src/layout");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const TOKEN_EXPIRY = "30m";
const pendingUndoActions = new Map();

// Wrap every async route handler with this. Express does NOT automatically
// catch a rejected promise from an async handler — without this, a thrown
// error either hangs the request or leaks a raw Node/Express error message
// (e.g. "Cannot read properties of null...") straight to the client instead
// of hitting our error-handling middleware below.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function rememberUndo(action) {
  pendingUndoActions.set("last", { ...action, expiresAt: Date.now() + 10000 });
  setTimeout(() => {
    const current = pendingUndoActions.get("last");
    if (current && current.id === action.id) {
      pendingUndoActions.delete("last");
    }
  }, 10000);
}

function getPendingUndo() {
  const action = pendingUndoActions.get("last");
  if (!action) {
    return null;
  }

  if (action.expiresAt <= Date.now()) {
    pendingUndoActions.delete("last");
    return null;
  }

  return action;
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      username: user.username || null,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function auth(requiredRoles = []) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await getUserById(payload.sub);

      if (!user || !user.active) {
        return res.status(401).json({ error: "Account is unavailable." });
      }

      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        return res.status(403).json({ error: "Access denied." });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
  };
}

function validatePassword(password) {
  return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(String(password || ""));
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/student", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "student.html"));
});

app.get("/librarian", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin", (_req, res) => {
  res.redirect("/librarian");
});

app.get("/super-admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "super-admin.html"));
});

// Both ADMIN (librarian) and SUPER_ADMIN log in with a username, not an
// email — the `email` column only exists to satisfy the UNIQUE constraint
// in the users table and is never shown or used on any login form.
app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body || {};
    const user = await getUserByUsername(username);

    if (!user || user.role !== role) {
      return res.status(401).json({ error: "Invalid login credentials." });
    }

    if (!user.active) {
      return res.status(403).json({ error: "This account is disabled." });
    }

    const matches = await bcrypt.compare(String(password || ""), user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid login credentials." });
    }

    return res.json({
      token: issueToken(user),
      user: sanitizeUser(user),
    });
  })
);

app.post(
  "/api/auth/change-password",
  auth(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        error:
          "New password must be at least 8 characters and include upper, lower, and number.",
      });
    }

    const matches = await bcrypt.compare(String(currentPassword || ""), req.user.password_hash);
    if (!matches) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    await updateUserPassword(req.user.id, await bcrypt.hash(newPassword, 10));
    return res.json({ message: "Password updated successfully." });
  })
);

app.get(
  "/api/public/layout",
  asyncHandler(async (_req, res) => {
    res.json(await getPublicLayoutPayload());
  })
);

app.get(
  "/api/admin/dashboard",
  auth(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const [library, seats, activityLog] = await Promise.all([
      getLibrary(),
      getSeatRows(),
      getActivityLog(8),
    ]);
    res.json({
      library,
      seatSummary: summarizeSeats(seats),
      layout: buildSeatMap(seats),
      activityLog,
      user: sanitizeUser(req.user),
    });
  })
);

app.patch(
  "/api/admin/seats/:seatNumber/status",
  auth(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const seatNumber = Number(req.params.seatNumber);
    const { status } = req.body || {};

    if (!new Set(["VACANT", "OCCUPIED"]).has(status)) {
      return res.status(400).json({ error: "Invalid seat status." });
    }

    const result = await updateSeatStatus(seatNumber, status, {
      name: req.user.name,
      role: req.user.role,
    });
    if (!result) {
      return res.status(404).json({ error: "Seat not found." });
    }

    const actionId = `${seatNumber}-${Date.now()}`;
    rememberUndo({
      id: actionId,
      seatNumber,
      previousStatus: result.previousStatus,
      nextStatus: status,
      actorName: req.user.name,
    });

    const seats = await getSeatRows();
    const activityLog = await getActivityLog(8);
    return res.json({
      message: `Seat ${seatNumber} marked ${status.toLowerCase()}.`,
      seat: result.seat,
      seatSummary: summarizeSeats(seats),
      activityLog,
      undo: getPendingUndo(),
    });
  })
);

app.post(
  "/api/admin/undo-last",
  auth(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const pending = getPendingUndo();
    if (!pending) {
      return res.status(404).json({ error: "There is no recent seat change to undo." });
    }

    const result = await updateSeatStatus(pending.seatNumber, pending.previousStatus, {
      name: req.user.name,
      role: req.user.role,
    });
    if (!result) {
      return res.status(404).json({ error: "Seat not found." });
    }

    pendingUndoActions.delete("last");
    const seats = await getSeatRows();
    const activityLog = await getActivityLog(8);
    return res.json({
      message: `Undid seat ${pending.seatNumber}.`,
      seat: result.seat,
      seatSummary: summarizeSeats(seats),
      activityLog,
      undo: null,
    });
  })
);

app.post(
  "/api/admin/reset-seats",
  auth(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const { resetKey } = req.body || {};
    const allowed = await verifyResetKey(resetKey);

    if (!allowed) {
      return res.status(403).json({ error: "Reset key is incorrect." });
    }

    const seats = await resetAllSeats({
      name: req.user.name,
      role: req.user.role,
    });
    const activityLog = await getActivityLog(8);
    return res.json({
      message: "All seats have been marked vacant.",
      seatSummary: summarizeSeats(seats),
      activityLog,
    });
  })
);

app.get(
  "/api/super-admin/dashboard",
  auth(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const [library, seats, admins] = await Promise.all([
      getLibrary(),
      getSeatRows(),
      getAdminUsers(),
    ]);

    res.json({
      library,
      seatSummary: summarizeSeats(seats),
      admins: admins.map((admin) => sanitizeUser(admin)),
      user: sanitizeUser(req.user),
    });
  })
);

app.post(
  "/api/super-admin/admins",
  auth(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const { name, username, password } = req.body || {};
    const normalizedUsername = String(username || "").trim().toLowerCase();

    if (!name || !normalizedUsername || !password) {
      return res.status(400).json({ error: "Name, username, and password are required." });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: "Password must be at least 8 characters and include upper, lower, and number.",
      });
    }

    const existingUser = await getUserByUsername(normalizedUsername);
    if (existingUser) {
      return res.status(409).json({ error: "This username is already in use." });
    }

    const admin = await createAdminUser({
      id: `admin-${Date.now()}`,
      name: String(name).trim(),
      username: normalizedUsername,
      passwordHash: await bcrypt.hash(password, 10),
    });

    return res.status(201).json({
      message: "Admin account created.",
      admin: sanitizeUser(admin),
    });
  })
);

app.patch(
  "/api/super-admin/admins/:adminId",
  auth(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const { adminId } = req.params;
    const { action, username, password } = req.body || {};

    const existingAdmin = await getUserById(adminId);
    if (!existingAdmin || existingAdmin.role !== "ADMIN") {
      return res.status(404).json({ error: "Admin account not found." });
    }

    let updatedAdmin = null;
    if (action === "toggle-active") {
      updatedAdmin = await updateAdminUser(adminId, { active: !Boolean(existingAdmin.active) });
    } else if (action === "reset-password") {
      if (!validatePassword(password)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters and include upper, lower, and number.",
        });
      }
      updatedAdmin = await updateAdminUser(adminId, {
        passwordHash: await bcrypt.hash(password, 10),
      });
    } else if (action === "change-username") {
      const normalizedUsername = String(username || "").trim().toLowerCase();
      if (!normalizedUsername) {
        return res.status(400).json({ error: "Username is required." });
      }
      const existingUser = await getUserByUsername(normalizedUsername);
      if (existingUser && existingUser.id !== adminId) {
        return res.status(409).json({ error: "Username is already in use." });
      }
      updatedAdmin = await updateAdminUser(adminId, { username: normalizedUsername });
    } else {
      return res.status(400).json({ error: "Unsupported action." });
    }

    return res.json({
      message: "Admin account updated.",
      admin: sanitizeUser(updatedAdmin),
    });
  })
);

app.delete(
  "/api/super-admin/admins/:adminId",
  auth(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const result = await deleteAdminUser(req.params.adminId);
    if (!result.changes) {
      return res.status(404).json({ error: "Admin account not found." });
    }
    return res.json({ message: "Admin account deleted." });
  })
);

app.patch(
  "/api/super-admin/library",
  auth(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const { name, logoText, resetKey } = req.body || {};

    const library = await updateLibrarySettings({
      name,
      logoText,
      resetKey,
    });

    return res.json({
      message: "Library settings updated.",
      library,
    });
  })
);

app.patch(
  "/api/admin/library",
  auth(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    const { name, logoText } = req.body || {};

    const library = await updateLibrarySettings({
      name,
      logoText,
    });

    return res.json({
      message: "Library settings updated.",
      library,
    });
  })
);

// --- Error handling middleware: MUST be registered after all routes. ---
// Express only routes errors to middleware defined *below* the code that
// threw. This used to sit above every route (dead code, never fired) —
// now it's the last thing in the stack, so it catches:
//   - malformed JSON bodies (the SyntaxError case)
//   - anything thrown/rejected inside an asyncHandler-wrapped route
// The client always gets a clean, generic message. Full details go to the
// server log only, so real bugs are diagnosable without leaking internals
// (stack traces, null-reference messages, etc.) to the browser.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error(`Invalid JSON payload for ${req.method} ${req.path}: ${err.message}`);
    return res.status(400).json({ error: "Invalid JSON payload." });
  }

  console.error(`Unhandled error for ${req.method} ${req.path}:`, err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: "Something went wrong on our end. Please try again.",
  });
});

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Library seat management system running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start application:", error);
    process.exit(1);
  });