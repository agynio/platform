---
title: Helm install
description: Installing Agyn from the umbrella charts, including the provisioning step between them.
order: 4
---

# Helm install

Agyn ships as two umbrella charts, and installing it is **not** two `helm install` commands. Between them sits a provisioning step that cannot be expressed in a chart, because it needs a running control plane to talk to.

| Phase | What it does |
|---|---|
| 1. [Prerequisites](#1-prerequisites) | Cluster-level dependencies the charts expect to already exist |
| 2. [`agyn-platform`](#2-agyn-platform) | The control plane — the services behind the API |
| 3. [Provisioning](#3-provisioning) | Overlay authorization, cluster admin, runner registration |
| 4. [`agyn-apps`](#4-agyn-apps) | The workload layer — the runner that executes agents |

Order matters. The overlay must be authorized before the platform can use it, and the runner must be registered before `agyn-apps` starts, because the chart mounts a token that step produces.

Both charts live at `oci://ghcr.io/agynio/charts`.

## 1. Prerequisites

The umbrella can bundle some dependencies or defer to ones you already run. Anything bundled is enabled by default, so an install that already has these **must turn them off explicitly** — otherwise the chart deploys a second copy and, in the S3 case, overwrites the credentials secret.

| Dependency | Bundled | Disable with | Notes |
|---|---|---|---|
| Postgres | yes | `postgres.enabled=false` | One database per service. Externally: create them and publish DSNs in the database secret. |
| Object storage | yes (MinIO) | `minio.enabled=false` | Also set `s3.createSecret=false` when you manage the credentials secret yourself, or the chart replaces it with MinIO's root user. |
| OpenFGA + its database | yes | `openfga.enabled=false`, `openfga-db.enabled=false` | Connection details go under `platform.openfga`; the top-level key is the bundled subchart. |
| NATS | no (`nats.enabled=false`) | — | Enable it, or point at your own. Required: `networks` exits without it, and `apps`, `users` and `agents-orchestrator` degrade silently. |
| OpenZiti controller + router | **no** | — | Install separately from the OpenZiti charts. The platform assumes a working overlay. |
| cert-manager | **no** | — | Issues the ingress certificate. |
| Ingress (Istio) | **no** | — | Either bring your own routing or use `platform.ingress.enabled=true`. |

Also required:

- **An OIDC provider.** Set `platform.oidc.issuerUrl`, `clientId`, and `audience`. If your IdP implements [RFC 8707 resource indicators](https://datatracker.ietf.org/doc/html/rfc8707), the SPAs must request the audience and the gateway must read profile claims from the token rather than UserInfo — see [Troubleshooting → Auth & OIDC](../troubleshooting/auth-oidc.md).
- **A DNS name and TLS certificate** per public host.

> **Certificates and connection reuse.** Give the ingress certificate only the hosts it actually serves. A `*.example.com` wildcard is also valid for hosts served by *other* gateways, and browsers coalesce HTTP/2 connections when one certificate covers both names and they resolve to the same address. The reused connection keeps the route table chosen by the original SNI, so requests for the sibling host match nothing and get a bare 404 with no CORS headers — intermittently, once a connection has been idle and reused.

## 2. `agyn-platform`

```sh
helm upgrade --install agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --namespace platform --create-namespace \
  -f values-platform.yaml
```

This deploys the control plane: gateway, users, organizations, threads, agents, runners, and the rest, plus the namespace workloads will run in (`platform.workloads.namespace`, default `agyn-workloads`).

Two values deserve attention on an existing install:

- `platform.secretsEncryptionKey.create` — the chart reuses an existing key via `lookup`, but Argo CD renders manifests **without cluster access**, so `lookup` finds nothing and a fresh key is generated. That rotates the key out from under every secret already stored. Set it to `false` when the key is managed elsewhere.
- `platform.egressCa.create` — same reasoning if your egress CA is provisioned outside the chart.

> **`env` replaces, it does not merge.** Every subchart's `env` list is overridden wholesale. If you set `env` on a service, re-declare **all** of its entries — anything you omit is dropped, including values the chart supplied.

Wait for the control plane to be ready before continuing.

## 3. Provisioning

Nothing here fits in a chart: it needs the API that phase 2 just started. The reference implementation is the two Jobs in [`agynio/bundle-vm`](https://github.com/agynio/bundle-vm) (`deploy/manifests/48-ziti-provision.yaml` and `50-apps-provision.yaml`); a Terraform install does the same with the OpenZiti and Kubernetes providers.

### 3a. Authorize the overlay

OpenZiti denies by default, and an unauthorized service is **invisible rather than refused** — the symptom is `service not found in ziti network`, which reads like a missing object.

Access is granted in two halves and both are required:

| Policy | Grants |
|---|---|
| `edge-router-policy` | identities → edge routers |
| `service-edge-router-policy` | services → edge routers |

With only the service half, a service is authorized but has no router to traverse, reported as `NO_EDGE_ROUTERS_AVAILABLE`. The simplest form is one of each over `#all`.

Then the service policies. Each runner gets its own service at registration, so these are written against **role attributes** rather than names — one rule covers every runner registered in future:

| Policy | Type | Identity roles | Service roles |
|---|---|---|---|
| `runners-bind` | Bind | `#runners` | `#runner-services` |
| `runners-service-dial-runners` | Dial | `#runners-service-hosts` | `#runner-services` |
| `orchestrators-dial-runners` | Dial | `#orchestrators` | `#runner-services` |
| `terminal-proxy-dial-runners` | Dial | `#terminal-proxy-hosts` | `#runner-services` |

Add the equivalent Bind/Dial pairs for the platform's own overlay services (`gateway`, `llm-proxy`, `tracing`, app and egress services) as you deploy them. A policy that names a service with `@` fails to apply until that service exists; role-attribute policies are inert until something matches.

### 3b. Bootstrap the cluster admin

Registering the first runner requires an authenticated caller, and at this point no human admin exists. The gateway accepts a bootstrap token for exactly this:

1. Generate a token and give the gateway `CLUSTER_ADMIN_TOKEN` and `CLUSTER_ADMIN_IDENTITY_ID`.
2. Write the OpenFGA tuple granting it cluster admin:

   ```
   user=identity:<CLUSTER_ADMIN_IDENTITY_ID>  relation=admin  object=cluster:global
   ```

Prefer the chart's secret-reference form over passing the token by value, so it is not readable by anyone who can read the Deployment.

### 3c. Register the runner

Call the gateway as that admin:

```sh
curl -sS "$GATEWAY/agynio.api.gateway.v1.RunnersGateway/RegisterRunner" \
  -H "Authorization: Bearer $CLUSTER_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"k8s-runner","labels":{"type":"kubernetes"},"capabilities":["docker"]}'
```

Store the returned `serviceToken` as the secret `agyn-apps` mounts:

```sh
kubectl -n platform create secret generic k8s-runner-service-token \
  --from-literal=token="$SERVICE_TOKEN"
```

The token is minted by the Runners service and is the only credential the runner can present — it cannot be generated ahead of time. Make this step idempotent by exiting early when the secret already exists.

Optionally also create an organization, and an LLM provider and model, if you want the install usable immediately.

## 4. `agyn-apps`

```sh
helm upgrade --install agyn-apps oci://ghcr.io/agynio/charts/agyn-apps \
  --namespace platform \
  -f values-apps.yaml
```

The runner needs, at minimum:

| Setting | Value |
|---|---|
| `runners.k8s.enabled` | `true` |
| `KUBE_NAMESPACE` | the namespace from phase 2 (`agyn-workloads`) |
| `GATEWAY_ADDRESS` | the gateway service — the platform umbrella overrides its fullname, so the chart default does not resolve |
| `SERVICE_TOKEN` | from the `k8s-runner-service-token` secret; the runner exits without it once Ziti is enabled |
| `ZITI_ENABLED` | `true` |

The bundled apps (`reminders`, `telegram-connector`) stay disabled until their databases and app registration are provisioned.

## Verify

```sh
# the runner reached the platform
curl -sS "$GATEWAY/agynio.api.gateway.v1.RunnersGateway/ListRunners" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
```

A healthy runner reports `RUNNER_STATUS_ENROLLED`, and its log shows the gRPC server listening on a `ziti` listener rather than only `tcp`.

## Failure modes

| Symptom | Cause |
|---|---|
| `service not found in ziti network` | No Bind policy — the service exists but is invisible (3a) |
| `NO_EDGE_ROUTERS_AVAILABLE` | Only one half of the router grant was created (3a) |
| `SERVICE_TOKEN is required when ZITI_ENABLED is true` | Runner not registered, or `env` overridden without re-declaring it (3c, phase 2 note) |
| `produced zero addresses` | The named service has no endpoints — usually a component that was never enabled |
| Empty `OPENFGA_API_URL` | Connection details set on the top-level `openfga` key instead of `platform.openfga` |
| Files stop authenticating after an upgrade | Bundled MinIO re-created the S3 credentials secret — see `s3.createSecret` |

## Related

- [Prerequisites](./prerequisites.md)
- [Quick bootstrap](./quick-bootstrap.md)
- [Production install](./production-install.md)
- [First admin](./first-admin.md)
- [Troubleshooting → Networking & Ziti](../troubleshooting/networking-ziti.md)
- [Troubleshooting → Auth & OIDC](../troubleshooting/auth-oidc.md)
