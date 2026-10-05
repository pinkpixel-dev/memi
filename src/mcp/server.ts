import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { APP_VERSION } from "../lib/app-info.js";
import type { Runtime } from "../core/runtime.js";
import { registerTools } from "./tools.js";

const INSTRUCTIONS =
  "memi is long-term memory that persists between sessions. " +
  "Call get_context at the start of a session. Call recall before answering questions that past decisions or preferences might affect. " +
  "Call remember for durable decisions, preferences, facts, and mistakes. Prefer update_memory over saving a near-duplicate. " +
  "Never store secrets.";

export function createServer(rt: Runtime, cwd: string = process.cwd()): McpServer {
  const server = new McpServer({ name: "memi", version: APP_VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, {
    store: rt.store,
    agent: rt.agent,
    clientName: () => server.server.getClientVersion()?.name ?? null,
    cwd,
  });
  return server;
}

/** Serves MCP over stdio. stdout belongs to the protocol, so anything human-readable goes to stderr. */
export async function serveStdio(rt: Runtime): Promise<void> {
  const server = createServer(rt);
  await server.connect(new StdioServerTransport());
  console.error(`memi MCP server running (${rt.store.status().embedder?.provider ?? "no"} embedder)`);
}
