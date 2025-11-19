# Observability Stage 1 — Plan (SDK + Server + PoC)

> **Archived:** The tracing SDK/server/UI described below were removed in issue #760. The plan is retained only for historical reference until a new observability stack is defined.

Authoritative scope for Issue #82. Dev/local only, no auth or rate limiting. Minimal filters.

Changes (update):
- No Docker compose; run server from sources via pnpm scripts.
- Example moved into its own package `@agyn/obs-examples`.

Run server from sources
- Original implementation relied on a dedicated tracing server (now removed). Refer to git history prior to issue #760 for exact package commands and endpoints.

Example package
- Example scripts that exercised the tracing APIs have been removed alongside the server.

Linking from Builder UI (Activity panel)
- The Builder UI no longer links to a separate tracing interface, and node activity now displays a simple tracing-removed notice.

Scope
- Observability services and UI are provided as separate components. Docker compose is optional/orthogonal to local dev and not required for Stage 1.

The rest of the plan remains unchanged: minimal filters, status transitions, index strategy, and acceptance criteria.
