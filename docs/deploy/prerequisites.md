---
title: Production Prerequisites
description: Prepare Kubernetes dependencies before installing Agyn with Helm.
order: 2
---

# Production Prerequisites

Production Helm installs assume you bring the shared infrastructure.

Agyn Helm charts deploy Agyn workloads and wire configuration. They do **not** provision your cluster, ingress, identity provider, OpenFGA store, OpenZiti network, databases, Redis, object storage, DNS, TLS certificates, or secret material.

## Required production dependencies

1. **Kubernetes cluster** with namespaces planned for platform and apps.
2. **Istio ingress** for public HTTPS routes and internal traffic routing.
3. **TLS and DNS** for the public platform hosts, including Console, Gateway, Chat, media, tracing, and any Ziti controller or router endpoints.
4. **OpenZiti controller and routers** for private connectivity between agents, runners, apps, Gateway, LLM Proxy, tracing, and user devices.
5. **OpenFGA** with a store and authorization model for relationship-based access control.
6. **OIDC identity provider** for user login and Console authentication. Production should use your IdP, not the MockAuth defaults from bootstrap.
7. **PostgreSQL databases** for platform services such as agents, apps, chat, expose, files, identity, llm, organizations, runners, secrets, threads, tracing, users, and ziti-management.
8. **Redis** for services that need pub/sub or cache behavior, including notifications.
9. **S3-compatible object storage** for Files and media uploads.
10. **Kubernetes Secrets** for database URLs, S3 credentials, OIDC client credentials, OpenFGA config, app service tokens, runner service tokens, Ziti credentials, and private chart or image credentials.

## Bootstrap-only components

The quick bootstrap path provisions local/demo dependencies that production Helm installs normally do not own:

| Component | Bootstrap role | Production expectation |
| --- | --- | --- |
| `k3d` | Creates the local Kubernetes cluster. | Bring your own Kubernetes cluster. |
| Argo CD | Applies bootstrap-managed workloads and stack ordering. | Use your own GitOps or Helm release process. |
| MockAuth defaults | Provides default OIDC issuer, client ID, and client secret for local sign-in. | Use your production OIDC IdP and client credentials. |
| MinIO | Provides local S3-compatible object storage. | Use production S3-compatible storage and Secrets. |
| cert-manager and trust-manager | Issue and distribute local certificates. | Use your production TLS and trust management process. |
| Registry mirror | Speeds and stabilizes local image pulls. | Use your registry, pull-through cache, or image policy. |
| NCPS | Provides local network/certificate support used by bootstrap. | Replace with your production networking and certificate controls. |

## OpenZiti expectations

OpenZiti provides network-level identity, mTLS transport, and service-level access control.

Ziti Management needs access to the OpenZiti Edge Management API and stores platform identity mappings in PostgreSQL.

Runners, apps, agents, Gateway, LLM Proxy, tracing, and exposed services rely on Ziti identities and policies.

## Expected outcome

Before installing Agyn charts, you should be able to point Helm values at existing Istio, OpenZiti, OpenFGA, OIDC, PostgreSQL, Redis, S3, DNS, TLS, and Kubernetes Secret resources.

Next: [Production Helm](./production-helm.md).
