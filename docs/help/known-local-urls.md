---
title: Known Local URLs
description: Local URLs exposed by the bootstrap defaults.
order: 2
---

# Known Local URLs

Bootstrap defaults use `agyn.dev` and port `2496`.

| Surface | URL |
| --- | --- |
| Platform UI | `https://agyn.dev:2496/` |
| Platform API | `https://agyn.dev:2496/api` |
| Argo CD | `https://argocd.agyn.dev:2496/` |
| OpenFGA API | `https://openfga.agyn.dev:2496/` |
| OpenFGA Playground | `https://openfga-playground.agyn.dev:2496/` |

Additional routed hosts include `chat`, `console`, `gateway`, `llm`, `media`, `minio`, `minio-api`, and `tracing`.

Ziti passthrough hosts are `ziti`, `ziti-mgmt`, and `ziti-router`.

Change the base domain with `DOMAIN` and the port with `PORT` when running `./apply.sh`.
