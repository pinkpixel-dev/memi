import * as api from "./api.js";
import { activityChart, barList, num } from "./charts.js";
import { $, ago, clear, h, keepFocus } from "./dom.js";
import { icon } from "./icons.js";
import { RANGES, savePrefs, state } from "./state.js";

const RANGE_LABELS = { all: "All time", "24h": "24h", "7d": "7d", "30d": "30d", "90d": "90d" };
const PER = { hour: "hour", day: "day", week: "week" };

let seq = 0;
let nav = null;

/**
 * Loads the numbers for the selected range and draws the dashboard.
 * links: { toProject(name | null), toCategory(name) } move to the memories page with that filter.
 */
export async function loadDashboard(links = nav) {
  nav = links;
  const mine = ++seq;
  state.dash.loading = true;
  render();
  try {
    const stats = await api.getStats(state.dash.range);
    if (mine !== seq) return;
    Object.assign(state.dash, { stats, error: null, loadedAt: new Date().toISOString() });
  } catch (err) {
    if (mine !== seq) return;
    state.dash.error = err.message;
  }
  state.dash.loading = false;
  render();
}

// Keeps "Updated 2 minutes ago" honest without redrawing everything.
setInterval(() => {
  const el = document.querySelector("#dash-updated");
  if (el && state.dash.loadedAt) el.textContent = `Updated ${ago(state.dash.loadedAt)}`;
}, 30_000);

const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

function toolbar() {
  const { range, loading, loadedAt } = state.dash;
  return h(
    "div",
    { class: "dash-bar" },
    h(
      "div",
      { class: "segmented", role: "group", "aria-label": "Time range" },
      ...RANGES.map((r) =>
        h(
          "button",
          { type: "button", "data-key": `range-${r}`, "aria-pressed": range === r ? "true" : "false", onclick: () => ((state.dash.range = r), savePrefs(), loadDashboard()) },
          RANGE_LABELS[r],
        ),
      ),
    ),
    h("button", { class: `btn${loading ? " loading" : ""}`, type: "button", "data-key": "dash-refresh", onclick: () => loadDashboard() }, icon("refresh-cw", 16), "Refresh"),
    h("span", { class: "fine", id: "dash-updated" }, loadedAt ? `Updated ${ago(loadedAt)}` : ""),
  );
}

function card(iconName, title, value, sub) {
  return h(
    "article",
    { class: "card" },
    h("h2", { class: "card-head" }, icon(iconName, 16), title),
    h("p", { class: "card-value" }, value),
    h("p", { class: "card-sub" }, sub),
  );
}

function panel(title, meta, ...body) {
  return h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", {}, title), meta), ...body);
}

const empty = (text) => h("p", { class: "panel-empty" }, text);

function render() {
  const root = $("#dash");
  if (!root) return;
  const { stats: s, error, series } = state.dash;
  if (!s) {
    clear(root).append(
      toolbar(),
      error
        ? h("div", { class: "banner error", role: "alert" }, icon("triangle-alert"), h("span", { class: "text" }, error), h("button", { class: "btn", type: "button", onclick: () => loadDashboard() }, "Retry"))
        : h("p", { class: "panel-empty" }, "Loading"),
    );
    return;
  }

  const all = s.range === "all";
  const stored = card(
    "rows-3",
    "Memories stored",
    num(all ? s.stored.total : s.stored.added),
    all ? `+${num(s.stored.today)} today` : `${num(s.stored.total)} total, +${num(s.stored.today)} today`,
  );
  const recalled = card(
    "search",
    "Memories recalled",
    num(s.recalled.memories),
    s.recalled.searches ? `From ${plural(s.recalled.searches, "search", "searches")}` : "Counted each time an agent calls recall",
  );

  const isSaved = series === "saved";
  const pickSeries = (value) => () => ((state.dash.series = value), savePrefs(), render());
  const activity = panel(
    "Activity",
    h(
      "div",
      { class: "segmented", role: "group", "aria-label": "Activity series" },
      h("button", { type: "button", "data-key": "series-saved", "aria-pressed": String(isSaved), onclick: pickSeries("saved") }, "Saved"),
      h("button", { type: "button", "data-key": "series-recalled", "aria-pressed": String(!isSaved), onclick: pickSeries("recalled") }, "Recalled"),
    ),
    activityChart(s.activity.buckets, {
      key: series,
      bucket: s.activity.bucket,
      noun: isSaved ? "saved" : "recalled",
      title: `Memories ${isSaved ? "saved" : "recalled"} per ${PER[s.activity.bucket]}`,
    }),
  );

  const projectRows = [
    ...(s.global ? [{ key: "global", label: "global", icon: "globe", count: s.global, project: null }] : []),
    ...s.projects.map((p) => ({ key: `p-${p.project}`, label: p.project, count: p.count, project: p.project })),
  ].sort((a, b) => b.count - a.count);
  const projects = panel(
    "Projects",
    h("span", { class: "panel-meta" }, "Memories saved"),
    projectRows.length ? barList(projectRows, { noun: "projects", onPick: (r) => nav?.toProject(r.project) }) : empty("Nothing saved in this range."),
  );

  const categories = panel(
    "Categories",
    h("span", { class: "panel-meta" }, plural(s.categories.length, "category", "categories")),
    s.categories.length
      ? barList(
          s.categories.map((c) => ({ key: `c-${c.name}`, label: c.name, count: c.count })),
          { noun: "categories", value: (r, total) => `${((r.count / total) * 100).toFixed(1)}%`, onPick: (r) => nav?.toCategory(r.label) },
        )
      : empty("Nothing saved in this range."),
  );

  keepFocus(() =>
    clear(root).append(
      ...[
        toolbar(),
        error ? h("div", { class: "banner error", role: "alert" }, icon("triangle-alert"), h("span", { class: "text" }, error)) : null,
        h("div", { class: "cards" }, stored, recalled),
        activity,
        h("div", { class: "dash-pair" }, projects, categories),
      ].filter(Boolean),
    ),
  );
}
