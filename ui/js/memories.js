import * as api from "./api.js";
import { renderBanners } from "./banners.js";
import { confirmDelete } from "./confirm.js";
import { $, clear, h, keepFocus } from "./dom.js";
import { openEditor } from "./editor.js";
import { icon } from "./icons.js";
import { rowEl } from "./list.js";
import { renderSidebar } from "./sidebar.js";
import { PAGE, hasFilters, queryParams, resetFilters, savePrefs, state } from "./state.js";
import { toast } from "./toast.js";
import { openViewer } from "./viewer.js";

const els = {
  search: $("#search"),
  clear: $("#search-clear"),
  mode: $("#mode"),
  range: $("#range"),
  order: $("#order"),
  summary: $("#summary"),
  list: $("#list"),
  empty: $("#empty"),
  more: $("#more"),
};

const MODE_LABELS = { hybrid: "Hybrid", semantic: "Meaning", text: "Keyword" };

let loadSeq = 0;
/** Reloads status and the open page. Set by main.js. */
let refresh = () => {};
/** Runs after a sidebar filter is picked. Set by main.js. */
let onFilterChange = () => {};

export async function loadMemories({ append = false } = {}) {
  const seq = ++loadSeq;
  state.loading = true;
  els.list.setAttribute("aria-busy", "true");
  try {
    const r = await api.listMemories(queryParams(append ? state.items.length : 0));
    if (seq !== loadSeq) return;
    state.items = append ? [...state.items, ...r.items] : r.items;
    state.total = r.total;
    state.modeUsed = r.modeUsed;
    state.note = r.note;
    state.error = null;
  } catch (err) {
    if (seq !== loadSeq) return;
    state.error = err.message;
  }
  state.loading = false;
  els.list.removeAttribute("aria-busy");
  renderResults();
}

/** Brings the search box and selects in line with state, after filters change from outside. */
export function syncControls() {
  els.search.value = state.query;
  els.clear.hidden = state.query === "";
  els.range.value = state.range;
  els.order.value = state.order;
}

export function clearFilters() {
  resetFilters();
  syncControls();
  renderSidebar(onFilterChange);
  loadMemories();
}

function renderResults() {
  renderBanners(refresh);
  const searching = state.query !== "";
  const noun = (n) => `${n} ${searching ? "result" : "memor"}${searching ? (n === 1 ? "" : "s") : n === 1 ? "y" : "ies"}`;

  clear(els.summary).append(h("span", {}, state.loading && !state.items.length ? "Loading" : noun(state.total)));
  if (searching && state.modeUsed && state.modeUsed !== state.mode && state.note) {
    els.summary.append(h("span", { class: "chip", title: state.note }, icon("info", 12), `${MODE_LABELS[state.modeUsed]} results only`));
  }
  if (hasFilters()) els.summary.append(h("button", { class: "btn btn-link", type: "button", "data-key": "clear-filters", onclick: clearFilters }, "Clear filters"));
  els.order.hidden = searching;
  els.mode.hidden = !searching;

  const handlers = { onOpen: view, onEdit: edit, onPin: pin, onDelete: remove };
  clear(els.list).append(...state.items.map((m) => rowEl(m, handlers)));

  clear(els.empty);
  if (!state.items.length && !state.loading && !state.error) {
    els.empty.append(
      h(
        "div",
        { class: "empty" },
        h("p", {}, searching || hasFilters() ? "Nothing matches." : "No memories yet."),
        searching || hasFilters()
          ? h("button", { class: "btn", type: "button", onclick: clearFilters }, "Clear filters")
          : h("button", { class: "btn btn-primary", type: "button", onclick: add }, icon("plus", 16), "New memory"),
      ),
    );
  }

  clear(els.more);
  if (!searching && state.items.length < state.total) {
    els.more.append(h("button", { class: "btn", type: "button", onclick: () => loadMemories({ append: true }) }, `Show more (${state.total - state.items.length} left)`));
  } else if (searching && state.total >= PAGE) {
    els.more.append(h("span", { class: "fine" }, `Top ${PAGE} shown`));
  }
}

function renderMode() {
  clear(els.mode).append(
    ...Object.entries(MODE_LABELS).map(([value, label]) =>
      h("button", { type: "button", "aria-pressed": state.mode === value ? "true" : "false", onclick: () => ((state.mode = value), savePrefs(), renderMode(), loadMemories()) }, label),
    ),
  );
}

/* Actions */

const editorContext = () => ({
  categories: state.status?.categories ?? [],
  projects: state.status?.projects ?? [],
  currentProject: state.status?.currentProject ?? null,
  onSaved: (result, isNew) => {
    toast(isNew ? `Saved #${result.memory.id}.` : "Saved.", { kind: "success" });
    if (result.similar?.length) toast(`Similar to ${result.similar.map((s) => `#${s.memory.id}`).join(", ")}. You may want to merge them.`);
    if (result.warning) toast(result.warning, { kind: "error" });
    refresh();
  },
  onDelete: remove,
  onPin: pin,
});

export const add = () => openEditor(editorContext(), null);
const edit = (memory) => openEditor(editorContext(), memory);
const view = (memory) => openViewer(editorContext(), memory);

async function pin(memory) {
  try {
    const { memory: updated } = await api.updateMemory(memory.id, { pinned: !memory.pinned });
    if (state.pinned) return refresh();
    const i = state.items.findIndex((m) => m.id === memory.id);
    if (i >= 0) state.items[i] = updated;
    keepFocus(renderResults);
  } catch (err) {
    toast(err.message, { kind: "error" });
  }
}

async function remove(memory) {
  if (!(await confirmDelete(memory))) return;
  try {
    await api.deleteMemory(memory.id);
    $("#editor").close();
    toast(`Deleted #${memory.id}.`);
    refresh();
  } catch (err) {
    toast(err.message, { kind: "error" });
  }
}

/* Wiring */

let timer;
function onSearchInput() {
  els.clear.hidden = els.search.value === "";
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.query = els.search.value.trim();
    loadMemories();
  }, 220);
}

/** Hooks up the search box and selects. Call once. */
export function initMemories(hooks) {
  ({ refresh, onFilterChange } = hooks);
  els.search.addEventListener("input", onSearchInput);
  els.search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.search.value) {
      els.search.value = "";
      onSearchInput();
    }
  });
  els.clear.addEventListener("click", () => {
    els.search.value = "";
    onSearchInput();
    els.search.focus();
  });
  els.range.addEventListener("change", () => ((state.range = els.range.value), loadMemories()));
  els.order.addEventListener("change", () => ((state.order = els.order.value), savePrefs(), loadMemories()));
  syncControls();
  renderMode();
}
