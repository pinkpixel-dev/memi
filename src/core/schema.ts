import type { Database } from "better-sqlite3";

const V1 = `
CREATE TABLE memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope       TEXT NOT NULL CHECK (scope IN ('global','project')),
  project     TEXT,
  agent       TEXT,
  category    TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  importance  INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK ((scope = 'global' AND project IS NULL) OR (scope = 'project' AND project IS NOT NULL))
);
CREATE INDEX idx_memories_scope ON memories(scope, project);
CREATE INDEX idx_memories_category ON memories(category);

CREATE TABLE categories (
  name        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  builtin     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, tags, category,
  content='memories', content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags, category)
  VALUES (new.id, new.content, new.tags, new.category);
END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags, category)
  VALUES ('delete', old.id, old.content, old.tags, old.category);
END;
CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags, category)
  VALUES ('delete', old.id, old.content, old.tags, old.category);
  INSERT INTO memories_fts(rowid, content, tags, category)
  VALUES (new.id, new.content, new.tags, new.category);
END;
`;

const MIGRATIONS = [V1];

export function migrate(db: Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
