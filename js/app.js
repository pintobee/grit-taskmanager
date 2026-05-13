/**
 * Grit — tasks with localStorage + optional seed from js/task.json
 */

const STORAGE_KEY = "taskManagerData";
/** Avoid re-importing task.json after user clears the list on purpose. */
const JSON_IMPORT_FLAG = "grit.importedTaskJson";

export const dom = {
  sidebarNav: document.getElementById("sidebar-nav"),
  taskList: document.getElementById("task-list"),
  addTaskBtn: document.getElementById("add-task-btn"),
  pageTitle: document.getElementById("page-title"),
  pageIcon: document.getElementById("page-icon"),
};

/** Which sidebar list is active — drives row visibility. */
let activeView =
  dom.sidebarNav?.querySelector(".nav-item.is-active")?.dataset?.view || "inbox";

/** Calendar-today match for `.task-date` (ISO `YYYY-MM-DD` or locale string). */
function rowCreatedOnCalendarToday(row) {
  const raw = row.querySelector(".task-date")?.textContent?.trim() || "";
  const now = new Date();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    return now.getFullYear() === y && now.getMonth() === mo && now.getDate() === d;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return (
      parsed.getFullYear() === now.getFullYear() &&
      parsed.getMonth() === now.getMonth() &&
      parsed.getDate() === now.getDate()
    );
  }
  return raw === formatToday();
}

function applyViewFilter() {
  const list = document.getElementById("task-list") ?? dom.taskList;
  if (!list) return;
  const rows = list.querySelectorAll(".task-row");
  let visibleCount = 0;

  for (const row of rows) {
    const completed = row.querySelector(".task-row__checkbox")?.checked ?? false;
    let show = true;
    if (activeView === "inbox") show = !completed;
    else if (activeView === "done") show = completed;
    else if (activeView === "today") show = rowCreatedOnCalendarToday(row);

    row.classList.toggle("task-row--filtered-out", !show);
    if (show) visibleCount += 1;
  }

  updateFilterEmptyState(visibleCount, rows.length);
}

function updateFilterEmptyState(visibleCount, totalRows) {
  const el = document.getElementById("filter-empty");
  if (!el) return;
  if (totalRows === 0) {
    el.hidden = true;
    return;
  }
  if (visibleCount === 0) {
    const copy =
      activeView === "inbox"
        ? "No open tasks in Inbox. Completed tasks are in Done."
        : activeView === "done"
          ? "No completed tasks yet. Check off a task or switch to Inbox."
          : "Nothing for Today. Tasks show here when their date matches today.";
    el.textContent = copy;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

/** @returns {{ tasks: Array<{ id: string, title: string, description?: string, completed: boolean, createdAt?: string, updatedAt?: string }> }} */
function getTaskManagerData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tasks: [] };
    const parsed = JSON.parse(raw);
    if (!parsed) return { tasks: [] };
    let tasks = parsed.tasks;
    if (!Array.isArray(tasks) && parsed.taskManagerData?.tasks) {
      tasks = parsed.taskManagerData.tasks;
    }
    if (!Array.isArray(tasks)) return { tasks: [] };
    return { tasks };
  } catch {
    return { tasks: [] };
  }
}

/** @param {{ tasks: object[] }} data */
function setTaskManagerData(data) {
  try {
    const payload = JSON.stringify({ tasks: data.tasks });
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

function formatToday() {
  return new Date().toLocaleDateString();
}

function formatTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** @param {HTMLLIElement} row */
function rowToTask(row) {
  const title = row.querySelector(".task-row__text")?.textContent?.trim() ?? "";
  const completed = row.querySelector(".task-row__checkbox")?.checked ?? false;
  const createdAt =
    row.querySelector(".task-date")?.textContent?.trim() || formatToday();
  return {
    id: row.dataset.taskId || `task-${Date.now()}`,
    title,
    description: row.dataset.description || "",
    completed,
    createdAt,
    updatedAt: formatTodayIso(),
  };
}

let saveStatusTimer = 0;

function showSavedStatus() {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = "Saved";
  el.hidden = false;
  el.removeAttribute("data-error");
  window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 1600);
}

function showSaveError() {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = "Could not save (storage blocked or full). Tasks may not persist after refresh.";
  el.hidden = false;
  el.dataset.error = "1";
  window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

function persistFromDom(options = {}) {
  const list = document.getElementById("task-list") ?? dom.taskList;
  if (!list) return;
  const tasks = [...list.querySelectorAll(".task-row")].map(rowToTask);
  const ok = setTaskManagerData({ tasks });
  if (!ok) {
    showSaveError();
    return;
  }
  if (!options.silent) showSavedStatus();
  applyViewFilter();
}

function renderFromStorage() {
  const list = document.getElementById("task-list") ?? dom.taskList;
  if (!list) return;
  const { tasks } = getTaskManagerData();
  list.replaceChildren();
  for (const t of tasks) {
    list.appendChild(
      createTaskRowElement({
        id: t.id,
        title: t.title ?? t.text ?? "",
        description: t.description ?? "",
        completed: !!t.completed,
        createdAt: t.createdAt || formatToday(),
      }),
    );
  }
  applyViewFilter();
}

async function maybeSeedFromTaskJson() {
  const { tasks } = getTaskManagerData();
  if (tasks.length > 0) return;
  if (localStorage.getItem(JSON_IMPORT_FLAG)) return;
  try {
    const res = await fetch("js/task.json", { cache: "no-store" });
    if (!res.ok) return;
    const root = await res.json();
    const inner = root.taskManagerData ?? root;
    if (inner && Array.isArray(inner.tasks) && inner.tasks.length > 0) {
      if (!setTaskManagerData({ tasks: inner.tasks })) return;
      localStorage.setItem(JSON_IMPORT_FLAG, "1");
    }
  } catch {
    /* missing file or invalid JSON */
  }
}

/** @param {string} viewId */
export function setActiveView(viewId) {
  activeView = viewId;
  dom.sidebarNav?.querySelectorAll(".nav-item").forEach((btn) => {
    const on = btn.dataset.view === viewId;
    btn.classList.toggle("is-active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  applyViewFilter();
}

/**
 * @param {{ id?: string, title?: string, description?: string, completed?: boolean, createdAt?: string }} [opts]
 * @returns {HTMLLIElement}
 */
export function createTaskRowElement(opts = {}) {
  const id = opts.id ?? `task-${crypto.randomUUID?.() ?? Date.now()}`;
  const title = opts.title ?? "";
  const description = opts.description ?? "";
  const completed = !!opts.completed;
  const createdAt = opts.createdAt?.trim() || formatToday();

  const li = document.createElement("li");
  li.className = "task-row";
  li.dataset.taskId = id;
  if (description) li.dataset.description = description;

  li.innerHTML = `
    <label class="task-row__check">
      <input type="checkbox" class="task-row__checkbox"${completed ? " checked" : ""} />
      <span class="task-row__check-ui" aria-hidden="true"></span>
    </label>
    <div class="task-row__body">
      <span class="task-row__text" contenteditable="true" spellcheck="false"></span>
      <span class="task-date"></span>
    </div>
    <div class="task-row__actions">
      <button type="button" class="task-row__btn task-row__btn--edit" aria-label="Edit task" title="Edit">
        <svg class="task-row__btn-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button type="button" class="task-row__btn task-row__btn--remove task_remove_btn" aria-label="Remove task" title="Remove">
        <svg class="task-row__btn-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>
  `;

  if (completed) li.classList.add("is-done");

  const checkbox = li.querySelector(".task-row__checkbox");
  const textEl = li.querySelector(".task-row__text");
  const dateEl = li.querySelector(".task-date");

  if (textEl) textEl.textContent = title;
  if (dateEl) dateEl.textContent = createdAt;

  checkbox?.addEventListener("change", () => {
    li.classList.toggle("is-done", checkbox.checked);
    persistFromDom();
  });

  textEl?.addEventListener("input", () => persistFromDom({ silent: true }));
  textEl?.addEventListener("blur", () => persistFromDom());

  return li;
}

dom.addTaskBtn?.addEventListener("click", () => {
  const list = document.getElementById("task-list") ?? dom.taskList;
  const row = createTaskRowElement({
    title: "",
    completed: false,
    createdAt: formatToday(),
  });
  list?.appendChild(row);
  persistFromDom();
  row.querySelector(".task-row__text")?.focus();
});

dom.sidebarNav?.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn || !btn.dataset.view) return;
  setActiveView(btn.dataset.view);
});

dom.taskList?.addEventListener("click", (e) => {
  const list = document.getElementById("task-list") ?? dom.taskList;
  if (!list) return;

  const editBtn = e.target.closest(".task-row__btn--edit");
  if (editBtn && list.contains(editBtn)) {
    const row = editBtn.closest(".task-row");
    row?.querySelector(".task-row__text")?.focus();
    return;
  }

  const removeBtn = e.target.closest(".task_remove_btn");
  if (!removeBtn || !list.contains(removeBtn)) return;
  const row = removeBtn.closest(".task-row");
  if (!row || !list.contains(row)) return;
  row.remove();
  persistFromDom();
});

/** Flush edits if the tab closes or reloads before blur. */
function flushPersist() {
  persistFromDom({ silent: true });
}

window.addEventListener("pagehide", flushPersist);
window.addEventListener("beforeunload", flushPersist);

async function init() {
  await maybeSeedFromTaskJson();
  renderFromStorage();
  /* Ensure first paint matches default Inbox filter + empty hint. */
  const defaultView =
    dom.sidebarNav?.querySelector(".nav-item.is-active")?.dataset?.view || "inbox";
  setActiveView(defaultView);
}
