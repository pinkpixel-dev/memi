import { spawn } from "node:child_process";
import { openRuntime } from "../../core/runtime.js";
import { startUi } from "../../ui/server.js";
import { action, toInt, type Register } from "../util.js";

function openBrowser(url: string) {
  const [cmd, args]: [string, string[]] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" })
    .on("error", () => console.error(`Could not open a browser. Visit ${url}`))
    .unref();
}

export const registerUi: Register = (program) => {
  program
    .command("ui")
    .description("Run the local memory manager")
    .option("-p, --port <n>", "port (default: ui.port from config, 4747)", toInt("Port"))
    .option("--open", "open it in your browser")
    .action(
      action(async (o) => {
        const rt = openRuntime();
        const ui = await startUi(rt, { port: o.port ?? rt.config.ui.port });
        console.log(`memi UI running at ${ui.url}\nPress Ctrl+C to stop.`);
        if (o.open) openBrowser(ui.url);
        process.once("SIGINT", () => ui.close().then(() => process.exit(0)));
        process.once("SIGTERM", () => ui.close().then(() => process.exit(0)));
      }),
    );
};
