---
title: Agyn Documentation
description: Task-driven documentation for installing, configuring, using, and operating Agyn.
order: 0
---

# Agyn Documentation

Agyn is a Kubernetes-native platform for running AI agents with organization-scoped access, private networking, model routing, tools, files, and observability.

The docs are organized around the work you are trying to do.

## Install tracks

- **Quick install for development and demos:** use `agynio/bootstrap` to create a local reference environment.
- **Production install:** use `agynio/platform-charts` with your own Istio, OpenZiti, OpenFGA, OIDC, databases, S3, and Kubernetes Secrets.

## Sections

- [Getting started](./getting-started/README.md) gives the shortest path to a working local stack.
- [Deploy](./deploy/README.md) explains quick bootstrap and production Helm installs.
- [Configure](./configure/README.md) covers the Console, agents, models, secrets, runners, and Terraform automation.
- [Use Agyn](./use-agyn/README.md) covers chat, run inspection, usage, files, media, and port exposure.
- [Reference](./reference/README.md) contains the service catalog.
- [Help](./help/README.md) provides troubleshooting checks.
