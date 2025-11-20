# Contributing to HautechAI/agents

Thank you for taking the time to contribute! This document explains how to set up your environment, the contribution workflow, and links to our style guides.

- Repository type: pnpm monorepo (apps and packages)
- Languages: TypeScript (Node.js server, React UI)
- Package manager: pnpm 10+
- Test runner: Vitest
- Formatter: Prettier

## Prerequisites
- Node.js 20+
- pnpm 10+
- Docker (optional, for local Postgres via docker-compose)

## Getting Started
1. Install dependencies (workspace-aware):
   ```bash
   pnpm install
   ```
2. Copy environment file(s) and set required variables:
  - Server app: `packages/platform-server/.env.example` -> `packages/platform-server/.env`
3. Optional: start Postgres via docker-compose:
   ```bash
   docker compose up -d agents-db
   ```

## Common Scripts
- Run UI in dev: `pnpm --filter @agyn/platform-ui dev`
- Run Server in dev: `pnpm --filter @agyn/platform-server dev`
- Test all packages: `pnpm test`

Tip: Use `pnpm -w run <script>` for workspace-wide scripts, or `pnpm --filter <pkg>` to scope.

## Branching Model
Use short, descriptive branches:
- `feat/<scope>` new feature
- `fix/<scope>` bug fix
- `docs/<scope>` documentation-only
- `chore/<scope>` maintenance tasks
- `refactor/<scope>` internal refactors

Examples: `feat/graph-runtime-ports`, `fix/ui-socket-reconnect`.

## Commit Messages
Follow Conventional Commits:
- `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `refactor: ...`, `chore: ...`
- Scope optional: `feat(server): add checkpoint stream`.

This keeps history readable and enables future automation.

## Pull Requests
- Keep PRs focused and small. Prefer multiple small PRs over one large PR.
- Include a brief description, motivation, and screenshots/GIFs for UI changes.
- Add or update tests where it makes sense.
- Ensure formatting passes (Prettier) and fix lint issues in changed files.
- Link related issues or context threads.

### PR Checklist
- [ ] Code compiles and runs locally (server and/or UI as applicable)
- [ ] Tests pass locally (`pnpm test`)
- [ ] Documentation updated (README, or `docs/` where applicable)
- [ ] No secrets committed (verify `.env`, keys, tokens are not added)

## Code Review
- We value clarity over cleverness. Leave comments explaining non-obvious decisions.
- Prefer “first-bad-then-good” examples in dev docs to highlight best practices (see Style Guides below).
- Be kind. Assume positive intent.

## Security and Privacy
- Never commit secrets. Use `.env` files and local environment variables.
- Redact tokens and keys in issue/PR descriptions and screenshots.
- If you suspect a security issue, notify maintainers directly.

## Style Guides and Standards
- See our style guides for TypeScript/React, server code, tests, Markdown, and docs:
  - [Development Style Guides](./style_guides.md)

## Directory Structure (high level)
```
packages/
  server/      # Node.js/TS server
  ui/          # React + Vite UI
packages/
  shared/      # Shared types/utilities
```

## Local Postgres (optional)
Postgres is required for memory persistence and LangGraph checkpoints. A docker-compose service `agents-db` is provided for local development.

## Questions?
Open a GitHub issue or reach out in Slack.
