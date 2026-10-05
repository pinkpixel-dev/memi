// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../ui/js/api.js";
import { confirmDelete } from "../ui/js/confirm.js";
import { clear, h, hydrateIcons } from "../ui/js/dom.js";
import { openEditor } from "../ui/js/editor.js";
import { rowEl } from "../ui/js/list.js";
import { renderSidebar } from "../ui/js/sidebar.js";
import { state } from "../ui/js/state.js";
import type { Runtime } from "../src/core/runtime.js";
import { createApp } from "../src/ui/server.js";
import { newStore, tempDir } from "./helpers.js";

const PAYLOAD = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script><b>bold</b>`;

/** Loads the real page markup (minus scripts) so these tests can't drift from index.html. */
function loadPage() {
  const html = readFileSync(join(import.meta.dirname, "../ui/index.html"), "utf8");
  // Take only the body markup. Parsing the whole document would make happy-dom fetch the linked stylesheets.
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!.replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.innerHTML = body;
  hydrateIcons();
}

/** Sends the UI's fetch calls to the real API handler, backed by a real in-memory store. */
function connectApi() {
  const store = newStore();
  const rt: Runtime = { store, config: { embedder: { provider: "ollama" }, ui: { port: 4747 } }, agent: null };
  const app = createApp(rt, tempDir("dom"));
  globalThis.fetch = ((input: string, init?: RequestInit) => app.request(new URL(input, "http://localhost:4747"), init)) as typeof fetch;
  return store;
}

const memory = (over = {}) => ({
  id: 7,
  scope: "global",
  project: null,
  agent: null,
  category: "fact",
  content: "plain",
  tags: [],
  importance: 3,
  pinned: false,
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:00:00.000Z",
  ...over,
});

const nextTick = () => new Promise((r) => setTimeout(r, 20));
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

beforeEach(() => {
  loadPage();
  delete (window as unknown as Record<string, unknown>).__pwned;
});

describe("h()", () => {
  it("turns strings into text nodes, never markup", () => {
    const p = h("p", { class: "x" }, PAYLOAD);
    expect(p.children).toHaveLength(0);
    expect(p.textContent).toBe(PAYLOAD);
    expect(p.innerHTML).toContain("&lt;img");
    const wrap = h("div", {}, h("span", {}, "a"), null, false, ["b", h("i", {}, "c")]);
    expect(wrap.textContent).toBe("abc");
  });

  it("keeps hostile values inside attributes and skips empty props", () => {
    const el = h("button", { title: `"><script>x</script>`, "aria-label": PAYLOAD, hidden: false, disabled: undefined, "data-id": 0 });
    expect(el.querySelector("script")).toBeNull();
    expect(el.getAttribute("title")).toBe(`"><script>x</script>`);
    expect(el.hasAttribute("hidden")).toBe(false);
    expect(el.dataset.id).toBe("0");
  });

  it("wires event handlers and property-style props", () => {
    const fn = vi.fn();
    const input = h("input", { type: "checkbox", checked: true, value: "v", onclick: fn });
    expect((input as HTMLInputElement).checked).toBe(true);
    click(input);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("memory rows", () => {
  it("render every field of a hostile memory as plain text", () => {
    const m = memory({ content: PAYLOAD, category: "<b>cat</b>", project: "<i>proj</i>", scope: "project", tags: ["<u>t</u>"], agent: "<s>bot</s>" });
    const li = rowEl(m, { onEdit: vi.fn(), onPin: vi.fn(), onDelete: vi.fn() });
    document.body.append(li);
    expect(li.querySelectorAll("img, script, b, i, u, s")).toHaveLength(0);
    expect(li.querySelector(".row-content")!.textContent).toBe(PAYLOAD);
    expect(li.textContent).toContain("<b>cat</b>");
    expect(li.textContent).toContain("<i>proj</i>");
    expect(li.textContent).toContain("#<u>t</u>");
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("shows pin state, importance and labels that do not rely on colour", () => {
    const li = rowEl(memory({ id: 3, pinned: true, importance: 4 }), { onEdit: vi.fn(), onPin: vi.fn(), onDelete: vi.fn() });
    const pin = li.querySelector('[aria-label="Unpin memory 3"]')!;
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pin.getAttribute("title")).toBe("Unpin");
    expect(li.querySelectorAll(".pip.on")).toHaveLength(4);
    expect(li.querySelectorAll(".pip")).toHaveLength(5);
    expect(li.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("Importance 4 of 5");
    expect(li.querySelector(".chip.pinned .sr-only")!.textContent).toBe("Pinned");
  });

  it("calls the right handler for edit, pin and delete", () => {
    const handlers = { onEdit: vi.fn(), onPin: vi.fn(), onDelete: vi.fn() };
    const m = memory({ id: 9 });
    const li = rowEl(m, handlers);
    click(li.querySelector('[aria-label="Edit memory 9"]'));
    click(li.querySelector('[aria-label="Pin memory 9"]'));
    click(li.querySelector('[aria-label="Delete memory 9"]'));
    expect(handlers.onEdit).toHaveBeenCalledWith(m);
    expect(handlers.onPin).toHaveBeenCalledWith(m);
    expect(handlers.onDelete).toHaveBeenCalledWith(m);
  });
});

describe("sidebar", () => {
  const status = (over = {}) => ({
    total: 5,
    vectors: 5,
    embedder: { provider: "ollama", model: "nomic-embed-text" },
    currentProject: "alpha",
    projects: [{ project: "alpha", count: 2 }, { project: "<b>evil</b>", count: 1 }],
    categories: [{ name: "fact", count: 3 }, { name: "todo", count: 0 }, { name: "<i>x</i>", count: 2 }],
    ...over,
  });

  it("lists scopes and non-empty categories, and escapes names", () => {
    Object.assign(state, { status: status(), scope: { kind: "all", project: null }, category: "", minImportance: 0, pinned: false });
    renderSidebar(vi.fn());
    const filters = document.querySelector("#filters")!;
    expect(filters.querySelectorAll("b, i")).toHaveLength(0);
    const labels = [...filters.querySelectorAll(".nav-item .label")].map((e) => e.textContent);
    expect(labels).toEqual(["All", "Global", "alpha", "<b>evil</b>", "All", "fact", "<i>x</i>"]); // "todo" has no memories, so it is hidden
    expect(filters.querySelector("[data-key='scope-global'] .count")!.textContent).toBe("2"); // 5 total minus 3 in projects
    expect(filters.querySelector("[data-key='scope-p-alpha'] .here")).not.toBeNull();
    expect(document.querySelector("#embedder")!.textContent).toBe("ollama/nomic-embed-textin 5 of 5 indexed".replace("in ", ""));
  });

  it("selecting a filter updates state and tells the page to reload", () => {
    Object.assign(state, { status: status(), scope: { kind: "all", project: null }, category: "", minImportance: 0, pinned: false });
    const onChange = vi.fn();
    renderSidebar(onChange);
    click(document.querySelector("[data-key='scope-p-alpha']"));
    expect(state.scope).toEqual({ kind: "project", project: "alpha" });
    click(document.querySelector("[data-key='cat-fact']"));
    expect(state.category).toBe("fact");
    click(document.querySelector("[data-key='imp-4']"));
    expect(state.minImportance).toBe(4);
    const pinned = document.querySelector("[data-key='pinned-only']") as HTMLInputElement;
    pinned.checked = true;
    pinned.dispatchEvent(new Event("change", { bubbles: true }));
    expect(state.pinned).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe("delete confirmation", () => {
  it("shows what is about to be deleted (regression: the preview text went missing)", () => {
    void confirmDelete(memory({ id: 4, content: "The staging server is called falcon" }));
    const dlg = document.querySelector("#confirm")!;
    expect(dlg.querySelector("#confirm-title")!.textContent).toBe("Delete memory #4?");
    expect(dlg.querySelector(".dialog-body")!.textContent).toContain("The staging server is called falcon");
    expect(dlg.querySelector(".dialog-body")!.textContent).toContain("can't be undone");
  });

  it("cuts long previews, renders them as text, and focuses Cancel first", () => {
    void confirmDelete(memory({ content: `${PAYLOAD}${"x".repeat(300)}` }));
    const dlg = document.querySelector("#confirm")!;
    expect(dlg.querySelectorAll("img, script, b")).toHaveLength(0);
    expect(dlg.querySelector(".dialog-body p")!.textContent!.endsWith("...")).toBe(true);
    expect(dlg.querySelector(".dialog-body p")!.textContent!.length).toBe(163);
    expect(dlg.querySelector("button[autofocus]")!.textContent).toBe("Cancel");
  });

  it("resolves true only when Delete was chosen", async () => {
    const dlg = document.querySelector("#confirm") as HTMLDialogElement;
    const yes = confirmDelete(memory());
    dlg.close("delete");
    expect(await yes).toBe(true);
    const no = confirmDelete(memory());
    dlg.close("cancel");
    expect(await no).toBe(false);
    const escaped = confirmDelete(memory());
    dlg.close();
    expect(await escaped).toBe(false);
  });
});

describe("editor round trip through the real API", () => {
  const ctx = (over = {}) => ({
    categories: [{ name: "fact" }, { name: "decision" }],
    projects: [{ project: "alpha" }],
    currentProject: null as string | null,
    onSaved: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  });
  const submit = () => (document.querySelector("#editor form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const field = <T extends HTMLElement>(sel: string) => document.querySelector(`#editor ${sel}`) as T;

  it("creates a memory from the form", async () => {
    const store = connectApi();
    const c = ctx({ currentProject: "alpha" });
    openEditor(c, null);
    expect(field("#editor-title, h2").textContent).toBe("New memory");
    expect((field("input[name=scope]:checked") as HTMLInputElement).value).toBe("project"); // defaults to the current project
    expect(field<HTMLInputElement>("#f-project").value).toBe("alpha");

    field<HTMLTextAreaElement>("#f-content").value = "  Deploys need the VPN  ";
    field<HTMLInputElement>("#f-category").value = "Fact";
    field<HTMLInputElement>("#f-tags").value = "infra, , VPN";
    field<HTMLInputElement>("input[name=importance][value='5']").checked = true;
    field<HTMLInputElement>("#f-pinned").checked = true;
    submit();
    await nextTick();

    expect(store.list({ scope: "all" }).items[0]).toMatchObject({
      content: "Deploys need the VPN",
      category: "fact",
      tags: ["infra", "vpn"],
      importance: 5,
      pinned: true,
      scope: "project",
      project: "alpha",
      agent: "memi-ui",
    });
    expect(c.onSaved).toHaveBeenCalledOnce();
    expect(c.onSaved.mock.calls[0]![1]).toBe(true);
    expect((document.querySelector("#editor") as HTMLDialogElement).open).toBe(false);
  });

  it("edits an existing memory, including moving it to global", async () => {
    const store = connectApi();
    const { memory: saved } = await store.add({ content: PAYLOAD, scope: "project", project: "alpha", importance: 2 });
    openEditor(ctx(), saved);
    expect(field("h2").textContent).toBe(`Memory #${saved.id}`);
    expect(field<HTMLTextAreaElement>("#f-content").value).toBe(PAYLOAD);
    expect(document.querySelectorAll("#editor img, #editor script, #editor b")).toHaveLength(0);
    expect(field("button.btn-danger")).not.toBeNull();

    field<HTMLTextAreaElement>("#f-content").value = "Rewritten";
    field<HTMLInputElement>("input[name=scope][value='global']").checked = true;
    submit();
    await nextTick();
    expect(store.get(saved.id)).toMatchObject({ content: "Rewritten", scope: "global", project: null, importance: 2 });
  });

  it("shows the server's message and stays open when the save is rejected", async () => {
    const store = connectApi();
    openEditor(ctx(), null);
    field<HTMLTextAreaElement>("#f-content").value = "x";
    field<HTMLInputElement>("#f-category").value = "bad name!";
    submit();
    await nextTick();
    const error = field("p.form-error");
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/Invalid category/);
    expect((document.querySelector("#editor") as HTMLDialogElement).open).toBe(true);
    expect(store.list({ scope: "all" }).total).toBe(0);
    expect(field("button[type=submit]").classList.contains("loading")).toBe(false);
  });

  it("only offers delete for existing memories, and hands the memory to the delete handler", () => {
    const c = ctx();
    openEditor(c, null);
    expect(document.querySelector("#editor button.btn-danger")).toBeNull();
    const m = memory({ id: 12 });
    openEditor(c, m);
    click(document.querySelector("#editor button.btn-danger"));
    expect(c.onDelete).toHaveBeenCalledWith(m);
  });

  it("shows the project field only for project scope", () => {
    openEditor(ctx(), null);
    const projectField = field<HTMLInputElement>("#f-project");
    const wrapper = projectField.closest(".field") as HTMLElement;
    const pick = (value: string) => {
      const radio = field<HTMLInputElement>(`input[name=scope][value='${value}']`);
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    };
    pick("global");
    expect(wrapper.hidden).toBe(true);
    expect(projectField.required).toBe(false);
    pick("project");
    expect(wrapper.hidden).toBe(false);
    expect(projectField.required).toBe(true);
  });
});

describe("api client", () => {
  it("turns server errors into readable messages, and 204 into null", async () => {
    const store = connectApi();
    await expect(api.addMemory({ content: "  " })).rejects.toThrow(/empty/);
    await expect(api.updateMemory(99, { content: "x" })).rejects.toThrow(/No memory with id 99/);
    const { memory: m } = await api.addMemory({ content: "to delete" });
    expect(await api.deleteMemory(m.id)).toBeNull();
    expect(store.list({ scope: "all" }).total).toBe(0);
    await expect(api.listMemories({ scope: "nope" })).rejects.toThrow(/scope/);
  });

  it("explains an unreachable server in plain words", async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    await expect(api.getStatus()).rejects.toThrow(/Can't reach memi.*memi ui/);
  });

  it("skips empty params when listing", async () => {
    const seen: string[] = [];
    const store = newStore();
    const rt: Runtime = { store, config: { embedder: { provider: "ollama" }, ui: { port: 4747 } }, agent: null };
    const app = createApp(rt, tempDir("dom"));
    globalThis.fetch = ((input: string, init?: RequestInit) => (seen.push(String(input)), app.request(new URL(input, "http://localhost:4747"), init))) as typeof fetch;
    await api.listMemories({ q: "", category: "", minImportance: undefined, scope: "all", limit: 50, offset: 0 });
    expect(seen[0]).toBe("/api/memories?scope=all&limit=50&offset=0");
  });
});

describe("clear()", () => {
  it("empties an element and returns it", () => {
    const el = h("div", {}, "a", h("b", {}, "b"));
    expect(clear(el)).toBe(el);
    expect(el.childNodes).toHaveLength(0);
  });
});
