---
title: Install Locally
description: Run the bootstrap workflow for a local Agyn environment.
order: 1
---

# Install Locally

Clone the bootstrap repository and run the installer.

```sh
git clone https://github.com/agynio/bootstrap.git
cd bootstrap
chmod +x apply.sh
./apply.sh
```

For non-interactive setup, use auto-apply mode:

```sh
./apply.sh -y
```

The script accepts `DOMAIN`, `PORT`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `TRACING_APP_OIDC_CLIENT_ID`, `ADMIN_OIDC_SUBJECT`, `GHCR_USERNAME`, and `GHCR_TOKEN`.

Defaults are `agyn.dev` and port `2496`.

After the `k8s` stack creates kubeconfig, `apply.sh` merges `stacks/k8s/.kube/agyn-local-kubeconfig.yaml` into `~/.kube/config`.

Manual stack order is `k8s`, `system`, `routing`, `data`, and `platform`; `apps` and `ziti` are also present in the bootstrap tree.

Next: [Open the console](./open-the-console.md).
