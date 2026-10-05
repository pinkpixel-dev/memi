const KEY = "memi.ui";
const MODES = ["hybrid", "semantic", "text"];
const ORDERS = ["recent", "oldest", "importance"];
export const RANGES = ["all", "24h", "7d", "30d", "90d"];

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

const prefs = loadPrefs();

export const PAGE = 50;

export const state = {
  status: null,
  items: [],
  total: 0,
  modeUsed: null,
  note: null,
  error: null,
  loading: true,

  query: "",
  mode: MODES.includes(prefs.mode) ? prefs.mode : "hybrid",
  order: ORDERS.includes(prefs.order) ? prefs.order : "recent",
  scope: { kind: "all", project: null },
  category: "",
  minImportance: 0,
  pinned: false,
  agent: "",
  range: "all",

  route: "dashboard",
  dash: {
    range: RANGES.includes(prefs.dashRange) ? prefs.dashRange : "7d",
    series: prefs.dashSeries === "recalled" ? "recalled" : "saved",
    stats: null,
    error: null,
    loadedAt: null,
  },
};

/** Search mode, sort order and the dashboard view are remembered. Filters start fresh each visit. */
export function savePrefs() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode: state.mode, order: state.order, dashRange: state.dash.range, dashSeries: state.dash.series }));
  } catch {
    // Storage can be blocked. The page works without it.
  }
}

/** Turns the current filters into API query parameters. */
export function queryParams(offset = 0) {
  const { scope } = state;
  return {
    q: state.query,
    mode: state.mode,
    order: state.order,
    scope: scope.kind === "all" ? "all" : scope.kind === "global" ? "global" : "project",
    project: scope.kind === "project" ? scope.project : undefined,
    category: state.category,
    minImportance: state.minImportance || undefined,
    pinned: state.pinned ? "true" : undefined,
    agent: state.agent || undefined,
    range: state.range === "all" ? undefined : state.range,
    limit: PAGE,
    offset,
  };
}

export const hasFilters = () =>
  state.scope.kind !== "all" || state.category !== "" || state.minImportance > 0 || state.pinned || state.agent !== "" || state.range !== "all";

/** Puts every memory filter back to its default. */
export function resetFilters() {
  Object.assign(state, { query: "", scope: { kind: "all", project: null }, category: "", minImportance: 0, pinned: false, agent: "", range: "all" });
}
