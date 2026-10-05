<p align="center">
  <img src="https://raw.githubusercontent.com/pinkpixel-dev/memi/HEAD/memi.png" alt="memi, a small smiling pastel blob with a sparkle" width="300">
</p>

# memi

Local-first memory for AI agents. Memories live in one SQLite file on your machine, and agents reach them through an MCP server.

AI agents forget everything when a session ends. memi gives them somewhere to keep the things worth remembering: decisions and why they were made, how you like things done, mistakes not to repeat. The next session can search that instead of asking you the same questions again.

## What it does

- Stores memories in a single SQLite file, with no server to run and no account to make
- Finds them by meaning and by keyword, using local embeddings from Ollama or OpenAI
- Keeps **global** memories (about you, across every project) apart from **project** memories (about one codebase)
- Lets you mark memories as important, pin the ones that must always be loaded, and sort them into categories
- Runs as an MCP server, so any client that speaks MCP can use it
- Comes with a CLI, a small local web UI for browsing and editing, and agent skills that teach an agent when to save and recall

## Install

You need:

- Node.js 22 or newer
- One embedder: [Ollama](https://ollama.com) (runs locally) or an OpenAI API key

Install it globally to get a `memi` command:

```bash
npm install -g @pinkpixel/memi
```

Or skip the install and let `npx` fetch it when it's needed. That's what the MCP setup below does:

```bash
npx -y @pinkpixel/memi doctor
```

The examples below say `memi`. If you didn't install globally, use `npx -y @pinkpixel/memi` in its place. To build it from source instead, see [Development](#development).

## Quick start

The default embedder is Ollama with `nomic-embed-text`, so pull that first:

```bash
ollama pull nomic-embed-text
```

Check that everything is wired up:

```bash
memi doctor
```

Save a few things, then search for them in different words:

```bash
memi add "I prefer tabs over spaces" --global --category preference
memi add "Deploys go through GitHub Actions to Cloudflare" --category fact
memi add "Keep answers short, with no summary at the end" --global --category preference

memi search "indentation style"
memi search "how do we ship releases"
```

Neither search shares a word with the memory it finds. That's the embeddings at work. (The second memory has no `--global`, so it belongs to whichever project you ran the command in.)

If you'd rather use OpenAI:

```bash
export OPENAI_API_KEY=sk-...
memi config set embedder.provider openai
```

Keep in mind that memory text gets sent to OpenAI to be embedded when you do this.

## Connect it to your agent

### Claude Code

```bash
claude mcp add memi -s user -e MEMI_AGENT=claude -- npx -y @pinkpixel/memi serve
claude mcp list
```

`-s user` makes memi available in every project, which is usually what you want for a memory. `MEMI_AGENT` is optional (more on that below).

The first start downloads the package, which takes a few seconds. After that npx reuses its cache, so starts are quick, and that cache can hold on to an older version. Use `@pinkpixel/memi@latest` in the command to always get the newest one. If you installed globally, you can use `memi serve` as the command instead, which starts fastest.

### Other clients

Anything that can launch a stdio MCP server needs a command, its arguments, and optionally some environment variables. In the common `mcpServers` format:

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

Restart the client after editing its config. I've only tested this with Claude Code so far, but other clients should work the same way.

### What the agent gets

| Tool | What it does |
|---|---|
| `get_context` | Loads the pinned and high-importance memories at the start of a session |
| `recall` | Searches by meaning and keyword |
| `remember` | Saves a memory, and points out similar ones that already exist |
| `update_memory` | Changes a memory, or moves it between global and a project |
| `forget` | Deletes a memory |
| `list_memories` | Browses without a search query |
| `list_categories` | Lists categories with counts |

## Install the skills

The tools alone don't tell an agent when to use them, so there are four skills in `skills/`:

| Skill | What it covers |
|---|---|
| `memi-memory` | The everyday habit: load context first, recall before deciding, save what's worth keeping, and never save secrets |
| `memi-curate` | Cleaning up a messy store. It proposes changes and waits for your approval before deleting anything |
| `memi-dream` | Looking back over a session to save what got missed, sharpen what it confirmed, and tidy the memories it touched. Anything that deletes or changes meaning still waits for you |
| `memi-setup` | Installing, connecting, switching embedders, and reading `memi doctor` |

They ship inside the package. Copy or symlink the folders into your client's skills directory. For Claude Code that's `~/.claude/skills/`, and with a global install it looks like this:

```bash
ln -s "$(npm root -g)/@pinkpixel/memi/skills/"* ~/.claude/skills/
```

Without a global install, grab the `skills` folder from the repo instead.

## The CLI

| Command | What it does |
|---|---|
| `memi add <content...>` | Save a memory. Options: `-c` category, `-i` importance 1 to 5, `-t` tags, `--pin`, `--global`, `-p` project |
| `memi search <query...>` | Search. Options: `--mode hybrid\|semantic\|text`, `--scope both\|project\|global\|all`, `-c`, `--min-importance`, `-n`, `--json` |
| `memi list` | Browse and filter. Same filters as search, plus `--pinned` and `--order recent\|oldest\|importance` |
| `memi update <id>` | Change a memory: `--content`, `-c`, `-i`, `-t`, `--pin`, `--unpin`, `--global`, `-p` |
| `memi forget <id>` | Delete one. Asks first, or pass `--yes` |
| `memi categories` | List categories with counts |
| `memi config` | Show settings. `memi config set <key> <value>` changes one |
| `memi reindex` | Rebuild the vector index. Asks first, or pass `--yes` |
| `memi doctor` | Check the database, the embedder, the index, and project detection |
| `memi ui` | Start the local web UI |
| `memi serve` | Run the MCP server |

Known errors print one line starting with `memi:` and exit with code 1. Commands that need a confirmation won't guess when there's no terminal to ask in. Pass `--yes` in scripts.

## The local UI

```bash
memi ui --open
```

This serves a small memory manager at `http://localhost:4747`. It has two pages.

**Dashboard** is where it opens. It shows how many memories you've stored, how many your agents have recalled, a chart of activity over time, and which projects and categories are filling up. Pick a range at the top (all time, 24h, 7d, 30d, or 90d). Clicking a project or category takes you to its memories.

**Memories** is a table of everything memi has saved, including which agent saved each one. Filter by scope, category, agent, importance, pinned, or how recently a memory was updated, or search by meaning and keyword. Click a row to read the whole memory in a side panel, and edit, pin, copy, or delete it from there. Deleting always asks first.

The recalled count only goes up when an agent calls `recall`. Each call logs the time, the agent, the project, and how many memories came back, but not what was searched for. Recalls from before version 1.1.0 weren't logged, so the count starts at zero after you upgrade.

A few keys help: `/` jumps to search, `n` starts a new memory, `Esc` closes whatever is open, and `Ctrl+Enter` saves. It's built for desktop first, but it works on a phone-sized screen too.

It only listens on your own machine, and it ignores requests that don't come from `localhost`, since it can delete things. Pick another port with `--port`, or `memi config set ui.port <n>`.

## Projects, scopes, and the agent name

Every memory is either **global** or belongs to one **project**. memi works out the project in this order:

1. A name you pass (`--project`, or the `project` argument of a tool)
2. The `MEMI_PROJECT` environment variable
3. The folder name of the git repo you're in
4. The agent name, stored as `agent:<name>`

That fourth one is for folders with no git repo. Set it with `memi config set agent <name>` or `MEMI_AGENT`. The agent name is also recorded on each memory, so you can see who wrote what.

With none of those, project memories can't be saved, and the error says what to set. Global memories always work.

One thing to know: the git check uses the folder name only. Two repos with the same folder name share a project. Pass an explicit project name if that bites you.

## Embeddings

| Provider | Default model | What you need |
|---|---|---|
| `ollama` | `nomic-embed-text` | Ollama running, with the model pulled |
| `openai` | `text-embedding-3-small` | `OPENAI_API_KEY` in the environment that runs memi |

```bash
memi config                                   # what's in effect right now
memi config set embedder.provider openai
memi config set embedder.model text-embedding-3-small
memi config set embedder.baseUrl http://localhost:11434
```

The API key is only ever read from the environment. memi never writes it to a file.

### Switching embedders

Different models make vectors of different sizes, so the vectors you already have can't be reused. When you change the embedder, memi notices and turns semantic search off, with a warning. Keyword search keeps working, and nothing is deleted.

To finish the switch:

```bash
memi reindex
```

That drops the vector table, rebuilds it for the new model, and re-embeds every saved memory. **Your memories are kept.** It asks before it starts. The embedding happens before anything is dropped, so if the new embedder isn't reachable, nothing changes. If you switch back to the original model, you don't need to reindex at all.

If a memory was saved while the embedder was down, it's still saved. It just has no vector yet. `memi reindex --missing` fills those in without dropping anything.

## Configuration

Settings come from `~/.memi/config.json`, and environment variables override them.

| Setting | Config key | Environment variable |
|---|---|---|
| Embedder | `embedder.provider` | `MEMI_EMBED_PROVIDER` |
| Model | `embedder.model` | `MEMI_EMBED_MODEL` |
| Embedder URL | `embedder.baseUrl` | `MEMI_OLLAMA_URL` (Ollama), `OPENAI_BASE_URL` (OpenAI) |
| Agent name | `agent` | `MEMI_AGENT` |
| UI port | `ui.port` | none |
| Force a project | none | `MEMI_PROJECT` |
| Data folder | none | `MEMI_HOME` |
| OpenAI key | none | `OPENAI_API_KEY` |

Setting `embedder.provider` clears the saved model and URL, so the new provider starts from its own defaults.

## Where your data lives

- Database: `~/.memi/memi.db`
- Config: `~/.memi/config.json`

Set `MEMI_HOME` to move both. SQLite runs in WAL mode, so you'll see `memi.db-wal` and `memi.db-shm` next to the database while memi is running. To back up, copy all three files while nothing is using the database, or run `sqlite3 ~/.memi/memi.db ".backup backup.db"`.

## How search works

Searches run two ways and merge the results: a keyword search (SQLite FTS5, with stemming) and a vector search (`sqlite-vec`, cosine distance). The two ranked lists are combined with reciprocal rank fusion. Importance and recency then give a small nudge, small enough that relevance still wins.

If vectors aren't usable, search falls back to keywords and tells you.

## Limitations

- Only tested on Linux so far
- Only tested with Claude Code as the MCP client
- Semantic search always returns its nearest matches, even when none of them are really relevant. There's no relevance cutoff yet
- Search quality depends on the embedding model. `nomic-embed-text` scores are fairly bunched together, so vague queries can rank oddly
- Two git repos with the same folder name share a project
- The UI can't run `memi reindex` yet. It shows the command to copy instead

## Development

To build from source:

```bash
git clone https://github.com/pinkpixel-dev/memi.git
cd memi
npm install
npm run build
```

Run it with `node dist/cli/index.js`, or point an MCP client at it with an absolute path:

```bash
claude mcp add memi -s user -- node /absolute/path/to/memi/dist/cli/index.js serve
```

Checks:

```bash
npm run typecheck
npm test
```

The tests are real ones. The end-to-end tests start the actual CLI and MCP server as child processes, and the UI tests run the real frontend modules against the real API. There are no mocks.

The semantic tests need Ollama running with `nomic-embed-text` pulled, and skip themselves if it isn't. One test, the embedder switch from 768 to 1024 dimensions, also needs a second model. It defaults to `qwen3-embedding:0.6b`, and you can use another with `MEMI_TEST_ALT_MODEL`. Without it, that one test is skipped.

The code is split up like this:

```
src/core/   storage, search, project detection, embeddings plumbing
src/embed/  Ollama and OpenAI providers
src/mcp/    the MCP server and its tools
src/cli/    the command line
src/ui/     the web UI's server
ui/         the web UI's files (plain HTML, CSS, and JavaScript, no build step)
skills/     the agent skills
tests/
```

## License

Apache 2.0. See [LICENSE](LICENSE).

---

Made with 💖 by [Pink Pixel](https://pinkpixel.dev)
