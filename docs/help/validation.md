---
title: Validation
description: Commands for validating docs, charts, and bootstrap health.
order: 3
---

# Validation

Validate this docs site from `docs-site`:

```sh
npm run lint
npm run validate
npm run build
```

Validate platform charts from `agynio/platform-charts`:

```sh
helm dependency update charts/agyn-platform
helm dependency update charts/agyn-apps
helm lint charts/agyn-platform charts/agyn-apps
helm template agyn-platform charts/agyn-platform >/tmp/agyn-platform.yaml
helm template agyn-apps charts/agyn-apps >/tmp/agyn-apps.yaml
yamllint .
```

Bootstrap includes `.github/scripts/verify_platform_health.sh` for platform health checks in CI.
