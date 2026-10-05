# Changelog

## 1.1.0 - October 5, 2026

### 📊 Dashboard
- The UI now opens on a dashboard with memories stored, memories recalled, an activity chart, and bar charts for projects and categories
- Pick a time range (all time, 24h, 7d, 30d, or 90d) and every panel follows it
- Click a project or category bar to jump to the memories page with that filter applied

### 🗂️ Memories page
- Memories show up in a table with time, agent, memory, project, category, and importance columns. On phones each row turns into a small card
- Clicking a row opens a side panel with the whole memory and its details. Edit, pin, delete, and copy all live there too
- New filters: by agent in the sidebar, and by when a memory was last updated (24h, 7d, 30d, or 90d)

### 🔌 MCP server
- `recall` now logs each call (time, agent, project, and how many memories it returned) so the dashboard can count them. The search text isn't stored

### 🗄️ Database
- New `recalls` table and an index on `created_at`. The migration runs on its own the first time memi opens the database, and existing memories aren't touched

### 🏷️ Versioning
- Bumped to 1.1.0

## 1.0.1 - October 4, 2026

### 🎨 UI
- The memi mascot now sits next to the name in the sidebar and is used as the browser tab icon (plus an Apple touch icon)
- Quieter styling overall: softer borders, filled search and inputs, roomier memory rows, and the sidebar header lines up with the top bar

## 1.0.0 - October 4, 2026

First release.

### 🧠 Memory store
- Memories live in one local SQLite file at `~/.memi/memi.db`
- Each memory is global or belongs to one project, and has a category, tags, an importance from 1 to 5, and an optional pin
- The project comes from the git repo folder name, with the agent name as the fallback in folders that have no repo

### 🔎 Search
- Hybrid search that merges SQLite FTS5 keyword results with `sqlite-vec` vector results using reciprocal rank fusion
- Importance and recency give results a small nudge, small enough that relevance still wins
- Falls back to keyword search, and says so, when vectors aren't usable
- Saving a memory points out near-duplicates that already exist

### 🧬 Embeddings
- Ollama (`nomic-embed-text` by default) or OpenAI (`text-embedding-3-small` by default)
- Changing the embedder turns semantic search off with a warning about the different vector sizes. `memi reindex` drops and rebuilds the vector table and re-embeds your memories, and the memories themselves are kept
- A memory is still saved when the embedder is down, and `memi reindex --missing` fills in its vector later

### 🔌 MCP server
- `memi serve` runs an MCP server over stdio with seven tools: `get_context`, `recall`, `remember`, `update_memory`, `forget`, `list_memories`, and `list_categories`

### 💻 CLI
- `memi add`, `search`, `list`, `update`, `forget`, `categories`, `config`, `reindex`, `doctor`, `ui`, and `serve`
- Known errors print one line and exit with code 1, and commands that need a confirmation refuse to guess when there is no terminal to ask in

### 🖥️ Local UI
- `memi ui` serves a memory manager on `http://localhost:4747` for searching, filtering, adding, editing, pinning, and deleting memories
- Works on phone-sized screens and by keyboard, touch, or mouse
- Listens on `127.0.0.1` only, rejects requests from other sites, and renders memory text as plain text under a strict Content Security Policy

### 🧩 Agent skills
- `memi-memory` for the everyday recall and remember habit, `memi-curate` for cleaning up a store with approval before deleting, and `memi-setup` for install and troubleshooting

### 📦 Packaging
- Published as `@pinkpixel/memi`, so it runs with `npx -y @pinkpixel/memi serve` or installs globally to give a `memi` command
- Needs Node.js 22 or newer
- Licensed under Apache 2.0
