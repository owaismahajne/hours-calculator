// Hours Calculator — all math is done in whole minutes to avoid rounding errors.

const STORAGE_KEY = "hoursCalc.v1";
const CURRENCIES = ["$", "€", "₪"];
const DEFAULT_SETTINGS = {
  rate: 15, currency: "$", breakPaid: false,
  otMode: "time", otTime: "17:00", otAfter: 8, otPercent: 150,
  periodView: "week", weekStart: 0,
};

const $ = (id) => document.getElementById(id);

let state = load();
let editingId = null;

// ---------- Storage ----------
function load() {
  const fallback = { shifts: [], running: null, settings: { ...DEFAULT_SETTINGS } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.shifts)) {
      const old = saved.settings || {};
      const settings = { ...DEFAULT_SETTINGS, ...old };
      // Older versions stored the overtime rate as a multiplier (1.5) and had no mode.
      if (old.otPercent == null && old.otMult != null) settings.otPercent = Math.round(old.otMult * 100);
      if (old.otMode == null) settings.otMode = "hours";
      delete settings.otMult;
      if (!CURRENCIES.includes(settings.currency)) settings.currency = "$";
      return { shifts: saved.shifts, running: saved.running || null, settings };
    }
  } catch (e) { /* ignore broken storage */ }
  return fallback;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- Math ----------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Length of a shift in minutes. If end is at or before start, the shift ran past midnight.
function spanMinutes(start, end) {
  let span = toMinutes(end) - toMinutes(start);
  if (span <= 0) span += 24 * 60;
  return span;
}

// Splits one shift into regular and overtime minutes.
// usedToday = minutes already worked earlier the same day (only used in "hours" mode).
function splitShift(shift, settings, usedToday) {
  const span = spanMinutes(shift.start, shift.end);
  // A paid break counts as work time, so nothing is taken off.
  const unpaidBreak = settings.breakPaid ? 0 : shift.breakMin;
  const worked = Math.max(0, span - unpaidBreak);

  if (settings.otMode === "time") {
    // Everything from the overtime hour onward (on the shift's start day, running
    // past midnight if the shift does) is overtime. Unpaid breaks come out of regular time first.
    const otStartsAfter = Math.max(0, toMinutes(settings.otTime) - toMinutes(shift.start));
    const grossOvertime = Math.max(0, span - otStartsAfter);
    const grossRegular = span - grossOvertime;
    const regular = Math.max(0, grossRegular - unpaidBreak);
    return { worked, regular, overtime: worked - regular };
  }

  if (settings.otMode === "hours" && settings.otAfter > 0) {
    const limit = Math.round(settings.otAfter * 60);
    const regular = Math.max(0, Math.min(worked, limit - usedToday));
    return { worked, regular, overtime: worked - regular };
  }

  return { worked, regular: worked, overtime: 0 };
}

function calculate(shifts, settings) {
  const rate = settings.rate;
  const otRate = (rate * settings.otPercent) / 100;
  const sorted = [...shifts].sort((a, b) =>
    a.date === b.date ? toMinutes(a.start) - toMinutes(b.start) : a.date.localeCompare(b.date)
  );
  const usedPerDay = {};
  const rows = sorted.map((s) => {
    const used = usedPerDay[s.date] || 0;
    const { worked, regular, overtime } = splitShift(s, settings, used);
    usedPerDay[s.date] = used + worked;
    const pay = (regular * rate + overtime * otRate) / 60;
    return { shift: s, worked, regular, overtime, pay };
  });

  const totalRegular = rows.reduce((t, r) => t + r.regular, 0);
  const totalOvertime = rows.reduce((t, r) => t + r.overtime, 0);
  const regularPay = (totalRegular * rate) / 60;
  const overtimePay = (totalOvertime * otRate) / 60;

  return {
    rows,
    totalRegular,
    totalOvertime,
    totalMinutes: totalRegular + totalOvertime,
    regularPay,
    overtimePay,
    totalPay: regularPay + overtimePay,
  };
}

// ---------- Formatting ----------
const decHours = (min) => (min / 60).toFixed(2);
const hm = (min) => `${Math.floor(min / 60)}h ${min % 60}m`;
const pad = (n) => String(n).padStart(2, "0");

function money(amount) {
  const n = Math.round(amount * 100) / 100;
  return state.settings.currency + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function niceDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clockTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const today = () => isoDate(new Date());

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ---------- Rendering ----------
function render() {
  const result = calculate(state.shifts, state.settings);

  $("sumHours").textContent = decHours(result.totalMinutes);
  $("sumHoursHm").textContent = hm(result.totalMinutes);
  $("sumSplit").textContent = `${decHours(result.totalRegular)} / ${decHours(result.totalOvertime)}`;
  $("sumShifts").textContent = `${state.shifts.length} shift${state.shifts.length === 1 ? "" : "s"}`;
  $("sumPay").textContent = money(result.totalPay);
  $("sumPaySplit").textContent = `Regular ${money(result.regularPay)} · Overtime ${money(result.overtimePay)}`;

  $("shiftRows").innerHTML = result.rows
    .slice()
    .reverse() // newest first
    .map(({ shift, worked, overtime, pay }) => {
      const overnight = toMinutes(shift.end) <= toMinutes(shift.start);
      return `
        <tr class="${shift.id === editingId ? "editing" : ""}">
          <td>${niceDate(shift.date)}</td>
          <td>${shift.start} – ${shift.end}${overnight ? '<span class="tag night">overnight</span>' : ""}</td>
          <td class="num">${shift.breakMin} min${shift.breakMin > 0 ? `<span class="tag muted">${state.settings.breakPaid ? "paid" : "unpaid"}</span>` : ""}</td>
          <td class="num hours">${decHours(worked)}${overtime > 0 ? `<span class="tag">+${decHours(overtime)} OT</span>` : ""}</td>
          <td class="num pay">${money(pay)}</td>
          <td class="row-actions">
            <button class="icon-btn" data-edit="${escapeHtml(shift.id)}">Edit</button>
            <button class="icon-btn del" data-del="${escapeHtml(shift.id)}">Delete</button>
          </td>
        </tr>`;
    })
    .join("");

  $("emptyMsg").hidden = state.shifts.length > 0;
  $("clearAll").hidden = state.shifts.length === 0;
  renderPeriods(result.rows);
  renderSettings();
  renderClock();
  updatePreview();
}

// ---------- Weekly / monthly totals ----------
function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function weekStartDate(iso, weekStart) {
  const date = parseIso(iso);
  date.setDate(date.getDate() - ((date.getDay() - weekStart + 7) % 7));
  return date;
}

function periodOf(iso, view, weekStart) {
  if (view === "month") {
    const key = iso.slice(0, 7);
    const label = parseIso(key + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return { key, label };
  }
  const start = weekStartDate(iso, weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const short = { month: "short", day: "numeric" };
  const label = `${start.toLocaleDateString("en-US", short)} – ${end.toLocaleDateString("en-US", { ...short, year: "numeric" })}`;
  return { key: isoDate(start), label };
}

// Shifts are counted in the week/month of the day they started.
function renderPeriods(rows) {
  const { periodView: view, weekStart } = state.settings;
  const groups = new Map();
  rows.forEach((r) => {
    const { key, label } = periodOf(r.shift.date, view, weekStart);
    if (!groups.has(key)) groups.set(key, { key, label, count: 0, worked: 0, regular: 0, overtime: 0, pay: 0 });
    const g = groups.get(key);
    g.count += 1;
    g.worked += r.worked;
    g.regular += r.regular;
    g.overtime += r.overtime;
    g.pay += r.pay;
  });

  const currentKey = periodOf(today(), view, weekStart).key;
  const nowLabel = view === "month" ? "this month" : "this week";

  $("periodRows").innerHTML = [...groups.values()]
    .sort((a, b) => b.key.localeCompare(a.key)) // newest first
    .map((g) => `
      <tr class="${g.key === currentKey ? "current" : ""}">
        <td>${g.label}${g.key === currentKey ? `<span class="tag">${nowLabel}</span>` : ""}</td>
        <td class="num">${g.count}</td>
        <td class="num hours">${decHours(g.worked)}</td>
        <td class="num">${decHours(g.regular)}</td>
        <td class="num">${decHours(g.overtime)}</td>
        <td class="num pay">${money(g.pay)}</td>
      </tr>`)
    .join("");

  $("periodEmpty").hidden = rows.length > 0;
  $("periodHead").textContent = view === "month" ? "Month" : "Week";
  $("viewWeek").classList.toggle("active", view === "week");
  $("viewMonth").classList.toggle("active", view === "month");
  $("weekStart").hidden = view !== "week";
}

["viewWeek", "viewMonth"].forEach((id) =>
  $(id).addEventListener("click", () => {
    state.settings.periodView = $(id).dataset.view;
    save();
    render();
  })
);

function renderSettings() {
  const s = state.settings;
  $("otTimeWrap").hidden = s.otMode !== "time";
  $("otAfterWrap").hidden = s.otMode !== "hours";
  $("otRow").hidden = s.otMode === "none";
  const hint = {
    time: `Time worked from ${s.otTime} onward is paid at ${s.otPercent}%.${s.breakPaid ? "" : " Breaks are taken from regular time first."}`,
    hours: `Hours past ${s.otAfter} in one day are paid at ${s.otPercent}%.`,
    none: "All hours are paid at the normal rate.",
  };
  $("otHint").textContent = hint[s.otMode];
}

// Live preview of the shift being typed.
function updatePreview() {
  const start = $("start").value;
  const end = $("end").value;
  const breakMin = Number($("breakMin").value) || 0;
  const preview = $("preview");
  if (!start || !end) {
    preview.textContent = "Enter start and end time";
    return;
  }
  const span = spanMinutes(start, end);
  if (span - breakMin <= 0) {
    preview.textContent = "Break is longer than the shift";
    return;
  }
  const worked = state.settings.breakPaid ? span : span - breakMin;
  const overnight = toMinutes(end) <= toMinutes(start) ? " (overnight)" : "";
  const breakNote = breakMin > 0 ? (state.settings.breakPaid ? " · break paid" : " · break unpaid") : "";
  preview.textContent = `${decHours(worked)} hours · ${hm(worked)}${overnight}${breakNote}`;
}

// ---------- Shift clock ----------
function renderClock() {
  const running = state.running;
  $("startShift").disabled = !!running;
  $("endShift").disabled = !running;
  $("discardShift").hidden = !running;
  $("clockBreakWrap").hidden = !running;
  document.querySelector(".clock-card").classList.toggle("running", !!running);
  if (running) {
    const started = new Date(running.startedAt);
    $("clockStatus").textContent = `Started ${niceDate(isoDate(started))} at ${clockTime(started)}`;
  } else {
    $("clockStatus").textContent = "No shift running";
  }
  tick();
}

function tick() {
  if (!state.running) {
    $("clockTimer").textContent = "00:00:00";
    return;
  }
  const secs = Math.max(0, Math.floor((Date.now() - state.running.startedAt) / 1000));
  $("clockTimer").textContent = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
}
setInterval(tick, 1000);

$("startShift").addEventListener("click", () => {
  if (state.running) return;
  state.running = { startedAt: Date.now() };
  $("clockBreak").value = 0;
  save();
  render();
});

$("endShift").addEventListener("click", () => {
  if (!state.running) return;
  const started = new Date(state.running.startedAt);
  const now = new Date();
  const elapsedMin = (now - started) / 60000;
  const breakRaw = $("clockBreak").value.trim();
  const breakMin = breakRaw === "" ? 0 : Number(breakRaw);
  const start = clockTime(started);
  const end = clockTime(now);

  if (elapsedMin >= 24 * 60) {
    tell("This shift ran 24 hours or more. Please discard it and add the shift manually.");
    return;
  }
  if (start === end) {
    tell("The shift is shorter than a minute, so there's nothing to save yet.");
    return;
  }
  if (!Number.isInteger(breakMin) || breakMin < 0) {
    tell("Break must be a whole number of minutes (0 or more).");
    return;
  }
  if (spanMinutes(start, end) - breakMin <= 0) {
    tell("The break is longer than the shift.");
    return;
  }

  state.shifts.push({ id: newId(), date: isoDate(started), start, end, breakMin });
  state.running = null;
  save();
  render();
});

$("discardShift").addEventListener("click", async () => {
  if (!(await ask("Discard the running shift? It won't be saved.", { okText: "Discard", danger: true }))) return;
  state.running = null;
  save();
  render();
});

// ---------- Dialogs ----------
// In-page replacement for confirm()/alert(), which are blocked in some embedded pages.
function ask(message, { okText = "OK", danger = false, cancel = true } = {}) {
  return new Promise((resolve) => {
    const modal = $("modal");
    $("modalText").textContent = message;
    $("modalOk").textContent = okText;
    $("modalOk").className = "btn " + (danger ? "btn-red" : "btn-green");
    $("modalCancel").hidden = !cancel;
    modal.hidden = false;
    $("modalOk").focus();
    const done = (result) => {
      modal.hidden = true;
      $("modalOk").onclick = $("modalCancel").onclick = modal.onclick = modal.onkeydown = null;
      resolve(result);
    };
    $("modalOk").onclick = () => done(true);
    $("modalCancel").onclick = () => done(false);
    modal.onclick = (e) => { if (e.target === modal) done(false); };
    modal.onkeydown = (e) => { if (e.key === "Escape") done(false); };
  });
}

const tell = (message) => ask(message, { cancel: false });

// ---------- Manual form ----------
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function showError(msg) {
  const el = $("formError");
  el.textContent = msg;
  el.hidden = !msg;
}

function resetForm() {
  editingId = null;
  const keepDate = $("date").value;
  $("shiftForm").reset();
  $("date").value = keepDate || today();
  $("formTitle").textContent = "Add a shift manually";
  $("submitBtn").textContent = "Add shift";
  $("cancelEdit").hidden = true;
  showError("");
}

$("shiftForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const date = $("date").value;
  const start = $("start").value;
  const end = $("end").value;
  const breakRaw = $("breakMin").value.trim();
  const breakMin = breakRaw === "" ? 0 : Number(breakRaw);

  if (!date) return showError("Please pick a date.");
  if (!start || !end) return showError("Please enter both start and end time.");
  if (!Number.isInteger(breakMin) || breakMin < 0) return showError("Break must be a whole number of minutes (0 or more).");
  if (start === end) return showError("Start and end time can't be the same.");
  if (spanMinutes(start, end) - breakMin <= 0) return showError("Break is longer than the shift.");

  if (editingId) {
    const shift = state.shifts.find((s) => s.id === editingId);
    Object.assign(shift, { date, start, end, breakMin });
  } else {
    state.shifts.push({ id: newId(), date, start, end, breakMin });
  }
  save();
  resetForm();
  render();
});

$("cancelEdit").addEventListener("click", () => { resetForm(); render(); });

["start", "end", "breakMin"].forEach((id) => $(id).addEventListener("input", updatePreview));

$("shiftRows").addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) {
    const s = state.shifts.find((x) => x.id === editId);
    editingId = editId;
    $("date").value = s.date;
    $("start").value = s.start;
    $("end").value = s.end;
    $("breakMin").value = s.breakMin;
    $("formTitle").textContent = "Edit shift";
    $("submitBtn").textContent = "Save changes";
    $("cancelEdit").hidden = false;
    showError("");
    render();
    $("start").focus();
  } else if (delId) {
    if (!(await ask("Delete this shift?", { okText: "Delete", danger: true }))) return;
    state.shifts = state.shifts.filter((x) => x.id !== delId);
    if (editingId === delId) resetForm();
    save();
    render();
  }
});

$("clearAll").addEventListener("click", async () => {
  if (!(await ask("Delete ALL shifts? This can't be undone.", { okText: "Delete all", danger: true }))) return;
  state.shifts = [];
  resetForm();
  save();
  render();
});

// ---------- Settings ----------
const NUMBER_MIN = { rate: 0, otAfter: 0, otPercent: 100 };

["rate", "currency", "breakPaid", "otMode", "otTime", "otAfter", "otPercent", "weekStart"].forEach((key) => {
  const input = $(key);
  input.value = key === "breakPaid" ? (state.settings.breakPaid ? "yes" : "no") : state.settings[key];
  input.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => {
    if (key === "breakPaid") {
      state.settings.breakPaid = input.value === "yes";
    } else if (key === "weekStart") {
      state.settings.weekStart = Number(input.value);
    } else if (key in NUMBER_MIN) {
      const n = Number(input.value);
      state.settings[key] = input.value !== "" && Number.isFinite(n) && n >= NUMBER_MIN[key] ? n : NUMBER_MIN[key];
    } else if (key === "otTime") {
      if (!input.value) return; // keep the last valid hour while the field is being edited
      state.settings.otTime = input.value;
    } else {
      state.settings[key] = input.value;
    }
    save();
    render();
  });
});

// ---------- Install as an app ----------
let installPrompt = null;

// Android/desktop Chrome offer an install prompt; show our button when they do.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("installBtn").hidden = false;
});

$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").hidden = true;
});

window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; });

try {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support unavailable here */ });
  }
} catch (e) { /* some embedded pages block service workers */ }

// ---------- Start ----------
$("date").value = today();
render();
