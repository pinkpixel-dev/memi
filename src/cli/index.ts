#!/usr/bin/env node
import { Command } from "commander";
import { APP_VERSION } from "../lib/app-info.js";
import { registerConfig } from "./commands/config.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerMemories } from "./commands/memories.js";
import { registerReindex } from "./commands/reindex.js";
import { registerServe } from "./commands/serve.js";
import { registerUi } from "./commands/ui.js";
import { exitOnKnownError } from "./util.js";

const program = new Command().name("memi").description("Local-first memory for AI agents").version(APP_VERSION);

for (const register of [registerServe, registerMemories, registerReindex, registerConfig, registerDoctor, registerUi]) register(program);

try {
  // Option parsers such as --scope and --importance throw while parsing, before any command action runs.
  await program.parseAsync();
} catch (err) {
  exitOnKnownError(err);
}
