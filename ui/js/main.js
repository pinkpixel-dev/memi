import * as api from "./api.js";
import { renderBanners } from "./banners.js";
import { loadDashboard } from "./dashboard.js";
import { $, hydrateIcons, keepFocus } from "./dom.js";
import { add, initMemories, loadMemories, syncControls } from "./memories.js";
import { renderSidebar } from "./sidebar.js";
import { resetFilters, state } from "./state.js";

const els = {
  sidebar: $("#sidebar"),
  backdrop: $("#backdrop"),
  drawerOpen: $("#drawer-open"),
  search: $("#search"),
};

const phone = matchMedia("(max-width: 899px)");
const TITLES = { dashboard: "Dashboard", memories: "Memories" };

/* Drawer (phones only) */

function setDrawer(open) {
  els.sidebar.classList.toggle("open", open);
  els.backdrop.classList.toggle("open", open);
  els.drawerOpen.setAttribute("aria-expanded", String(open));
  els.sidebar.inert = phone.matches && !open;
  if (open) els.sidebar.querySelector("a, button, input")?.focus();
}
phone.addEventListener("change", () => setDrawer(false));

/* Loading */

async function loadStatus() {
  try {
    state.status = await api.getStatus();
    $("#nav-total").textContent = String(state.status.total);
    keepFocus(() => renderSidebar(onFilterChange));
    renderBanners(refresh);
  } catch (err) {
    state.error = err.message;
    renderBanners(refresh);
  }
}

const loadPage = () => (state.route === "memories" ? loadMemories() : loadDashboard(links));
const refresh = () => Promise.all([loadStatus(), loadPage()]);

function onFilterChange() {
  if (phone.matches) setDrawer(false);
  keepFocus(() => renderSidebar(onFilterChange));
  loadMemories();
}

/* Pages */

/** Dashboard rows jump to the memories page with one filter applied. */
const links = {
  toProject: (project) => showMemories({ scope: project === null ? { kind: "global", project: null } : { kind: "project", project } }),
  toCategory: (category) => showMemories({ category }),
};

function showMemories(filters) {
  resetFilters();
  Object.assign(state, filters);
  syncControls();
  go("memories");
}

/** Changes page right away. pushState doesn't fire hashchange, so this runs route() once. */
function go(page) {
  const hash = page === "memories" ? "#/memories" : "#/";
  if (location.hash !== hash) history.pushState(null, "", hash);
  route();
}

function route() {
  const page = location.hash.startsWith("#/memories") ? "memories" : "dashboard";
  state.route = page;
  $("#view-dashboard").hidden = page !== "dashboard";
  $("#view-memories").hidden = page !== "memories";
  $("#search-box").hidden = page !== "memories";
  $("#page-title").textContent = TITLES[page];
  document.title = `${TITLES[page]} · memi`;
  for (const a of document.querySelectorAll(".pages .nav-item")) {
    if (a.dataset.route === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  if (phone.matches) setDrawer(false);
  renderSidebar(onFilterChange);
  loadPage();
}

/* Wiring */

$("#new").addEventListener("click", add);
els.drawerOpen.addEventListener("click", () => setDrawer(true));
$("#drawer-close").addEventListener("click", () => (setDrawer(false), els.drawerOpen.focus()));
els.backdrop.addEventListener("click", () => setDrawer(false));
window.addEventListener("hashchange", route);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.sidebar.classList.contains("open")) return (setDrawer(false), els.drawerOpen.focus());
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (e.key === "/") {
    e.preventDefault();
    if (state.route !== "memories") go("memories");
    els.search.focus();
  } else if (e.key === "n") (e.preventDefault(), add());
});

hydrateIcons();
initMemories({ refresh, onFilterChange });
setDrawer(false);
route();
loadStatus();
