import { $, clear, h } from "./dom.js";

const SNIPPET = 160;

/** Asks before deleting. Resolves true only if Delete was chosen. */
export function confirmDelete(memory) {
  const dlg = $("#confirm");
  const text = memory.content.length > SNIPPET ? `${memory.content.slice(0, SNIPPET)}...` : memory.content;
  clear(dlg).append(
    h(
      "form",
      { method: "dialog", class: "dialog-form" },
      h("div", { class: "dialog-head" }, h("h2", { id: "confirm-title" }, `Delete memory #${memory.id}?`)),
      h("div", { class: "dialog-body" }, h("p", {}, text), h("p", { class: "fine" }, "This can't be undone.")),
      h(
        "div",
        { class: "dialog-foot" },
        h("span", { class: "spacer" }),
        h("button", { class: "btn", type: "submit", value: "cancel", autofocus: true }, "Cancel"),
        h("button", { class: "btn btn-danger solid", type: "submit", value: "delete" }, "Delete"),
      ),
    ),
  );
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "delete"), { once: true });
    dlg.returnValue = "cancel";
    dlg.showModal();
  });
}
