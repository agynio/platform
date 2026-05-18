---
title: Helm Charts
description: Install Agyn platform and apps charts.
order: 2
---

# Helm Charts

`agynio/platform-charts` contains two umbrella charts.

| Chart | Purpose |
| --- | --- |
| `charts/agyn-platform` | Deploys core platform services. |
| `charts/agyn-apps` | Deploys optional apps plus the default Kubernetes runner. |

Local chart install:

```sh
helm dependency update charts/agyn-platform
helm upgrade --install agyn-platform charts/agyn-platform \
  --namespace platform \
  --create-namespace \
  --values production-platform-values.yaml
```

Published OCI install:

```sh
helm upgrade --install agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --version 0.1.0 \
  --namespace platform \
  --create-namespace \
  --values production-platform-values.yaml
```

Repeat with `agyn-apps` for apps and the default runner.
