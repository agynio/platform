---
title: Routing and Domains
description: Understand default local routes and ingress hosts.
order: 3
---

# Routing and Domains

Bootstrap defaults to `DOMAIN=agyn.dev` and `PORT=2496`.

The platform UI is available at `https://agyn.dev:2496/` and the API at `https://agyn.dev:2496/api`.

The routing stack declares platform hosts for:

- `argocd`, `chat`, `console`, `gateway`, `llm`, and `media`
- `minio`, `minio-api`, `openfga`, `openfga-playground`, and `tracing`
- Ziti passthrough hosts `ziti`, `ziti-mgmt`, and `ziti-router`

The stack uses an Istio `platform-gateway` for SIMPLE TLS platform hosts.

It uses a separate `ziti-passthrough-gateway` for TLS passthrough to Ziti services.

When using a custom domain, pass `DOMAIN` to `./apply.sh` or set matching Terraform variables.
