---
title: Bootstrap variables and chart values
description: Where install-time configuration lives.
order: 5
---

# Bootstrap variables and chart values

Configuration happens at two levels today:

1. **Bootstrap Terraform variables** — what `apply.sh` passes to the stacks. These tune install-wide things like domain, port, OIDC, and image versions.
2. **Per-service Helm charts** — each platform service ships its own chart at `ghcr.io/agynio/charts/<service>` with its own values. Bootstrap renders values for each chart inline in `stacks/platform/main.tf`.

A centralized umbrella chart at [`agynio/platform-charts`](https://github.com/agynio/platform-charts) is in preparation and will replace per-service deployment in bootstrap once it stabilizes. It is not in use today — bootstrap is still the source of truth for chart wiring.

This page is a pointer to both current levels.

## Bootstrap-level variables

`apply.sh` reads these from the environment (or prompts you for them in interactive mode):

| Variable | Default | Purpose |
|---|---|---|
| `DOMAIN` | `agyn.dev` | Base domain for every platform hostname. |
| `PORT` | `2496` | Host port for ingress traffic. |
| `OIDC_ISSUER_URL` | mock-IdP URL | OIDC issuer the platform validates ID tokens against. |
| `OIDC_CLIENT_ID` | mock client | OIDC client ID. |
| `OIDC_CLIENT_SECRET` | mock secret | OIDC client secret. |
| `TRACING_APP_OIDC_CLIENT_ID` | unset (falls back to `OIDC_CLIENT_ID`) | Separate OIDC client for the Tracing app, if you use one. |
| `ADMIN_OIDC_SUBJECT` | `admin@agyn.io` | OIDC subject of the user granted cluster admin. |
| `GHCR_USERNAME`, `GHCR_TOKEN` | unset | Credentials for private GHCR pulls. |

Defaults are baked into `apply.sh`; override them before running. See [Quick bootstrap](../self-host-install/quick-bootstrap.md).

## Per-stack Terraform variables

Each stack has its own `variables.tf`. Useful ones:

### `stacks/k8s`

| Variable | Default | Purpose |
|---|---|---|
| `cluster_name` | `agyn-local` | k3d cluster name. |
| `servers` | `1` | Server node count. |
| `agents` | `2` | Agent node count. |
| `k3s_version` | `v1.34.3-k3s1` | k3s image tag. |
| `api_port` | `6443` | Host port for Kubernetes API. |

### `stacks/platform`

Pinned chart versions for every platform service, plus override slots for the image tag if you want to test an unreleased build. Search `chart_version` and `image_tag` in `stacks/platform/variables.tf` for the full list.

### `stacks/apps`

| Variable | Default | Purpose |
|---|---|---|
| `admin_oidc_subject` | `admin@agyn.io` | Same value `ADMIN_OIDC_SUBJECT` controls — overridden by env var when bootstrap runs. |
| `reminders_*`, `telegram_connector_*`, `k8s_runner_*` | versioned | App chart versions and image tags. |

## Per-service Helm chart values

Every platform service has its own chart at `ghcr.io/agynio/charts/<service>`. Bootstrap renders the values inline in `stacks/platform/main.tf` (look for `<service>_values = yamlencode({ ... })`).

If you want to consume a chart directly without bootstrap, the chart's `values.yaml` is the canonical reference. Pull the chart and read it:

```sh
helm pull oci://ghcr.io/agynio/charts/<service> --version <version> --untar
cat <service>/values.yaml
cat <service>/README.md   # when present
```

Common per-service values include image repository/tag, replica count, resource limits, sidecar configuration, OpenZiti enrollment, and database / Redis URLs.

## Bootstrap-only secrets and identities

The `data` stack generates several passwords with `random_password` (Postgres, OpenFGA, MinIO). The `platform` stack mints additional credentials including the `cluster_admin_api_token`. These are stored in Terraform state.

For production, override the password variables and source them from your secret manager rather than letting Terraform generate them.

| Variable | Source |
|---|---|
| `platform_db_password` | `stacks/platform/variables.tf` — generate or supply. |
| `openfga_db_password` | `stacks/data/variables.tf`. |
| `minio_root_password` | `stacks/data/variables.tf`. |
| `argocd_admin_password` | `stacks/platform/variables.tf`. |

## Where to look in code

| Want to change… | Edit |
|---|---|
| The default domain or port | `apply.sh` (defaults), or set `DOMAIN` / `PORT` env vars. |
| Which stacks run | `apply.sh` — comment out the `run_stack` lines you don't need. |
| Image versions / chart versions | `stacks/<stack>/variables.tf`. |
| Values passed to a service chart | `stacks/platform/main.tf` (look for `<service>_values`). |
| OIDC defaults baked into `apply.sh` | `apply.sh` (`DEFAULT_OIDC_*`). |
| Bootstrap admin's user record | `stacks/apps/main.tf` (`agyn_user.admin`). |

## Related

- [Self-host install → Prerequisites](../self-host-install/prerequisites.md)
- [Self-host install → Quick bootstrap](../self-host-install/quick-bootstrap.md)
- [Self-host install → Production install](../self-host-install/production-install.md)
- [Operate → Architecture overview](../operate/architecture.md)
