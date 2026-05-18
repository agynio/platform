---
title: Getting Started
description: Install Agyn locally, open the product, and create the first agent.
order: 1
---

# Getting Started

The fastest path is the `agynio/bootstrap` repository.

It provisions the local Kubernetes stack, system dependencies, routing, data services, and Agyn platform components with Terraform.

## Requirements

- `terraform`
- `kubectl`
- A local environment that can run the Kubernetes stack defined by `bootstrap/stacks/k8s`

## Flow

1. [Install locally](./install-local.md) with `./apply.sh`.
2. [Open the console](./open-the-console.md) at `https://agyn.dev:2496/`.
3. [Deploy your first agent](./deploy-your-first-agent.md) using the Terraform provider shape.

For architecture context, read [System overview](../concepts/system-overview.md).
