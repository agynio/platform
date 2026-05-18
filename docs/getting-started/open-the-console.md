---
title: Open the Console
description: Find the local Agyn URLs after bootstrap finishes.
order: 2
---

# Open the Console

The bootstrap defaults expose Agyn on `agyn.dev` with HTTPS port `2496`.

Open these URLs after `./apply.sh` completes:

- Platform UI: `https://agyn.dev:2496/`
- Platform API: `https://agyn.dev:2496/api`
- Argo CD: `https://argocd.agyn.dev:2496/`
- OpenFGA API: `https://openfga.agyn.dev:2496/`
- OpenFGA Playground: `https://openfga-playground.agyn.dev:2496/`

If you changed `DOMAIN` or `PORT`, replace those values in each URL.

The routing stack also declares hosts for `chat`, `console`, `gateway`, `llm`, `media`, `minio`, `tracing`, and Ziti endpoints.

Next: [Deploy your first agent](./deploy-your-first-agent.md).
