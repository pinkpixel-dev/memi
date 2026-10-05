import * as api from "./api.js";
import { confirmDelete } from "./confirm.js";
import { $, clear, copyText, h, hydrateIcons, keepFocus } from "./dom.js";
import { openEditor } from "./editor.js";
import { icon } from "./icons.js";
import { rowEl } from "./list.js";
import { renderSidebar } from "./sidebar.js";
import { PAGE, hasFilters, queryParams, savePrefs, state } from "./state.js";
import { toast } from "./toast.js";

const els = {
  sidebar: $("#sidebar"),
  backdrop: $("#backdrop"),
  drawerOpen: $("#drawer-open"),
  search: $("#search"),
  clear: $("#search-clear"),
  mode: $("#mode"),
  order: $("#order"),
  summary: $("#summary"),
  banners: $("#banners"),
  list: $("#list"),
  empty: $("#empty"),
  more: $("#more"),
};

const phone = matchMedia("(max-width: 899px)");
let loadSeq = 0;

/* Drawer (phones only) */

function setDrawer(open) {
  els.sidebar.classList.toggle("open", open);
  els.backdrop.classList.toggle("open", open);
  els.drawerOpen.setAttribute("aria-expanded", String(open));
  els.sidebar.inert = phone.matches && !open;
  if (open) els.sidebar.querySelector("button, input")?.focus();
}
phone.addEventListener("change", () => setDrawer(false));

/* Loading */

async function loadStatus() {
  try {
    state.status = await api.getStatus();
    keepFocus(() => renderSidebar(onFilterChange));
    renderBanners();
  } catch (err) {
    state.error = err.message;
    renderResults();
  }
}

async function loadMemories({ append = false } = {}) {
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

const refresh = () => Promise.all([loadStatus(), loadMemories()]);

function onFilterChange() {
  if (phone.matches) setDrawer(false);
  keepFocus(() => renderSidebar(onFilterChange));
  loadMemories();
}

function clearFilters() {
  Object.assign(state, { query: "", scope: { kind: "all", project: null }, category: "", minImportance: 0, pinned: false });
  els.search.value = "";
  els.clear.hidden = true;
  renderSidebar(onFilterChange);
  loadMemories();
}

/* Rendering */

const MODE_LABELS = { hybrid: "Hybrid", semantic: "Meaning", text: "Keyword" };

function renderBanners() {
  clear(els.banners);
  const s = state.status;
  if (state.error) {
    els.banners.append(
      h("div", { class: "banner error", role: "alert" }, icon("triangle-alert"), h("span", { class: "text" }, state.error), h("button", { class: "btn", type: "button", onclick: refresh }, "Retry")),
    );
  }
  if (!s) return;
  const command = (text) =>
    h("code", {}, text, h("button", { class: "btn btn-icon", type: "button", title: "Copy command", "aria-label": `Copy ${text}`, onclick: async (e) => ((await copyText(text)) ? toast("Copied.", { kind: "success", ms: 1800 }) : toast("Couldn't copy. Select it instead.", { kind: "error" })) }, icon("copy", 14)));
  if (s.state.status === "mismatch") {
    const { provider, model } = s.state.stored;
    els.banners.append(
      h("div", { class: "banner", title: s.warning }, icon("triangle-alert"), h("span", { class: "text" }, `Embedder changed from ${provider}/${model}. Semantic search is off. Memories are kept. Run`), command("memi reindex")),
    );
  } else if (s.state.status === "ok" && s.vectors < s.total) {
    els.banners.append(h("div", { class: "banner" }, icon("info"), h("span", { class: "text" }, `${s.total - s.vectors} memories have no vector yet. Run`), command("memi reindex --missing")));
  }
}

function renderResults() {
  renderBanners();
  const searching = state.query !== "";
  const noun = (n) => `${n} ${searching ? "result" : "memor"}${searching ? (n === 1 ? "" : "s") : n === 1 ? "y" : "ies"}`;

  clear(els.summary).append(h("span", {}, state.loading && !state.items.length ? "Loading" : noun(state.total)));
  if (searching && state.modeUsed && state.modeUsed !== state.mode && state.note) {
    els.summary.append(h("span", { class: "chip", title: state.note }, icon("info", 12), `${MODE_LABELS[state.modeUsed]} results only`));
  }
  els.order.hidden = searching;
  els.mode.hidden = !searching;

  clear(els.list);
  const handlers = { onEdit: edit, onPin: pin, onDelete: remove };
  els.list.append(...state.items.map((m) => rowEl(m, handlers)));

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
});

const add = () => openEditor(editorContext(), null);
const edit = (memory) => openEditor(editorContext(), memory);

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
els.order.value = state.order;
els.order.addEventListener("change", () => ((state.order = els.order.value), savePrefs(), loadMemories()));
$("#new").addEventListener("click", add);
els.drawerOpen.addEventListener("click", () => setDrawer(true));
$("#drawer-close").addEventListener("click", () => (setDrawer(false), els.drawerOpen.focus()));
els.backdrop.addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.sidebar.classList.contains("open")) return (setDrawer(false), els.drawerOpen.focus());
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (e.key === "/") (e.preventDefault(), els.search.focus());
  else if (e.key === "n") (e.preventDefault(), add());
});

hydrateIcons();
renderMode();
setDrawer(false);
refresh();
