import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as sqliteVec from "sqlite-vec";
import { dbPath } from "./config.js";
import { migrate } from "./schema.js";
import { BUILTIN_CATEGORIES } from "./types.js";

export type Db = Database.Database;

export function openDb(path: string = dbPath()): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  sqliteVec.load(db);
  migrate(db);
  const seed = db.prepare("INSERT OR IGNORE INTO categories(name, description, builtin) VALUES (?, ?, 1)");
  for (const [name, description] of Object.entries(BUILTIN_CATEGORIES)) seed.run(name, description);
  return db;
}
