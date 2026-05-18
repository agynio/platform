---
title: Helm values reference
description: Pointer to platform-charts values documentation.
order: 5
---

# Helm values reference

The platform installs via the `agynio/platform-charts` umbrella chart, which composes per-service charts. Each chart has its own `values.yaml` with documented defaults. This page is a pointer to the full reference and a summary of the values you most commonly touch.

## Where the docs live

- **Chart repo:** [agynio/platform-charts](https://github.com/agynio/platform-charts).
- **Per-chart README:** `charts/<service>/README.md` in the repo.
- **Auto-generated values reference:** rendered from `values.schema.json` on each release.

## Common values

### Global

```yaml
global:
  domain: agyn.example.com          # public domain
  tlsSecretName: agyn-tls           # cert-manager-issued cert
  image:
    registry: ghcr.io/agynio
    pullPolicy: IfNotPresent
```

### OIDC

```yaml
oidc:
  existingSecret: agyn-platform-oidc   # Secret with issuer / clientId / clientSecret
```

### Postgres

```yaml
postgres:
  existingSecret: agyn-platform-postgres  # Secret with per-service DSNs
```

### Redis

```yaml
redis:
  existingSecret: agyn-platform-redis    # Secret with `url`
```

### S3

```yaml
s3:
  existingSecret: agyn-platform-s3       # Secret with bucket / region / accessKey / secretKey
```

### OpenZiti

```yaml
ziti:
  existingSecret: agyn-platform-ziti     # Secret with controllerUrl / cert / key
```

### OpenFGA

```yaml
openfga:
  existingSecret: agyn-platform-openfga  # Secret with apiUrl / storeId / apiToken
```

### Bootstrap admin (first install only)

```yaml
bootstrap:
  adminOidcSubject: <your OIDC sub>
  adminEmail: you@example.com
  adminName: Platform Admin
```

### Per-service resource overrides

Every service supports the standard pattern:

```yaml
gateway:
  replicaCount: 3
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 100m
      memory: 256Mi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
```

Apply the same shape under `chat`, `threads`, `agents`, `runners`, `llmProxy`, `tracing`, etc.

### Network policies

```yaml
networkPolicies:
  enabled: true
```

### Monitoring

```yaml
monitoring:
  serviceMonitor:
    enabled: true     # requires Prometheus Operator
```

## Per-service Secrets

The platform expects you to pre-create these Secrets in the `agyn` namespace:

| Secret | Keys |
|---|---|
| `agyn-platform-oidc` | `issuer`, `clientId`, `clientSecret` |
| `agyn-platform-postgres` | `users_dsn`, `organizations_dsn`, `agents_dsn`, `threads_dsn`, `runners_dsn`, `tracing_dsn`, `apps_dsn`, `metering_dsn`, `secrets_dsn`, `identity_dsn` |
| `agyn-platform-redis` | `url` |
| `agyn-platform-s3` | `bucket`, `region`, `accessKey`, `secretKey` |
| `agyn-platform-ziti` | `controllerUrl`, `client.crt`, `client.key` |
| `agyn-platform-openfga` | `apiUrl`, `storeId`, `apiToken` |

The exact keys and structure are documented in the chart repo's `examples/values-production.yaml`.

## Sample values files

The chart repo includes:

- `examples/values-dev.yaml` — minimal, for evaluation.
- `examples/values-production.yaml` — full production setup with all the values pinned.
- `examples/values-hardened.yaml` — production + network policies + restricted PSS.

Start from the closest match and override.

## Related

- [Self-host install → Production install](../self-host-install/production-install.md)
- [Operate → Architecture overview](../operate/architecture.md)
- [Operate → Networking](../operate/networking.md)
- [Operate → Security](../operate/security.md)
