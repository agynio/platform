# Agents

Composable, graph-driven AI agents (LangGraph) with a live-updatable runtime, Docker-backed tools/MCP, and a minimal UI.

Quick links
- Server: [apps/server](apps/server) — runtime, triggers, tools, MCP, graph persistence
- UI: [apps/ui](apps/ui) — graph builder and checkpoint stream viewer
- Docs: [docs/README.md](docs/README.md) — technical overview, contributing, MCP design
- Tools: [docs/tools/remind_me.md](docs/tools/remind_me.md) — RemindMe tool behavior and usage

Getting started
- Architecture and setup: [docs/technical-overview.md](docs/technical-overview.md)
- Contribution workflow & style guides: [docs/contributing/index.md](docs/contributing/index.md)

Server graph store configuration
- GRAPH_STORE: `mongo` | `git` (default `mongo`)
- GRAPH_REPO_PATH: path to local git repo (default `./data/graph`)
- GRAPH_BRANCH: branch name (default `graph-state`)
- GRAPH_AUTHOR_NAME / GRAPH_AUTHOR_EMAIL: default commit author

Git graph storage (format: 2)
- Root-level files/directories: `graph.meta.json`, `nodes/`, `edges/`, and advisory lock `.graph.lock`.
- Filenames use encodeURIComponent(id); edge ids are deterministic: `<src>-<srcH>__<tgt>-<tgtH>`.
- Writes are atomic per-entity; meta is written last; `.graph.lock` guards concurrent writers.

Migration
- From legacy layouts (`graphs/<name>/graph.json` or per-entity under `graphs/<name>/`), run:
  `tsx scripts/migrate_graph_storage.ts`
- Options via env: GRAPH_REPO_PATH, GRAPH_BRANCH, GRAPH_AUTHOR_NAME, GRAPH_AUTHOR_EMAIL, GRAPH_NAME.
- The script stages `graph.meta.json`, `nodes/`, `edges/`, removes `graphs/`, and commits the change.
