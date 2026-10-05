import { h } from "./dom.js";
import { icon } from "./icons.js";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

function ago(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return "just now";
}

function pips(n) {
  const wrap = h("span", { class: "pips", role: "img", "aria-label": `Importance ${n} of 5`, title: `Importance ${n} of 5` });
  for (let i = 1; i <= 5; i++) wrap.append(h("span", { class: i <= n ? "pip on" : "pip" }));
  return wrap;
}

function meta(m) {
  const where = m.scope === "global" ? [icon("globe", 12), "global"] : [icon("folder", 12), m.project];
  return h(
    "div",
    { class: "meta" },
    m.pinned ? h("span", { class: "chip pinned" }, icon("pin", 12), h("span", { class: "sr-only" }, "Pinned")) : null,
    h("span", { class: "chip category" }, m.category),
    pips(m.importance),
    h("span", { class: "chip" }, ...where),
    ...m.tags.map((t) => h("span", { class: "chip" }, `#${t}`)),
    h("span", {}, `#${m.id}`),
    h("time", { datetime: m.updatedAt, title: new Date(m.updatedAt).toLocaleString() }, ago(m.updatedAt)),
    m.agent ? h("span", {}, `by ${m.agent}`) : null,
  );
}

/** One memory row: the text opens the editor, the buttons beside it pin and delete. */
export function rowEl(m, { onEdit, onPin, onDelete }) {
  return h(
    "li",
    { class: "row", "data-id": m.id },
    h("button", { class: "row-main", type: "button", "aria-label": `Edit memory ${m.id}`, onclick: () => onEdit(m) }, h("span", { class: "row-content" }, m.content), meta(m)),
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
        icon(m.pinned ? "pin-off" : "pin"),
      ),
      h("button", { class: "btn btn-icon danger", type: "button", title: "Delete", "aria-label": `Delete memory ${m.id}`, onclick: () => onDelete(m) }, icon("trash-2")),
    ),
  );
}
