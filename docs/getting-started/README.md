---
title: Getting Started
description: Get Agyn running quickly with the bootstrap development install path.
order: 1
---

# Getting Started

Use this path when you want Agyn running for development, demos, or evaluation.

It uses `agynio/bootstrap`, which provisions Kubernetes, system dependencies, routing, data services, platform services, apps, and Ziti with Terraform.

## Steps

1. Clone bootstrap:

   ```sh
   git clone https://github.com/agynio/bootstrap.git
   cd bootstrap
   ```

2. Run the installer:

   ```sh
   chmod +x apply.sh
   ./apply.sh
   ```

3. For non-interactive defaults, run:

   ```sh
   ./apply.sh -y
   ```

4. Open the product at `https://agyn.dev:2496/`.

## Expected outcome

You should have a local Agyn environment with platform UI, Gateway API, Argo CD, OpenFGA, routing, databases, apps, and the default Kubernetes runner.

Default URLs include `https://agyn.dev:2496/`, `https://agyn.dev:2496/api`, `https://argocd.agyn.dev:2496/`, and `https://openfga-playground.agyn.dev:2496/`.

For install details, see [Quick bootstrap](../deploy/quick-bootstrap.md).
