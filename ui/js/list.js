import { ago, h, pips } from "./dom.js";
import { icon } from "./icons.js";

const cell = (cls, label, ...children) => h("td", { class: cls, "data-label": label }, ...children);

/** Where a memory lives: a project chip, or a global one. */
export function whereChip(m) {
  return m.scope === "global"
    ? h("span", { class: "chip" }, icon("globe", 12), "global")
    : h("span", { class: "chip", title: m.project }, icon("folder", 12), h("span", { class: "chip-text" }, m.project));
}

/**
 * One memory row in the table. Clicking anywhere on the row opens it. The memory text is the
 * real button, so keyboards and screen readers get the same action.
 */
export function rowEl(m, { onOpen, onEdit, onPin, onDelete }) {
  const tr = h(
    "tr",
    { class: "row", "data-id": m.id },
    cell("c-time", "Time", h("time", { datetime: m.updatedAt, title: new Date(m.updatedAt).toLocaleString() }, ago(m.updatedAt))),
    cell("c-agent", "Agent", m.agent ? h("span", { class: "agent", title: m.agent }, m.agent) : h("span", { class: "faint" }, "–")),
    cell(
      "c-memory",
      "Memory",
      h(
        "button",
        { class: "row-main", type: "button", "aria-label": `Open memory ${m.id}`, onclick: () => onOpen(m) },
        m.pinned ? h("span", { class: "pinned-mark", title: "Pinned" }, icon("pin", 13), h("span", { class: "sr-only" }, "Pinned")) : null,
        h("span", { class: "row-content" }, m.content),
      ),
    ),
    cell("c-project", "Project", whereChip(m)),
    cell("c-category", "Category", h("span", { class: "chip category" }, m.category)),
    cell("c-importance", "Importance", pips(m.importance)),
    cell(
      "c-actions",
      "Actions",
      h(
        "div",
        { class: "row-actions" },
        h(
          "button",
          {
            class: "btn btn-icon",
            type: "button",
            "data-key": `pin-${m.id}`,
            "aria-pressed": m.pinned ? "true" : "false",
            title: m.pinned ? "Unpin" : "Pin",
            "aria-label": m.pinned ? `Unpin memory ${m.id}` : `Pin memory ${m.id}`,
            onclick: () => onPin(m),
          },
          icon(m.pinned ? "pin-off" : "pin", 16),
        ),
        h("button", { class: "btn btn-icon", type: "button", title: "Edit", "aria-label": `Edit memory ${m.id}`, onclick: () => onEdit(m) }, icon("pencil", 16)),
        h("button", { class: "btn btn-icon danger", type: "button", title: "Delete", "aria-label": `Delete memory ${m.id}`, onclick: () => onDelete(m) }, icon("trash-2", 16)),
      ),
    ),
  );
  // Mouse users can click anywhere on the row. Clicks on the row's own buttons are left to them.
  tr.addEventListener("click", (e) => {
    if (!e.target.closest("button, a") && !getSelection()?.toString()) onOpen(m);
  });
  return tr;
}
