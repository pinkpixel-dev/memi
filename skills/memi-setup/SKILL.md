---
name: memi-setup
version: 1.0.0
description: |
  Install, configure, and troubleshoot memi, the local memory system for AI
  agents. Use when the user wants to set up memi, connect its MCP server to a
  client, choose or switch between Ollama and OpenAI embeddings, install the memi
  skills, back up the database, or when memi reports problems such as
  "Could not reach", "not found, try pulling it first", "OPENAI_API_KEY is not
  set", "The embedder changed", "No project detected", or memories missing
  vectors. Also use to interpret `memi doctor` output.
license: Apache-2.0
compatibility: claude-code cursor codex gemini-cli opencode
---

# Setting up memi

Start with `memi doctor`. It checks the database, the embedder, the vector index, and project detection, and exits 1 if something is wrong. Most problems show up there with a line that says what to do.

## Requirements

- Node.js 22 or newer.
- One embedder:
  - **Ollama** (the default, runs locally): install Ollama, then `ollama pull nomic-embed-text`.
  - **OpenAI**: an API key in the `OPENAI_API_KEY` environment variable. Memory text is sent to OpenAI to be embedded.

## Install

Either install it globally, which gives you a `memi` command and the fastest MCP start:

```bash
npm install -g @pinkpixel/memi
memi doctor
```

or let `npx` fetch it on demand, with no install step:

```bash
npx -y @pinkpixel/memi doctor
```

Everything below says `memi`. If memi is not installed globally, use `npx -y @pinkpixel/memi` in its place.

To work on memi itself, build it from source (`npm install`, then `npm run build`) and run `node dist/cli/index.js`.

## Connect the MCP server

### Claude Code

```bash
claude mcp add memi -s user -e MEMI_AGENT=claude -- npx -y @pinkpixel/memi serve
claude mcp list
```

`-s user` makes memi available in every project, which is what you want because memory is shared across them. Drop it to limit memi to the current project. `MEMI_AGENT` is optional, see "Agent name" below.

The first start downloads the package, which takes a few seconds. After that npx reuses its cache. The cache can keep an old version, so use `@pinkpixel/memi@latest` if you want the newest one every time. With a global install, use `memi serve` as the command instead.

### Other clients

Any client that can launch a stdio MCP server needs the same three things: a command, its arguments, and optional environment variables. In the common `mcpServers` JSON format:

```json
{
  "mcpServers": {
    "memi": {
      "command": "npx",
      "args": ["-y", "@pinkpixel/memi", "serve"],
      "env": { "MEMI_AGENT": "my-agent" }
    }
  }
}
```

Restart the client after editing its config. memi has been tested with Claude Code. Other clients should work but have not been checked.

## Install the skills

The skills ship inside the package. Copy or symlink the folders (`memi-memory`, `memi-curate`, `memi-setup`) into your client's skills directory. For Claude Code that is `~/.claude/skills/`, and with a global install:

```bash
ln -s "$(npm root -g)/@pinkpixel/memi/skills/"* ~/.claude/skills/
```

Without a global install, take the `skills` folder from the repo. Symlinks mean a package update carries through.

## Agent name

Memories are tied to a project, which memi works out from the git repo folder name. In a folder with no git repo it falls back to the agent name, stored as `agent:<name>`. Without either, project memories cannot be saved.

Set the name with `memi config set agent <name>` or the `MEMI_AGENT` environment variable. `MEMI_PROJECT` forces a project name outright.

The agent name is also recorded on each memory so you can see who wrote it.

## Embedders

```bash
memi config                                         # show what is in effect
memi config set embedder.provider openai            # ollama or openai
memi config set embedder.model text-embedding-3-small
memi config set embedder.baseUrl http://localhost:11434
```

| Provider | Default model | Needs |
|---|---|---|
| `ollama` | `nomic-embed-text` | Ollama running, the model pulled |
| `openai` | `text-embedding-3-small` | `OPENAI_API_KEY` in the environment that launches memi |

The API key is only ever read from the environment. memi never writes it to `config.json`. For an MCP client, put it in the server's `env` block (for Claude Code, add `-e OPENAI_API_KEY=...` to the `claude mcp add` command).

Environment variables override the config file: `MEMI_EMBED_PROVIDER`, `MEMI_EMBED_MODEL`, `MEMI_OLLAMA_URL`, `OPENAI_BASE_URL`.

### Switching embedders

> **Different models produce vectors with different dimensions, so existing vectors cannot be reused.**

When you change the provider or model, memi notices that the stored vectors came from something else. Semantic search turns off and keyword search carries on. Nothing is deleted. To finish the switch:

```bash
memi reindex
```

This drops the vector table, rebuilds it for the new model, and re-embeds every saved memory. **Your memories are kept.** It asks for confirmation (pass `--yes` in scripts). All the embedding happens before anything is dropped, so if the new embedder is unreachable, nothing changes. With OpenAI, reindexing sends every memory's text to OpenAI.

If you switch back to the model the vectors were built with, no reindex is needed.

## Where the data lives

- Database: `~/.memi/memi.db`. Config: `~/.memi/config.json`. Set `MEMI_HOME` to move both.
- SQLite runs in WAL mode, so you may see `memi.db-wal` and `memi.db-shm` next to the database while memi is running.
- To back up, copy the three files together while nothing is using the database, or use `sqlite3 ~/.memi/memi.db ".backup backup.db"`.
- Restoring the database brings back the memories and their vectors. If you restore it while using a different embedder, memi will ask for a reindex.

## Reading `memi doctor`

| Line | Meaning | Fix |
|---|---|---|
| `fail Could not reach http://localhost:11434...` | Ollama is not running | Start Ollama |
| `fail ... model "x" not found, try pulling it first` | The model is not downloaded | `ollama pull x` |
| `fail OPENAI_API_KEY is not set` | Provider is `openai` with no key | Export the key where memi runs |
| `fail The embedder changed from ...` | Config no longer matches the stored vectors | `memi reindex`, or switch the config back |
| `warn N memories have no vector` | Saved while the embedder was down | `memi reindex --missing` (drops nothing) |
| `warn No project detected here` | No git repo, and no agent name | Set `MEMI_AGENT`, or run inside a git repo |
| `ok No vectors yet` | Nothing saved yet | Nothing. The index is created on the first save |

## The local UI

`memi ui` starts a memory manager at `http://localhost:4747`. Use it to browse, search, edit, pin, and delete memories. Add `--open` to open your browser, or `--port <n>` to change the port (or `memi config set ui.port <n>`). Press Ctrl+C to stop it.

It only listens on this machine and ignores requests that don't come from `localhost`. If it says the port is already in use, something else is on 4747 (often another `memi ui`), so pick another port.

If the UI shows a banner about the embedder, it is the same message as `memi doctor`. The UI doesn't run `memi reindex` for you, but the banner has the command with a copy button.

## If the MCP client shows no memi tools

1. Run `memi doctor` (or `npx -y @pinkpixel/memi doctor`) outside the client to rule out memi itself.
2. Check that the client can find `npx` (or `memi`). A client launched from a desktop icon may not see the same `PATH` as your terminal. Node.js 22 or newer is required.
3. The first npx start downloads the package. If the client gives up before it finishes, run `npx -y @pinkpixel/memi --version` once in a terminal to fill the cache, or install globally and use `memi serve`.
4. Restart the client.
