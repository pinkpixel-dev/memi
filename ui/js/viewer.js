import { $, clear, closeOnBackdrop, copyText, h, pips } from "./dom.js";
import { openEditor } from "./editor.js";
import { icon } from "./icons.js";
import { whereChip } from "./list.js";
import { toast } from "./toast.js";

const when = (iso) => h("time", { datetime: iso }, new Date(iso).toLocaleString());

/**
 * Opens the side panel to read a whole memory. Edit swaps the panel to the editor in place.
 * ctx: the editor context, plus onPin(memory).
 */
export function openViewer(ctx, memory) {
  const dlg = $("#editor");
  const m = memory;

  const details = h(
    "dl",
    { class: "details" },
    ...[
      ["Category", h("span", { class: "chip category" }, m.category)],
      ["Importance", pips(m.importance)],
      ["Project", whereChip(m)],
      ["Tags", m.tags.length ? h("span", { class: "tags" }, ...m.tags.map((t) => h("span", { class: "chip" }, `#${t}`))) : h("span", { class: "faint" }, "None")],
      ["Agent", m.agent ? h("span", {}, m.agent) : h("span", { class: "faint" }, "Unknown")],
      ["Created", when(m.createdAt)],
      ["Updated", when(m.updatedAt)],
    ].flatMap(([term, value]) => [h("dt", {}, term), h("dd", {}, value)]),
  );

  const copy = async () => ((await copyText(m.content)) ? toast("Copied.", { kind: "success", ms: 1800 }) : toast("Couldn't copy. Select it instead.", { kind: "error" }));

  clear(dlg).append(
    h(
      "div",
      { class: "dialog-form" },
      h(
        "div",
        { class: "dialog-head" },
        h("h2", { id: "editor-title" }, `Memory #${m.id}`, m.pinned ? h("span", { class: "pinned-mark", title: "Pinned" }, icon("pin", 14), h("span", { class: "sr-only" }, "Pinned")) : null),
        h(
          "div",
          { class: "head-actions" },
          h("button", { class: "btn btn-icon", type: "button", title: "Copy text", "aria-label": "Copy memory text", onclick: copy }, icon("copy", 16)),
          h("button", { class: "btn btn-icon", type: "button", title: "Close", "aria-label": "Close", onclick: () => dlg.close() }, icon("x")),
        ),
      ),
      h("div", { class: "dialog-body" }, h("p", { class: "memory-text" }, m.content), details),
      h(
        "div",
        { class: "dialog-foot" },
        h("button", { class: "btn btn-danger", type: "button", onclick: () => ctx.onDelete(m) }, icon("trash-2", 16), "Delete"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn", type: "button", onclick: () => (dlg.close(), ctx.onPin(m)) }, icon(m.pinned ? "pin-off" : "pin", 16), m.pinned ? "Unpin" : "Pin"),
        h("button", { class: "btn btn-primary", type: "button", "data-key": "viewer-edit", onclick: () => openEditor(ctx, m) }, icon("pencil", 16), "Edit"),
      ),
    ),
  );

  closeOnBackdrop(dlg);
  if (!dlg.open) dlg.showModal();
  dlg.querySelector("[data-key='viewer-edit']").focus();
}
