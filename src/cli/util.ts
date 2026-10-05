import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { MemiError } from "../core/types.js";
import { EmbedError } from "../embed/types.js";

/** Prints expected failures as one clean line and exits 1. Anything else is a real bug and is rethrown. */
export function exitOnKnownError(err: unknown): never {
  const e = err as Error;
  if (e instanceof MemiError || e instanceof EmbedError || e.name === "ZodError") {
    console.error(`memi: ${e.message}`);
    process.exit(1);
  }
  throw err;
}

/** Wraps a command action so expected failures print one clean line instead of a stack trace. */
export function action<A extends unknown[]>(fn: (...args: A) => Promise<void> | void) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      exitOnKnownError(err);
    }
  };
}

export async function confirm(question: string, yes?: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) throw new MemiError("This needs confirmation and there is no terminal to ask in. Pass --yes to continue.");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

export const splitTags = (v?: string) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : undefined);

export function toInt(name: string) {
  return (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new MemiError(`${name} must be a whole number.`);
    return n;
  };
}

export const printJson = (v: unknown) => console.log(JSON.stringify(v, null, 2));

export type Register = (program: Command) => void;
