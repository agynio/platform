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

Development services
- docker compose up -d mongo1 mongo-setup mongo-express jaeger
- Optional: start Vault for dev secret flows: `docker compose up -d vault vault-init`
  - Set VAULT_ENABLED=true, VAULT_ADDR, VAULT_TOKEN in apps/server/.env
  - See docs/security/vault.md

Server graph store configuration
- GRAPH_STORE: `mongo` | `git` (default `mongo`)
- GRAPH_REPO_PATH: path to local git repo (default `./data/graph`)
- GRAPH_BRANCH: branch name (default `graph-state`)
- GRAPH_AUTHOR_NAME / GRAPH_AUTHOR_EMAIL: default commit author
Run migration: `tsx scripts/migrate_graph_to_git.ts` to export Mongo graphs into the git repo.
