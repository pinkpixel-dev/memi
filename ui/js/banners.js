import { $, clear, copyText, h } from "./dom.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { toast } from "./toast.js";

/** Load errors and embedder warnings, shown above whichever page is open. */
export function renderBanners(onRetry) {
  const el = clear($("#banners"));
  const s = state.status;
  if (state.error) {
    el.append(h("div", { class: "banner error", role: "alert" }, icon("triangle-alert"), h("span", { class: "text" }, state.error), h("button", { class: "btn", type: "button", onclick: onRetry }, "Retry")));
  }
  if (!s) return;
  const command = (text) =>
    h("code", {}, text, h("button", { class: "btn btn-icon", type: "button", title: "Copy command", "aria-label": `Copy ${text}`, onclick: async () => ((await copyText(text)) ? toast("Copied.", { kind: "success", ms: 1800 }) : toast("Couldn't copy. Select it instead.", { kind: "error" })) }, icon("copy", 14)));
  if (s.state.status === "mismatch") {
    const { provider, model } = s.state.stored;
    el.append(h("div", { class: "banner", title: s.warning }, icon("triangle-alert"), h("span", { class: "text" }, `Embedder changed from ${provider}/${model}. Semantic search is off. Memories are kept. Run`), command("memi reindex")));
  } else if (s.state.status === "ok" && s.vectors < s.total) {
    el.append(h("div", { class: "banner" }, icon("info"), h("span", { class: "text" }, `${s.total - s.vectors} memories have no vector yet. Run`), command("memi reindex --missing")));
  }
}
