import { createRequire } from "node:module";

// package.json is the single source of truth for the version. This path works from both src/ and dist/.
const pkg = createRequire(import.meta.url)("../../package.json") as { name: string; version: string };

export const APP_NAME = pkg.name;
export const APP_VERSION = pkg.version;
