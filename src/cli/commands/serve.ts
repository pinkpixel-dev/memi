import { openRuntime } from "../../core/runtime.js";
import { serveStdio } from "../../mcp/server.js";
import { action, type Register } from "../util.js";

export const registerServe: Register = (program) => {
  program
    .command("serve")
    .description("Run the MCP server over stdio")
    .action(action(async () => serveStdio(openRuntime())));
};
