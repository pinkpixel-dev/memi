import { $, h } from "./dom.js";
import { icon } from "./icons.js";

const ICONS = { info: "info", success: "check", error: "triangle-alert" };

export function toast(message, { kind = "info", ms } = {}) {
  const el = h("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : undefined }, icon(ICONS[kind] ?? "info"), h("span", {}, message));
  $("#toasts").append(el);
  setTimeout(() => el.remove(), ms ?? (kind === "error" ? 7000 : 4000));
}
