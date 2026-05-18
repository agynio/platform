---
title: Deploy
description: Choose the right Agyn install path for development or production.
order: 2
---

# Deploy

Agyn has two install tracks.

## Quick install for development and demos

Use [Quick bootstrap](./quick-bootstrap.md) when you want a complete reference environment and can accept local defaults.

The bootstrap repository owns Terraform stacks for Kubernetes, system dependencies, routing, data, platform services, apps, and Ziti.

## Production install with Helm

Use [Production Helm](./production-helm.md) when you already operate Kubernetes and want explicit control over dependencies and secrets.

Production installs require the [prerequisites](./prerequisites.md): Istio, OpenZiti, OpenFGA, OIDC, databases, S3-compatible storage, and Kubernetes Secrets.

## Expected outcome

After deployment, operators should have the Console, Gateway API, chat surface, default runner, private networking, authorization, model routing, files, traces, and app infrastructure available.
