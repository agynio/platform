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

Some components ship inside the umbrella as subcharts; others you must install yourself. Of the ones that ship with it, only some are switched on out of the box — so read both columns.

| Component | Ships in the chart | On by default | Key |
|---|---|---|---|
| Postgres | yes | **no** | `postgres.enabled` |
| Object storage (MinIO) | yes | **yes** | `minio.enabled` |
| OpenFGA | yes | **yes** | `openfga.enabled` |
| NATS | yes | **yes** | `nats.enabled` |
| OpenZiti controller + router | **no** | — | install from the OpenZiti charts |
| cert-manager | **no** | — | install separately |
| Ingress (Istio) | **no** | — | or use `platform.ingress.enabled` |

What that means in practice:

- **Already running Postgres, object storage or OpenFGA?** Turn off the ones that are on — `minio.enabled=false`, `openfga.enabled=false` — or the chart deploys a second copy alongside yours. With MinIO also set `s3.createSecret=false`, otherwise the chart rewrites the object-storage credentials secret with MinIO's root user and the files service starts authenticating as the wrong identity.
- **NATS is on because the platform requires it.** `networks` exits without an event bus, and `apps`, `users` and `agents-orchestrator` lose group sync quietly rather than failing. Running your own means disabling this one and overriding the endpoint.
- **Postgres is off by default**, so an install that wants the bundled one has to ask for it. External databases are configured by publishing DSNs in the database secret.
- **OpenFGA's own database** is a matter for whichever OpenFGA you run — the umbrella does not ship one.

## DNS and TLS

A hostname per public entrypoint — Console, Gateway, and Chat — resolving to your ingress, with a certificate covering them.

> Give that certificate **only the hosts it serves**. A `*.example.com` wildcard is also valid for hosts served by other gateways, and browsers coalesce HTTP/2 connections when one certificate covers both names and they resolve to the same address. The reused connection keeps the route table chosen by the original SNI, so requests for a sibling host match nothing and return a bare 404 with no CORS headers — intermittently, once a connection has been idle and reused.

## OIDC

An OIDC provider with Authorization Code + PKCE. You need the issuer URL, a client ID for the SPAs, and the audience they request.

If your IdP implements [RFC 8707 resource indicators](https://datatracker.ietf.org/doc/html/rfc8707), the access token is audience-restricted and the OIDC UserInfo endpoint rejects it. The gateway then has to read profile claims from the token itself, and the IdP has to put them there — see [Troubleshooting → Auth & OIDC](../troubleshooting/auth-oidc.md).

The address the IdP asserts is what a cluster admin declaration is matched against, so it has to be the address you declare — see [Cluster administrators](./first-admin.md).

## Registry access

None. Charts and images are published publicly at `ghcr.io/agynio/*` and pull anonymously — no credentials, no pull secret.

## Related

- [Install](./install.md)
- [Cluster administrators](./first-admin.md)
- [Operate → Security](../operate/security.md)
