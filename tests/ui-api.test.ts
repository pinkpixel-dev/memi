import { mkdirSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Runtime } from "../src/core/runtime.js";
import { createApp, startUi, type RunningUi } from "../src/ui/server.js";
import { MODEL_A, newStore, ollama, ollamaHas, tempDir } from "./helpers.js";

const hasNomic = await ollamaHas(MODEL_A);

const runtime = (embedder = null as ReturnType<typeof ollama> | null): Runtime => ({
  store: newStore(embedder),
  config: { embedder: { provider: "ollama" }, ui: { port: 4747 } },
  agent: null,
});

const JSON_HEADERS = { "content-type": "application/json" };
const send = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown, headers: Record<string, string> = JSON_HEADERS) =>
  app.request(`http://localhost:4747${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

describe("UI API", () => {
  it("reports status, categories, projects and the current project", async () => {
    const cwd = tempDir("ui");
    mkdirSync(join(cwd, ".git"));
    const rt = runtime();
    const app = createApp(rt, cwd);
    await send(app, "POST", "/api/memories", { content: "alpha note", scope: "project", project: "alpha" });
    const status = await (await send(app, "GET", "/api/status")).json();
    expect(status).toMatchObject({ total: 1, currentProject: cwd.split("/").pop(), projects: [{ project: "alpha", count: 1 }] });
    expect(status.categories.map((c: { name: string }) => c.name)).toContain("decision");
  });

  it("adds, lists with filters, updates and deletes", async () => {
    const app = createApp(runtime(), tempDir("ui"));
    const created = await send(app, "POST", "/api/memories", { content: "Deploys use GitHub Actions", category: "fact", importance: 4, tags: ["ci"], pinned: true });
    expect(created.status).toBe(201);
    const { memory } = await created.json();
    expect(memory).toMatchObject({ id: 1, scope: "global", agent: "memi-ui", pinned: true, tags: ["ci"] });
    await send(app, "POST", "/api/memories", { content: "Alpha only", scope: "project", project: "alpha", importance: 1 });

    const list = async (qs: string) => (await (await send(app, "GET", `/api/memories${qs}`)).json());
    expect((await list("")).total).toBe(2);
    expect((await list("?scope=global")).items.map((m: { id: number }) => m.id)).toEqual([1]);
    expect((await list("?scope=project&project=alpha")).items).toHaveLength(1);
    expect((await list("?category=fact&minImportance=3&pinned=true")).total).toBe(1);
    expect((await list("?pinned=false")).items[0].content).toBe("Alpha only");
    expect((await list("?order=importance")).items[0].id).toBe(1);
    expect((await list("?limit=1&offset=1")).items).toHaveLength(1);

    const patched = await send(app, "PATCH", "/api/memories/1", { content: "Deploys use Cloudflare", importance: 5, pinned: false, scope: "project", project: "web" });
    expect((await patched.json()).memory).toMatchObject({ content: "Deploys use Cloudflare", importance: 5, pinned: false, scope: "project", project: "web" });

    expect((await send(app, "DELETE", "/api/memories/1", undefined, {})).status).toBe(204);
    expect((await send(app, "DELETE", "/api/memories/1", undefined, {})).status).toBe(404);
    expect((await send(app, "PATCH", "/api/memories/1", { content: "x" })).status).toBe(404);
    expect((await list("")).total).toBe(1);
  });

  it("searches with a q parameter and says which mode it used", async () => {
    const app = createApp(runtime(), tempDir("ui"));
    await send(app, "POST", "/api/memories", { content: "The staging server is called falcon" });
    await send(app, "POST", "/api/memories", { content: "Unrelated note about cats" });
    const r = await (await send(app, "GET", "/api/memories?q=falcon")).json();
    expect(r.items.map((m: { content: string }) => m.content)).toEqual(["The staging server is called falcon"]);
    expect(r.modeUsed).toBe("text");
    expect(r.note).toMatch(/No embedder/);
    expect(Object.keys(r.scores)).toEqual(["1"]);
    expect((await (await send(app, "GET", "/api/memories?q=%3F%3F%3F")).json()).items).toEqual([]);
  });

  it("answers bad input with a 400 and a readable message", async () => {
    const app = createApp(runtime(), tempDir("ui"));
    const cases: [string, string, unknown, RegExp][] = [
      ["POST", "/api/memories", { content: "   " }, /empty/],
      ["POST", "/api/memories", { content: "x", importance: 9 }, /1 to 5/],
      ["POST", "/api/memories", { content: "x", scope: "project" }, /project name/],
      ["POST", "/api/memories", { content: "x", category: "bad name!" }, /Invalid category/],
      ["POST", "/api/memories", { importance: 3 }, /content/],
      ["PATCH", "/api/memories/abc", {}, /request|id/],
      ["GET", "/api/memories?scope=nope", undefined, /scope/],
      ["GET", "/api/memories?limit=9999", undefined, /limit/],
    ];
    for (const [method, path, body, message] of cases) {
      const res = await send(app, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(400);
      expect((await res.json()).error).toMatch(message);
    }
    const broken = await app.request("http://localhost:4747/api/memories", { method: "POST", headers: JSON_HEADERS, body: "{not json" });
    expect(broken.status).toBe(400);
    expect((await broken.json()).error).toMatch(/valid JSON/);
  });

  it("returns memory text as plain JSON data, untouched", async () => {
    const app = createApp(runtime(), tempDir("ui"));
    const evil = `<img src=x onerror=alert(1)><script>alert(2)</script>`;
    await send(app, "POST", "/api/memories", { content: evil });
    const res = await send(app, "GET", "/api/memories");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect((await res.json()).items[0].content).toBe(evil);
  });
});

describe("UI guard", () => {
  const app = createApp(runtime(), tempDir("ui"));
  const at = (url: string, init: RequestInit = {}) => app.request(url, init);

  it("refuses requests whose Host is not local (DNS rebinding)", async () => {
    for (const host of ["evil.example", "localhost.evil.example", "192.168.1.5:4747", "10.0.0.1"]) {
      const res = await at(`http://${host}/api/status`);
      expect(res.status, host).toBe(403);
    }
    for (const host of ["localhost:4747", "127.0.0.1:4747", "[::1]:4747"]) expect((await at(`http://${host}/api/status`)).status, host).toBe(200);
  });

  it("refuses cross-site writes", async () => {
    const body = JSON.stringify({ content: "pwned" });
    const post = (headers: Record<string, string>) => at("http://localhost:4747/api/memories", { method: "POST", headers, body });
    expect((await post({ ...JSON_HEADERS, origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ ...JSON_HEADERS, origin: "null" })).status).toBe(403);
    expect((await post({ ...JSON_HEADERS, origin: "http://localhost:9999" })).status).toBe(403);
    expect((await post({ "content-type": "text/plain" })).status).toBe(415);
    expect((await post({ "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post({})).status).toBe(415);
    expect((await at("http://localhost:4747/api/memories/1", { method: "DELETE", headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await post({ ...JSON_HEADERS, origin: "http://localhost:4747" })).status).toBe(201);
    expect((await (await at("http://localhost:4747/api/memories")).json()).total).toBe(1);
  });

  it("sends a strict content security policy and no CORS headers", async () => {
    const res = await at("http://localhost:4747/api/status");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("UI static files", () => {
  const app = createApp(runtime(), tempDir("ui"));
  const get = (path: string) => app.request(`http://localhost:4747${path}`);

  it("serves the page and every file it links to, with the right types", async () => {
    const page = await get("/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await page.text();
    expect(html).toMatch(/<title>memi<\/title>/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // CSP forbids inline scripts
    expect(html).not.toMatch(/\sstyle=/); // and inline styles

    const linked = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]!);
    expect(linked.length).toBeGreaterThanOrEqual(7);
    const types: Record<string, string> = { css: "text/css", js: "text/javascript", svg: "image/svg+xml", png: "image/png" };
    for (const path of linked) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toContain(types[path.split(".").pop()!]!);
    }
  });

  it("serves every module the app imports and the bundled fonts", async () => {
    for (const path of ["/js/main.js", "/js/editor.js", "/js/icons.js", "/js/sidebar.js", "/fonts/geist-latin-wght-normal.woff2", "/fonts/geist-mono-latin-wght-normal.woff2", "/fonts/OFL.txt"]) {
      expect((await get(path)).status, path).toBe(200);
    }
    expect((await get("/fonts/geist-latin-wght-normal.woff2")).headers.get("content-type")).toBe("font/woff2");
  });

  it("never serves anything outside ui/, or unknown file types", async () => {
    for (const path of ["/../package.json", "/%2e%2e/package.json", "/js/../../package.json", "/..%2f..%2fpackage.json", "/js/%2e%2e/%2e%2e/src/cli/index.ts", "/%00.js", "/js\\..\\main.js", "/nope.js", "/js", "/api/nope", "/%E0%A4%A"]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).not.toMatch(/"name": "@pinkpixel\/memi"|#!\/usr\/bin\/env node/);
    }
  });

  it("puts the security headers on files too", async () => {
    const res = await get("/js/main.js");
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("UI server", () => {
  const running: RunningUi[] = [];
  afterEach(async () => {
    await Promise.all(running.splice(0).map((u) => u.close()));
  });

  const rawGet = (port: number, path: string, host: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d)).on("end", () => resolve({ status: res.statusCode!, body }));
      });
      req.on("error", reject).end();
    });

  it("listens on loopback and rejects a forged Host header over a real socket", async () => {
    const ui = await startUi(runtime(), { port: 0 });
    running.push(ui);
    const port = Number(new URL(ui.url).port);
    expect(ui.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(await rawGet(port, "/api/status", `localhost:${port}`)).toMatchObject({ status: 200 });
    expect(await rawGet(port, "/api/status", "evil.example")).toMatchObject({ status: 403 });
  });

  it("explains when the port is already taken", async () => {
    const first = await startUi(runtime(), { port: 0 });
    running.push(first);
    const port = Number(new URL(first.url).port);
    await expect(startUi(runtime(), { port })).rejects.toThrow(new RegExp(`Port ${port} is already in use.*--port`));
  });
});

describe.skipIf(!hasNomic)("UI API with real embeddings", () => {
  it("finds a paraphrase, reports hybrid mode, and flags near-duplicates on add", async () => {
    const app = createApp(runtime(ollama(MODEL_A)), tempDir("ui"));
    await send(app, "POST", "/api/memories", { content: "The user prefers tabs over spaces for indentation", category: "preference" });
    await send(app, "POST", "/api/memories", { content: "Deploys go through GitHub Actions to Cloudflare", category: "fact" });

    const r = await (await send(app, "GET", `/api/memories?q=${encodeURIComponent("coding whitespace convention")}`)).json();
    expect(r.modeUsed).toBe("hybrid");
    expect(r.note).toBeNull();
    expect(r.items[0].content).toMatch(/tabs over spaces/);

    const dup = await (await send(app, "POST", "/api/memories", { content: "The user likes tabs rather than spaces for indenting" })).json();
    expect(dup.embedded).toBe(true);
    expect(dup.similar[0].memory.content).toMatch(/prefers tabs/);

    const status = await (await send(app, "GET", "/api/status")).json();
    expect(status).toMatchObject({ total: 3, vectors: 3, state: { status: "ok" } });
  });
});
