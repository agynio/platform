---
title: Prerequisites
description: What you need before installing Agyn on your cluster.
order: 1
---

# Prerequisites

## Cluster

A Kubernetes cluster (1.27+) you can install into, with a storage class for the components that keep state, and capacity for the control plane plus the workloads your agents will run.

## Tools

| Tool | Used for |
|---|---|
| `helm` 3.14+ | Installing the charts. Must support OCI registries. |
| `kubectl` 1.27+ | The provisioning step, and inspecting the result. |

Driving the same charts from Argo CD or Terraform needs neither locally — the phases and their ordering are unchanged.

## Dependencies

The umbrella bundles some dependencies and defers to others. **Everything bundled is enabled by default**, so a cluster that already runs one must disable it explicitly — otherwise the chart deploys a second copy, and in the object-storage case rewrites the credentials secret.

| Dependency | Bundled | Notes |
|---|---|---|
| Postgres | yes | One database per service. Bring your own with `postgres.enabled=false` and publish DSNs in the database secret. |
| Object storage | yes (MinIO) | Disable with `minio.enabled=false`, and set `s3.createSecret=false` when you manage the credentials secret yourself. |
| OpenFGA + its database | yes | `openfga.enabled=false`, `openfga-db.enabled=false`. Connection details go under `platform.openfga`. |
| NATS | no | Enable it or point at your own. `networks` exits without it; `apps`, `users` and `agents-orchestrator` degrade quietly. |
| OpenZiti controller + router | **no** | Install from the OpenZiti charts. The platform assumes a working overlay. |
| cert-manager | **no** | Issues the ingress certificate. |
| Ingress (Istio) | **no** | Bring your own routing, or use `platform.ingress.enabled=true`. |

## DNS and TLS

A hostname per public entrypoint — Console, Gateway, and Chat — resolving to your ingress, with a certificate covering them.

> Give that certificate **only the hosts it serves**. A `*.example.com` wildcard is also valid for hosts served by other gateways, and browsers coalesce HTTP/2 connections when one certificate covers both names and they resolve to the same address. The reused connection keeps the route table chosen by the original SNI, so requests for a sibling host match nothing and return a bare 404 with no CORS headers — intermittently, once a connection has been idle and reused.

## OIDC

An OIDC provider with Authorization Code + PKCE. You need the issuer URL, a client ID for the SPAs, and the audience they request.

If your IdP implements [RFC 8707 resource indicators](https://datatracker.ietf.org/doc/html/rfc8707), the access token is audience-restricted and the OIDC UserInfo endpoint rejects it. The gateway then has to read profile claims from the token itself, and the IdP has to put them there — see [Troubleshooting → Auth & OIDC](../troubleshooting/auth-oidc.md).

For the first sign-in to claim cluster admin reliably, the IdP should also mark the address verified — see [First admin](./first-admin.md).

## Registry access

Charts and images come from `ghcr.io/agynio/*`. Most are public; configure a pull secret if your install mirrors them privately.

## Related

- [Install](./install.md)
- [First admin](./first-admin.md)
- [Operate → Security](../operate/security.md)
