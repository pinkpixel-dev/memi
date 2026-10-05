const KEY = "memi.ui";
const MODES = ["hybrid", "semantic", "text"];
const ORDERS = ["recent", "oldest", "importance"];

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
};

/** Search mode and sort order are remembered. Filters start fresh each visit. */
export function savePrefs() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode: state.mode, order: state.order }));
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
    limit: PAGE,
    offset,
  };
}

export const hasFilters = () => state.scope.kind !== "all" || state.category !== "" || state.minImportance > 0 || state.pinned;
