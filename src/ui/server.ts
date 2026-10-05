import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolveProject } from "../core/project.js";
import type { Runtime } from "../core/runtime.js";
import { MemiError } from "../core/types.js";
import { readAsset } from "./assets.js";
import { createApi } from "./routes.js";
import { guard } from "./security.js";

export function createApp(rt: Runtime, cwd: string = process.cwd()): Hono {
  const app = new Hono();
  app.use("*", guard);
  app.route("/api", createApi({ store: rt.store, currentProject: resolveProject({ agent: rt.agent, cwd })?.project ?? null }));
  app.get("*", async (c) => {
    const asset = await readAsset(new URL(c.req.url).pathname);
    if (!asset) return c.text("Not found", 404);
    return c.body(new Uint8Array(asset.body), 200, { "Content-Type": asset.type, "Cache-Control": asset.cache });
  });
  return app;
}

export interface RunningUi {
  url: string;
  close: () => Promise<void>;
}

/** Starts the UI on 127.0.0.1 only. Pass port 0 to let the system pick one. */
export function startUi(rt: Runtime, opts: { port: number; cwd?: string }): Promise<RunningUi> {
  const app = createApp(rt, opts.cwd);
  return new Promise((resolve, reject) => {
    // Without a createServer option, serve() returns a plain HTTP/1 server.
    const server = serve({ fetch: app.fetch, port: opts.port, hostname: "127.0.0.1" }, (info) => {
      resolve({
        url: `http://localhost:${info.port}`,
        close: () => new Promise((done) => (server.close(() => done()), server.closeAllConnections())),
      });
    }) as Server;
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EADDRINUSE" ? new MemiError(`Port ${opts.port} is already in use. Pick another with --port.`) : err),
    );
  });
}
