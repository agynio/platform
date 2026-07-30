---
title: Helm install
description: Installing Agyn from the umbrella charts, including the provisioning step between them.
order: 4
---

# Helm install

Agyn ships as two umbrella charts, and installing it is **not** two `helm install` commands. Between them sits a provisioning step that acts on things the charts do not own — the OpenZiti controller, and the platform API the first chart has just started.

| Phase | What it does |
|---|---|
| 1. [Prerequisites](#1-prerequisites) | Cluster-level dependencies the charts expect to already exist |
| 2. [`agyn-platform`](#2-agyn-platform) | The control plane — the services behind the API |
| 3. [Provisioning](#3-provisioning) | Overlay authorization, then sign in and enroll the runner |
| 4. [`agyn-apps`](#4-agyn-apps) | The workload layer — the runner that executes agents |

Order matters. The overlay must be authorized before the platform can use it, and the runner must be enrolled before `agyn-apps` starts, because the chart mounts a token that step produces.

Both charts live at `oci://ghcr.io/agynio/charts`.

## 1. Prerequisites

The cluster, DNS, TLS, OIDC, and the dependencies the charts expect to find — including which of them ship inside the umbrella and which are already switched on. See [Prerequisites](./prerequisites.md).

The one that most often bites: a component that ships in the chart **and** defaults to on will be deployed a second time on a cluster that already runs it.

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

Only the first step here is unattended. The rest is done from the Console, because enrolling a runner needs a signed-in admin and produces a token shown only once. Nothing here fits in a chart: it acts on the API that phase 2 just started, and on the OpenZiti controller, which the chart does not own. The reference implementation is the two Jobs in [`agynio/bundle-vm`](https://github.com/agynio/bundle-vm) (`deploy/manifests/48-ziti-provision.yaml` and `50-apps-provision.yaml`); a Terraform install does the same with the OpenZiti and Kubernetes providers.

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

### 3b. Become cluster admin

Sign in to the Console. The first account to sign in claims cluster admin — see [First admin](./first-admin.md) — so no credential has to be created by hand.

Set `FIRST_ADMIN_EMAIL` on the Users service before anyone signs in, so the claim is bound to a known address rather than to whoever arrives first. It is honoured only when the IdP marks the address verified; without that, anyone able to register under the operator's address would take the cluster.

The claim is one-shot. It is a single record, so it is not reopened by deleting the admin, or by deleting every admin. If you lose the account, recover through [First admin → Recovery](./first-admin.md#recovery) rather than expecting a second sign-in to grant the role.

### 3c. Enroll the runner

In the Console, with the Cluster Administration context selected: **Runners → Enroll runner**. Give it a name (`k8s-runner`) and optionally labels such as `type=kubernetes`.

The service token is **shown once**, at creation. Copy it before leaving the dialog — it is minted by the Runners service, is the only credential the runner can present, and cannot be regenerated or read back later.

Store it as the secret `agyn-apps` mounts:

```sh
kubectl -n platform create secret generic k8s-runner-service-token \
  --from-literal=token="$SERVICE_TOKEN"
```

Optionally also create an organization, and an LLM provider and model, if you want the install usable immediately.

#### Automating this instead

An install that must complete before any human signs in cannot use the Console, and cannot use the first-admin claim either — spending it on an automation identity leaves no claim for the operator. For that case the gateway accepts a bootstrap credential: set `CLUSTER_ADMIN_TOKEN` and `CLUSTER_ADMIN_IDENTITY_ID`, and write the matching tuple:

```
user=identity:<CLUSTER_ADMIN_IDENTITY_ID>  relation=admin  object=cluster:global
```

Then call `RunnersGateway/RegisterRunner` with that token and store the `serviceToken` as above. Point the chart at an existing Secret rather than passing the token by value, so it is not readable by anyone who can read the Deployment. Make the step idempotent by exiting early when the secret already exists.

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
| `SERVICE_TOKEN is required when ZITI_ENABLED is true` | Runner not enrolled, or `env` overridden without re-declaring it (3c, phase 2 note) |
| `produced zero addresses` | The named service has no endpoints — usually a component that was never enabled |
| Empty `OPENFGA_API_URL` | Connection details set on the top-level `openfga` key instead of `platform.openfga` |
| Files stop authenticating after an upgrade | Bundled MinIO re-created the S3 credentials secret — see `s3.createSecret` |
| Console shows no Cluster Administration | The first-admin claim went to another account, or `FIRST_ADMIN_EMAIL` is set and the IdP did not mark the address verified (3b) |

## Related

- [Prerequisites](./prerequisites.md)
- [Local installation](../local-install/README.md)
- [First admin](./first-admin.md)
- [Troubleshooting → Networking & Ziti](../troubleshooting/networking-ziti.md)
- [Troubleshooting → Auth & OIDC](../troubleshooting/auth-oidc.md)
