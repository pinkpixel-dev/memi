import { icon } from "./icons.js";

// These are set as properties. Everything else becomes an attribute (aria-*, for, list, role, ...).
const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden", "textContent"]);

/**
 * Creates an element. String children always become text nodes, never markup, so memory
 * text (which anyone can write) can't inject HTML.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Fills every <span data-icon="name"> under root with its icon. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) el.replaceWith(icon(el.dataset.icon));
}

/** Re-renders and keeps keyboard focus on the same control if it still exists. */
export function keepFocus(render) {
  const key = document.activeElement?.dataset?.key;
  render();
  if (key) document.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
