---
title: Quick Bootstrap
description: Install Agyn quickly for development, demos, and local evaluation.
order: 1
---

# Quick Bootstrap

Bootstrap is the fastest install path.

Use it when you want a working Agyn environment more than production-grade separation of dependencies.

## Steps

1. Install `terraform` and `kubectl`.
2. Clone and run bootstrap:

   ```sh
   git clone https://github.com/agynio/bootstrap.git
   cd bootstrap
   ./apply.sh -y
   ```

3. Override defaults only when needed:

   ```sh
   DOMAIN=agyn.local PORT=8443 ./apply.sh
   ```

4. Open `https://agyn.dev:2496/` or your custom domain and port.

## What bootstrap applies

Manual stack order is `k8s`, `system`, `routing`, `data`, and `platform`.

The repo also includes `apps` and `ziti` stacks used by the full local reference environment.

## Expected outcome

You should have a kubeconfig merged from `stacks/k8s/.kube/agyn-local-kubeconfig.yaml`, Istio routing, OpenFGA, platform services, app surfaces, and a default runner.
