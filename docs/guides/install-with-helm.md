---
title: Install with Helm
description: Deploy Agyn platform and app charts with production values.
order: 3
---

# Install with Helm

Authenticate if your GHCR charts are private:

```sh
helm registry login ghcr.io
```

Install platform services:

```sh
helm upgrade --install agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --version 0.1.0 \
  --namespace platform \
  --create-namespace \
  --values production-platform-values.yaml
```

Install apps and the default runner:

```sh
helm upgrade --install agyn-apps oci://ghcr.io/agynio/charts/agyn-apps \
  --version 0.1.0 \
  --namespace apps \
  --create-namespace \
  --values production-apps-values.yaml
```

Validate locally with `helm lint charts/agyn-platform charts/agyn-apps` in `agynio/platform-charts`.
