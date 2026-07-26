const page = document.body.dataset.page;
const tokenStorageKey =
  page === "super-admin" ? "library-super-admin-token" : "library-admin-token";

let adminLayoutCache = [];
let selectedSeat = null;
let adminAutoRefreshTimer = null;
let studentAutoRefreshTimer = null;
let pendingUndo = null;
let pendingUndoTimer = null;
let animateSeatNumber = null;
let lastActivityEntries = [];
let selectedActivityIndex = 0;

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function getToken() {
  return localStorage.getItem(tokenStorageKey);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(tokenStorageKey, token);
  } else {
    localStorage.removeItem(tokenStorageKey);
  }
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function setLastUpdated(value = new Date()) {
  const label = document.getElementById("lastUpdatedTime");
  if (label) {
    label.textContent = `Last Updated — ${formatTime(value)}`;
  }
}

function applyTheme(theme) {
  const resolvedTheme = theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", resolvedTheme);
  document.body.classList.toggle("theme-dark", resolvedTheme === "dark");
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  localStorage.setItem("library-theme", resolvedTheme);

  const button = document.getElementById("themeToggle");
  if (button) {
    button.textContent = resolvedTheme === "dark" ? "☀️ Light" : "🌙 Dark";
  }

  const badge = document.getElementById("adminThemeBadge");
  if (badge) {
    badge.textContent = `Theme: ${resolvedTheme}`;
  }
}

function getStoredTheme() {
  return localStorage.getItem("library-theme") || "light";
}

function showToast(message, options = {}) {
  const container = document.getElementById("globalToast");
  if (!container) {
    return;
  }

  const duration = options.duration || 2200;
  const undoButton = options.onUndo
    ? `<button class="toast-action" id="toastUndoBtn" type="button">Undo</button>`
    : "";

  container.classList.remove("toast-error");
  if (options.isError) {
    container.classList.add("toast-error");
  }

  container.innerHTML = `<div class="toast-body">${message}</div>${undoButton}`;
  container.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    container.classList.remove("show");
  }, duration);

  if (options.onUndo) {
    document.getElementById("toastUndoBtn")?.addEventListener("click", () => {
      window.clearTimeout(showToast.timeoutId);
      container.classList.remove("show");
      options.onUndo();
    });
  }
}

// Error-toast helper. Uses the same toast surface as success messages so
// failures don't look/feel jarringly different from the rest of the UI.
// Falls back to alert() only if the toast container isn't present on the page.
function showErrorToast(message, options = {}) {
  const container = document.getElementById("globalToast");
  if (!container) {
    alert(message);
    return;
  }

  showToast(message, { duration: 4000, ...options, isError: true });
}

// Some backend errors leak raw JS exception text (e.g. "Cannot read
// properties of null (reading 'x')") instead of a real validation message —
// usually because something crashed *after* the actual change was already
// applied (a logging step, etc). We can't tell from here whether the change
// went through, so we say that honestly instead of showing the stack-trace text.
function isTechnicalErrorMessage(message = "") {
  return /cannot read propert|is not a function|is not defined|undefined is not|null is not an object|typeerror|referenceerror/i.test(
    message
  );
}

function friendlyErrorMessage(message, fallback) {
  if (isTechnicalErrorMessage(message)) {
    return fallback;
  }
  return message || fallback;
}

async function request(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong.");
  }

  return payload;
}

function createCell(cell, { clickable = false, onSeatClick, highlightSeat, animateSeat } = {}) {
  if (cell.type === "space") {
    const space = document.createElement("div");
    space.className = "empty-cell";
    return space;
  }

  if (cell.type === "label") {
    const label = document.createElement("div");
    label.className = `seat-label ${cell.className || ""}`;
    label.textContent = cell.text;
    return label;
  }

  const button = document.createElement(clickable ? "button" : "div");
  const isAnimating = Number(animateSeat) === cell.seatNumber;
  button.className = `seat ${cell.status === "VACANT" ? "vacant" : "occupied"} ${
    cell.orientation === "vertical" ? "vertical" : ""
  } ${clickable ? "clickable" : ""} ${isAnimating ? "seat-animating" : ""}`;
  button.textContent = cell.seatNumber;

  if (highlightSeat && Number(highlightSeat) === cell.seatNumber) {
    button.classList.add("highlighted");
  }

  if (clickable && onSeatClick) {
    button.type = "button";
    button.addEventListener("click", () => onSeatClick(cell));
  }

  return button;
}

function renderSeatLayout(containerId, layout, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  container.innerHTML = "";
  (layout || []).flat().forEach((cell) => {
    container.appendChild(createCell(cell, options));
  });
}

function attachSearch(inputId, layoutRenderer) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    layoutRenderer(input.value);
  });
}

function renderActivityLog(entries = []) {
  lastActivityEntries = entries;
  const listContainer = document.getElementById("activityLogList");
  const detailContainer = document.getElementById("activityDetail");

  if (!listContainer || !detailContainer) {
    return;
  }

  if (!entries.length) {
    listContainer.innerHTML = '<p class="helper-copy">No recent activity.</p>';
    detailContainer.innerHTML = '<p class="helper-copy">Select an activity item to see the details.</p>';
    return;
  }

  if (selectedActivityIndex >= entries.length) {
    selectedActivityIndex = 0;
  }

  listContainer.innerHTML = entries
    .map((entry, index) => {
      const time = entry.createdAt ? formatTime(new Date(entry.createdAt)) : "--:--";
      const seatText = entry.seatNumber ? `Seat ${entry.seatNumber}` : "Library";
      const isActive = index === selectedActivityIndex;
      return `
        <button class="activity-entry ${isActive ? "active" : ""}" data-index="${index}" type="button">
          <div class="activity-time">${time}</div>
          <div class="activity-copy">
            <strong>${seatText}</strong>
            <p>${entry.details || "Seat activity updated."}</p>
            <span>${entry.action === "reset" ? "Reset" : entry.status === "VACANT" ? "Vacant" : "Occupied"}</span>
          </div>
        </button>
      `;
    })
    .join("");

  listContainer.querySelectorAll(".activity-entry").forEach((button) => {
    button.addEventListener("click", () => {
      selectedActivityIndex = Number(button.dataset.index);
      renderActivityLog(lastActivityEntries);
    });
  });

  const selectedEntry = entries[selectedActivityIndex];
  if (!selectedEntry) {
    detailContainer.innerHTML = '<p class="helper-copy">Select an activity item to see the details.</p>';
    return;
  }

  const seatText = selectedEntry.seatNumber ? `Seat ${selectedEntry.seatNumber}` : "Library";
  detailContainer.innerHTML = `
    <h4>${seatText}</h4>
    <p><strong>Action:</strong> ${selectedEntry.action || "updated"}</p>
    <p><strong>Status:</strong> ${selectedEntry.status || "—"}</p>
    <p><strong>Details:</strong> ${selectedEntry.details || "No extra details were recorded."}</p>
    <p><strong>Time:</strong> ${selectedEntry.createdAt ? formatTime(new Date(selectedEntry.createdAt)) : "—"}</p>
  `;
}

function setUndoState(undoPayload) {
  pendingUndo = undoPayload || null;
  window.clearTimeout(pendingUndoTimer);
  if (!pendingUndo) {
    return;
  }

  pendingUndoTimer = window.setTimeout(() => {
    pendingUndo = null;
  }, 10000);
}

async function hydrateBrand() {
  if (!["home", "student", "admin", "super-admin"].includes(page)) {
    return;
  }

  try {
    const payload = await request("/api/public/layout", { method: "GET", headers: {} });
    setText("libraryName", payload.library?.name ?? "Library");
    setText("brandMark", payload.library?.logoText ?? "");
  } catch {
    // Ignore brand hydration issues on static boot.
  }
}

async function loadStudentView(highlightSeat = "") {
  const payload = await request("/api/public/layout", { method: "GET", headers: {} });
  setText("libraryName", payload.library?.name ?? "Library");
  setText("brandMark", payload.library?.logoText ?? "");
  setText("vacantCount", `Vacant: ${payload.seatSummary?.vacant ?? "-"}`);
  setText("occupiedCount", `Occupied: ${payload.seatSummary?.occupied ?? "-"}`);
  setLastUpdated(new Date());
  renderSeatLayout("seatLayout", payload.layout || [], { highlightSeat, animateSeat: animateSeatNumber });
}

async function bootStudent() {
  applyTheme(getStoredTheme());
  await loadStudentView();
  attachSearch("seatSearch", (seat) => loadStudentView(seat));
  const themeButton = document.getElementById("themeToggle");
  themeButton?.addEventListener("click", () => {
    const nextTheme = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  if (studentAutoRefreshTimer) {
    window.clearInterval(studentAutoRefreshTimer);
  }
  studentAutoRefreshTimer = window.setInterval(() => {
    const currentSearch = document.getElementById("seatSearch")?.value || "";
    loadStudentView(currentSearch).catch(() => {});
  }, 10000);
}

function openSeatModal(cell) {
  selectedSeat = cell;
  setText("seatModalTitle", `Seat ${cell.seatNumber}`);
  setText("seatModalStatus", `Current Status: ${cell.status}`);
  document.getElementById("seatModalToggle").textContent =
    cell.status === "VACANT" ? "Mark Occupied" : "Mark Vacant";
  document.getElementById("seatModal").classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

async function loadAdminDashboard(highlightSeat = "", animatedSeat = "") {
  const payload = await request("/api/admin/dashboard", { method: "GET", headers: {} });
  adminLayoutCache = payload.layout || [];
  setText("libraryName", payload.library?.name ?? "Library");
  setText("brandMark", payload.library?.logoText ?? "");
  setText("adminOccupiedCount", `Occupied: ${payload.seatSummary?.occupied ?? "-"}`);
  setText("adminVacantCount", `Vacant: ${payload.seatSummary?.vacant ?? "-"}`);
  setText("adminUserName", `Welcome, ${payload.user?.name ?? "Librarian"}`);
  setLastUpdated(new Date());
  renderActivityLog(payload.activityLog || []);
  renderSeatLayout("adminSeatLayout", payload.layout || [], {
    clickable: true,
    onSeatClick: openSeatModal,
    highlightSeat,
    animateSeat: animatedSeat,
  });
}

async function bootAdmin() {
  applyTheme(getStoredTheme());
  const loginCard = document.getElementById("adminLoginCard");
  const dashboard = document.getElementById("adminDashboard");
  const loginForm = document.getElementById("adminLoginForm");

  const themeButton = document.getElementById("themeToggle");
  themeButton?.addEventListener("click", () => {
    const nextTheme = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  async function openDashboard() {
    loginCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    await loadAdminDashboard();

    if (adminAutoRefreshTimer) {
      window.clearInterval(adminAutoRefreshTimer);
    }
    adminAutoRefreshTimer = window.setInterval(() => {
      const currentSearch = document.getElementById("adminSeatSearch")?.value || "";
      loadAdminDashboard(currentSearch).catch(() => {});
    }, 15000);
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const payload = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
          role: "ADMIN",
        }),
      });
      setToken(payload.token);
      await openDashboard();
    } catch (error) {
      showErrorToast(error.message);
    }
  });

  if (getToken()) {
    try {
      await openDashboard();
    } catch {
      setToken("");
    }
  }

  document.getElementById("closeSeatModal")?.addEventListener("click", () => {
    closeModal("seatModal");
  });

  document.getElementById("seatModalToggle")?.addEventListener("click", async () => {
    if (!selectedSeat) {
      return;
    }

    const nextStatus = selectedSeat.status === "VACANT" ? "OCCUPIED" : "VACANT";
    try {
      const payload = await request(`/api/admin/seats/${selectedSeat.seatNumber}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      closeModal("seatModal");
      setUndoState(payload.undo);
      showToast(`✓ ${payload.message}`, {
        duration: 5000,
        onUndo: async () => {
          if (!pendingUndo) {
            return;
          }

          try {
            const undoPayload = await request("/api/admin/undo-last", { method: "POST" });
            showToast(`↺ ${undoPayload.message}`);
            setUndoState(undoPayload.undo);
            const currentSearch = document.getElementById("adminSeatSearch")?.value || "";
            animateSeatNumber = pendingUndo?.seatNumber || selectedSeat.seatNumber;
            await loadAdminDashboard(currentSearch, animateSeatNumber);
            animateSeatNumber = null;
          } catch (error) {
            showErrorToast(error.message);
          }
        },
      });
      animateSeatNumber = selectedSeat.seatNumber;
      const currentSearch = document.getElementById("adminSeatSearch")?.value || "";
      await loadAdminDashboard(currentSearch, selectedSeat.seatNumber);
      animateSeatNumber = null;
    } catch (error) {
      showErrorToast(error.message);
    }
  });

  document.getElementById("refreshAdmin")?.addEventListener("click", async () => {
    const currentSearch = document.getElementById("adminSeatSearch")?.value || "";
    try {
      await loadAdminDashboard(currentSearch);
    } catch (error) {
      showErrorToast(error.message);
    }
  });

  document.getElementById("logoutAdmin")?.addEventListener("click", () => {
    setToken("");
    window.location.reload();
  });

  document.getElementById("openSettingsPanel")?.addEventListener("click", () => {
    document.getElementById("settingsModal").classList.remove("hidden");
  });

  document.getElementById("toggleActivityCenter")?.addEventListener("click", () => {
    const panel = document.getElementById("activityCenterSection");
    const toggleButton = document.getElementById("toggleActivityCenter");
    if (!panel || !toggleButton) {
      return;
    }

    panel.classList.toggle("hidden");
    toggleButton.textContent = panel.classList.contains("hidden")
      ? "Open Activity Center"
      : "Hide Activity Center";
  });

  document.getElementById("closeActivityCenter")?.addEventListener("click", () => {
    const panel = document.getElementById("activityCenterSection");
    const toggleButton = document.getElementById("toggleActivityCenter");
    if (!panel || !toggleButton) {
      return;
    }

    panel.classList.add("hidden");
    toggleButton.textContent = "Open Activity Center";
  });

  document.getElementById("closeSettingsPanel")?.addEventListener("click", () => {
    closeModal("settingsModal");
  });

  // Changing the password invalidates the reason to keep the current
  // session around. We show a success toast, then clear the token and
  // reload shortly after so the person has to log back in with the new
  // password rather than silently staying signed in on the old one.
  document.getElementById("changePasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const formData = new FormData(formEl);

    // Whatever happens here — success, or the server's known "snag" after
    // the change already applied — the person gets sent back to login.
    // That's the one outcome that's always safe: if the password actually
    // changed, they sign in with the new one; if it didn't, the old one
    // still works.
    let message = "Redirecting to login…";
    try {
      const payload = await request("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: formData.get("currentPassword"),
          newPassword: formData.get("newPassword"),
        }),
      });
      message = `${payload.message || "Password changed."} Redirecting to login…`;
    } catch (error) {
      message = isTechnicalErrorMessage(error.message)
        ? "Password update sent. Redirecting to login — try your new password first, then your old one if that fails."
        : `${friendlyErrorMessage(error.message, "Could not confirm the change.")} Redirecting to login…`;
    }

    formEl.reset();
    setToken("");
    showToast(message, { duration: 1500 });
    window.setTimeout(() => {
      window.location.href = window.location.pathname;
    }, 1500);
  });

  document.getElementById("librarySettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const formData = new FormData(formEl);

    try {
      const payload = await request("/api/admin/library", {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("libraryName"),
          logoText: formData.get("logoText"),
        }),
      });
      showToast(payload.message || "Library info updated.");
      formEl.reset();
      closeModal("settingsModal");
      await loadAdminDashboard();
    } catch (error) {
      formEl.reset();
      if (isTechnicalErrorMessage(error.message)) {
        showErrorToast(
          "The server hit a snag confirming that update. Refreshing to show the current info — try again if it didn't change."
        );
        closeModal("settingsModal");
        try {
          await loadAdminDashboard();
        } catch {
          // Nothing more we can do client-side if the refresh also fails.
        }
      } else {
        showErrorToast(
          friendlyErrorMessage(error.message, "Could not update the library info. Please try again.")
        );
      }
    }
  });

  document.getElementById("resetSeatsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const formData = new FormData(formEl);

    try {
      const payload = await request("/api/admin/reset-seats", {
        method: "POST",
        body: JSON.stringify({
          resetKey: formData.get("resetKey"),
        }),
      });
      showToast(payload.message || "Seats have been reset.");
      formEl.reset();
      closeModal("settingsModal");
      await loadAdminDashboard();
    } catch (error) {
      formEl.reset();
      if (isTechnicalErrorMessage(error.message)) {
        showErrorToast(
          "The server hit a snag confirming that. Refreshing the seat layout — check whether the reset went through and try again if it didn't."
        );
        closeModal("settingsModal");
        try {
          await loadAdminDashboard();
        } catch {
          // Nothing more we can do client-side if the refresh also fails.
        }
      } else {
        showErrorToast(
          friendlyErrorMessage(error.message, "That reset key was rejected. Please double-check it and try again.")
        );
      }
    }
  });

  attachSearch("adminSeatSearch", (seat) => {
    renderSeatLayout("adminSeatLayout", adminLayoutCache, {
      clickable: true,
      onSeatClick: openSeatModal,
      highlightSeat: seat,
      animateSeat: animateSeatNumber,
    });
  });
}

async function loadSuperAdminDashboard() {
  const payload = await request("/api/super-admin/dashboard", {
    method: "GET",
    headers: {},
  });

  setText("libraryName", payload.library?.name ?? "Library");
  setText("brandMark", payload.library?.logoText ?? "");
  setText("superAdminOccupiedCount", `Occupied: ${payload.seatSummary?.occupied ?? "-"}`);
  setText("superAdminVacantCount", `Vacant: ${payload.seatSummary?.vacant ?? "-"}`);
  const admins = payload.admins || [];
  setText("adminCount", `Librarians: ${admins.length}`);

  const adminList = document.getElementById("adminList");
  adminList.innerHTML = "";

  admins.forEach((admin) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <strong>${admin.name}</strong>
        <p>Username: ${admin.username || "-"}</p>
      </div>
      <div>
        <span class="status-tag ${admin.active ? "" : "inactive"}">
          ${admin.active ? "Active" : "Disabled"}
        </span>
      </div>
      <div class="admin-actions">
        <button class="secondary-btn" data-action="toggle" data-id="${admin.id}">
          ${admin.active ? "Disable" : "Enable"}
        </button>
        <button class="secondary-btn" data-action="reset" data-id="${admin.id}">Reset Password</button>
        <button class="secondary-btn" data-action="username" data-id="${admin.id}">Change Username</button>
        <button class="secondary-btn" data-action="delete" data-id="${admin.id}">Delete</button>
      </div>
    `;
    adminList.appendChild(row);
  });
}

async function bootSuperAdmin() {
  const loginCard = document.getElementById("superAdminLoginCard");
  const dashboard = document.getElementById("superAdminDashboard");
  const loginForm = document.getElementById("superAdminLoginForm");

  async function openDashboard() {
    loginCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    await loadSuperAdminDashboard();
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const payload = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
          role: "SUPER_ADMIN",
        }),
      });
      setToken(payload.token);
      await openDashboard();
    } catch (error) {
      showErrorToast(error.message);
    }
  });

  if (getToken()) {
    try {
      await openDashboard();
    } catch {
      setToken("");
    }
  }

  document.getElementById("logoutSuperAdmin")?.addEventListener("click", () => {
    setToken("");
    window.location.reload();
  });

  document.getElementById("createAdminForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      await request("/api/super-admin/admins", {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("name"),
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });
      event.currentTarget.reset();
      await loadSuperAdminDashboard();
    } catch (error) {
      showErrorToast(error.message);
    }
  });

  document.getElementById("librarySettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      await request("/api/super-admin/library", {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("name"),
          logoText: formData.get("logoText"),
          resetKey: formData.get("resetKey"),
        }),
      });
      await loadSuperAdminDashboard();
    } catch (error) {
      showErrorToast(error.message);
    }
  });

  document.getElementById("adminList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const adminId = button.dataset.id;

    try {
      if (action === "toggle") {
        await request(`/api/super-admin/admins/${adminId}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "toggle-active" }),
        });
      } else if (action === "reset") {
        const password = window.prompt(
          "Enter a new password. It must include upper, lower, and a number."
        );
        if (!password) {
          return;
        }
        await request(`/api/super-admin/admins/${adminId}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "reset-password", password }),
        });
      } else if (action === "username") {
        const username = window.prompt("Enter the new librarian username.");
        if (!username) {
          return;
        }
        await request(`/api/super-admin/admins/${adminId}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "change-username", username }),
        });
      } else if (action === "delete") {
        const confirmed = window.confirm("Delete this librarian account?");
        if (!confirmed) {
          return;
        }
        await request(`/api/super-admin/admins/${adminId}`, {
          method: "DELETE",
          headers: {},
        });
      }

      await loadSuperAdminDashboard();
    } catch (error) {
      showErrorToast(error.message);
    }
  });
}

hydrateBrand();

if (page === "student") {
  bootStudent().catch((error) => showErrorToast(error.message));
}

if (page === "admin") {
  bootAdmin().catch((error) => showErrorToast(error.message));
}

if (page === "super-admin") {
  bootSuperAdmin().catch((error) => showErrorToast(error.message));
}