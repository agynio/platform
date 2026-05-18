---
title: Repository Map
description: Find the source repository for common Agyn work.
order: 3
---

# Repository Map

Agyn is split across product, architecture, deployment, and provider repositories.

| Repository | Use it for |
| --- | --- |
| `https://github.com/agynio/platform` | Product docs and top-level platform overview. |
| `https://github.com/agynio/bootstrap` | Local/reference Terraform deployment. |
| `https://github.com/agynio/platform-charts` | Helm umbrella charts for platform and apps. |
| `https://github.com/agynio/terraform-provider-agyn` | Terraform provider resources and generated docs. |
| `https://github.com/agynio/architecture` | Architecture, product concepts, changes, and maps. |

The bootstrap stack installs charts such as `agynio/charts/gateway`, `agents`, `threads`, `chat`, `files`, `llm`, `secrets`, `authorization`, `identity`, `runners`, and `organizations`.

The platform charts repository wraps those workloads into `agyn-platform` and `agyn-apps` umbrella charts.

Use [Microservices catalog](./services.md) for service-level repository links.
