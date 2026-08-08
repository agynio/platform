---
title: Helm install
description: Installing Agyn from one umbrella chart.
order: 4
---

# Helm install

Agyn installs as **one Helm chart**: one release, one version, one set of values,
and no operator step in the middle.

It used to be two charts with a person between them. The runner and the bundled
apps mount a service token only the running platform can mint, so installing
them meant signing in, registering each component through the Console, and
copying credentials shown once into Secrets. The release provisions its own
resources now, so that step is gone.

| Phase | What it does |
|---|---|
| 1. [Prerequisites](#1-prerequisites) | Cluster-level dependencies the chart expects to already exist, plus optional [workload isolation](#workload-isolation-optional-recommended) |
| 2. [`agyn-platform`](#2-agyn-platform) | The platform: control plane, workload layer, and the resources the release declares |
| 3. [Verify](#3-verify) | What converged, and what to look at when something did not |

There is no ordering to observe. Every precondition provisioning has becomes
true at a moment the chart cannot predict — a schema migrating inside a
service's startup, a service self-enrolling onto the overlay, an external
controller appearing — so nothing is sequenced and anything not yet possible is
retried. Installing returns once the objects are applied; whether the platform
is provisioned is a question its objects answer, continuously.

The chart lives at `oci://ghcr.io/agynio/charts`.

## 1. Prerequisites

The cluster, DNS, TLS, OIDC, and the dependencies the charts expect to find — including which of them ship inside the umbrella and which are already switched on. See [Prerequisites](./prerequisites.md).

The one that most often bites: a component that ships in the chart **and** defaults to on will be deployed a second time on a cluster that already runs it.

### Workload isolation *(optional, recommended)*

By default the runner executes agent workloads with `docker = rootless`: the workload shares the node's kernel, and its isolation is the container boundary. Kata Containers with Firecracker gives each workload its own kernel in a microVM instead, so a kernel escape reaches the microVM rather than the node. Skip this and everything still works — only the isolation is weaker.

Do it here, before the platform is running. Installing Kata restarts containerd on each node, so on an empty cluster it costs nothing — on a live one it evicts whatever is already scheduled there.

The runner side is a single value, set in [phase 2](#2-agyn-platform):

| Setting | Value |
|---|---|
| `k8s-runner.env` → `CAPABILITY_IMPLEMENTATIONS` | `{"docker":"kata-fc"}` |

The runner stamps `runtimeClassName: kata-fc` on each workload pod, and its RuntimeClass pins those pods to nodes that actually have Kata. Nodes without it simply keep running `rootless` workloads, so a partial rollout is safe.

Node requirements:

| | |
|---|---|
| **Virtualization** | `/dev/kvm` on the node. On a cloud VM that means nested virtualization is enabled |
| **Snapshotter** | containerd's `devmapper`, backed by a thin pool you create. Firecracker hot-plugs the rootfs as a block device and cannot use overlayfs |
| **Disk** | Kata's artifacts are ~1 GB and its installer image ~1.6 GB. Point `installationPrefix` at a disk with room; the default `/opt/kata` is the root filesystem |
| **inotify** | Raise `fs.inotify.max_user_instances`; each microVM shim consumes instances and the stock 128 runs out quickly |

Two things bite on a stock node:

- If containerd's `config.toml` declares no runtimes, it is running on built-in defaults. Installing Kata makes that map explicit and **drops `runc` from it**, so the CRI plugin fails to load and the node goes `NotReady`. Declare `runc` explicitly alongside the Kata runtime.
- Runtimes must all live in one file. containerd merges an imported drop-in by replacing whole maps, so a `runtimes` table in a drop-in silently discards the ones in `config.toml`.

Installing Kata restarts containerd on the node, so roll it out one node at a time.

Verify with a pod that reports a guest kernel different from the node's:

```sh
kubectl run kata-check --image=alpine:3.20 --restart=Never \
  --overrides='{"spec":{"runtimeClassName":"kata-fc"}}' -- uname -r
```

`/dev/kvm` is **not** available inside these microVMs — Firecracker does not expose nested virtualization. Workloads that need it must stay on `rootless`.

## 2. `agyn-platform`

```sh
helm upgrade --install agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --namespace platform --create-namespace \
  -f values-platform.yaml
```

This deploys everything: the control plane, the workload layer (the runner and
the bundled apps), the provisioning controller and the declarations it
reconciles, plus the namespace workloads run in
(`platform.workloads.namespace`, default `agyn-workloads`).

**Name your cluster administrators.** This is the one part of the values an
operator must fill in — a release that declares none installs a platform nobody
can administer:

```yaml
provisioning:
  declarations:
    clusterAdmins:
      - address: operator@example.com
```

Two values deserve attention on an existing install:

- `platform.secretsEncryptionKey.create` — the chart reuses an existing key via `lookup`, but Argo CD renders manifests **without cluster access**, so `lookup` finds nothing and a fresh key is generated. That rotates the key out from under every secret already stored. Set it to `false` when the key is managed elsewhere.
- `platform.egressCa.create` — same reasoning if your egress CA is provisioned outside the chart.

> **`env` replaces, it does not merge.** Every subchart's `env` list is overridden wholesale. If you set `env` on a service, re-declare **all** of its entries — anything you omit is dropped, including values the chart supplied. `extraEnvVars` is appended rather than replacing, but it cannot override an entry the chart already sets: Helm patches `env` by name and reorders the pair on upgrade, so the chart's value silently wins from then on.

Installing returns once the objects are applied. Nothing waits, and there is
nothing to do between this and the next section.

## 3. Verify

The release declares what the platform should contain, and the provisioning
controller reconciles it. Progress is per object, so a platform that installed
without provisioning is visible as objects that are not ready rather than as a
job whose logs have to be read.

```sh
kubectl get -n platform organizations,clusteradmins,images,runners,apps,overlaypolicies
```

Each carries conditions saying whether it is reconciled, pending, or failing and
why. `Pending` on a fresh install is ordinary — a service still starting, an
identity not yet enrolled — and clears on its own.

**A declared cluster administrator stays pending until that person first signs
in.** There is no account to grant against before then; signing in completes the
declaration rather than triggering it. An install that names none has none —
nobody is granted the role for arriving first.

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
| Node `NotReady`, `container runtime is down` after installing Kata | `runc` dropped from containerd's runtime map; CRI will not load (1) |
| `no runtime for "kata-fc" is configured` | Runtimes split across `config.toml` and a drop-in — the import replaced the map (1) |
| `Image and initrd path cannot be both set` | Kata's generated path config sets both; drop one (1) |
| `Creating watcher returned error too many open files` | `fs.inotify.max_user_instances` too low for the number of microVMs (1) |
| `snapshotter devmapper was not found` | Thin pool absent when containerd started; create it first, then restart containerd (1) |
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
