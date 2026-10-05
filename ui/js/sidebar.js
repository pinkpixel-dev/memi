import { $, clear, h } from "./dom.js";
import { state } from "./state.js";

function navItem(key, label, count, current, onclick, extra) {
  return h(
    "li",
    {},
    h(
      "button",
      { class: "nav-item", type: "button", "data-key": key, "aria-current": current ? "true" : undefined, onclick },
      h("span", { class: "label" }, label),
      extra,
      count == null ? null : h("span", { class: "count" }, String(count)),
    ),
  );
}

const group = (title, ...children) => h("section", { class: "group" }, h("h2", { class: "group-title" }, title), ...children);

/** Rebuilds the filter list from the latest status. `onChange` runs after a filter is picked. */
export function renderSidebar(onChange) {
  const status = state.status;
  if (!status) return;
  renderEmbedder(status);
  // Filters only apply to the memories page.
  if (state.route !== "memories") return void clear($("#filters"));
  const { scope } = state;
  const projectTotal = status.projects.reduce((sum, p) => sum + p.count, 0);
  const pick = (patch) => () => {
    Object.assign(state, patch);
    onChange();
  };

  const scopes = h(
    "ul",
    { class: "nav" },
    navItem("scope-all", "All", status.total, scope.kind === "all", pick({ scope: { kind: "all", project: null } })),
    navItem("scope-global", "Global", status.total - projectTotal, scope.kind === "global", pick({ scope: { kind: "global", project: null } })),
    ...status.projects.map((p) =>
      navItem(
        `scope-p-${p.project}`,
        p.project,
        p.count,
        scope.kind === "project" && scope.project === p.project,
        pick({ scope: { kind: "project", project: p.project } }),
        p.project === status.currentProject ? h("span", { class: "here", title: "The project this was started in" }, "here") : null,
      ),
    ),
  );

  // Empty built-in categories are hidden to keep the list short, unless one is selected.
  const shown = status.categories.filter((c) => c.count > 0 || c.name === state.category);
  const categories = h(
    "ul",
    { class: "nav" },
    navItem("cat-all", "All", null, state.category === "", pick({ category: "" })),
    ...shown.map((c) => navItem(`cat-${c.name}`, c.name, c.count, state.category === c.name, pick({ category: c.name }))),
  );

  const agents = (status.agents ?? []).length
    ? group(
        "Agent",
        h(
          "ul",
          { class: "nav" },
          navItem("agent-all", "All", null, state.agent === "", pick({ agent: "" })),
          ...status.agents.map((a) => navItem(`agent-${a.agent}`, a.agent, a.count, state.agent === a.agent, pick({ agent: a.agent }))),
        ),
      )
    : null;

  const importance = h(
    "div",
    { class: "segmented", role: "group", "aria-label": "Minimum importance" },
    ...[
      [0, "Any"],
      [3, "3+"],
      [4, "4+"],
      [5, "5"],
    ].map(([value, label]) =>
      h("button", { type: "button", "data-key": `imp-${value}`, "aria-pressed": state.minImportance === value ? "true" : "false", onclick: pick({ minImportance: value }) }, label),
    ),
  );

  const pinned = h(
    "label",
    { class: "check-row" },
    h("input", { type: "checkbox", "data-key": "pinned-only", checked: state.pinned, onchange: (e) => pick({ pinned: e.target.checked })() }),
    "Pinned only",
  );

  clear($("#filters")).append(
    group("Scope", scopes),
    group("Category", categories),
    ...(agents ? [agents] : []),
    group("Importance", h("div", { class: "nav" }, importance)),
    h("div", { class: "group" }, pinned),
  );
}

function renderEmbedder(status) {
  const e = status.embedder;
  clear($("#embedder")).append(
    e ? `${e.provider}/${e.model}` : "no embedder",
    h("br"),
    `${status.vectors} of ${status.total} indexed`,
  );
}
