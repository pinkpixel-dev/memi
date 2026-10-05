import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { MemiError, type Scope } from "./types.js";

export interface ProjectInfo {
  project: string;
  source: "explicit" | "env" | "git" | "agent";
}

export function findGitRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Project id order: explicit argument, MEMI_PROJECT, git root folder name, then the agent name.
 * Returns null when nothing identifies a project, so callers can fall back to global or ask.
 */
export function resolveProject(opts: { project?: string | null; agent?: string | null; cwd?: string }): ProjectInfo | null {
  const explicit = opts.project?.trim();
  if (explicit) return { project: explicit, source: "explicit" };
  const env = process.env.MEMI_PROJECT?.trim();
  if (env) return { project: env, source: "env" };
  const root = findGitRoot(opts.cwd ?? process.cwd());
  if (root) return { project: basename(root), source: "git" };
  const agent = opts.agent?.trim();
  if (agent) return { project: `agent:${agent}`, source: "agent" };
  return null;
}

export function requireProject(opts: Parameters<typeof resolveProject>[0]): ProjectInfo {
  const info = resolveProject(opts);
  if (!info) {
    throw new MemiError(
      "Could not work out which project this is. There is no git repo here and no agent name set. " +
        "Pass a project name, set MEMI_PROJECT, or set an agent name with MEMI_AGENT.",
    );
  }
  return info;
}

/**
 * Where a new memory goes. With no explicit scope it lands in the current project when one can be
 * worked out, and in global otherwise.
 */
export function pickScope(opts: {
  scope?: Scope;
  project?: string | null;
  agent?: string | null;
  cwd?: string;
}): { scope: Scope; project: string | null } {
  if (opts.scope === "global") return { scope: "global", project: null };
  if (opts.scope === "project") return { scope: "project", project: requireProject(opts).project };
  const info = resolveProject(opts);
  return info ? { scope: "project", project: info.project } : { scope: "global", project: null };
}
