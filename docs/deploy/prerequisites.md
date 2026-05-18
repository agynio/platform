---
title: Production Prerequisites
description: Prepare Kubernetes dependencies before installing Agyn with Helm.
order: 2
---

# Production Prerequisites

Production Helm installs assume you bring the shared infrastructure.

Agyn charts deploy workloads and wire configuration; they do not own every dependency lifecycle.

## Required platform prerequisites

1. **Kubernetes cluster** with namespaces planned for platform and apps.
2. **Istio ingress** for public and internal HTTP routes.
3. **OpenZiti controller and routers** for private agent, runner, app, Gateway, and LLM Proxy connectivity.
4. **OpenFGA** store and authorization model for relationship-based access checks.
5. **OIDC provider** for user authentication and Console login.
6. **PostgreSQL databases** for platform services such as agents, chat, files, identity, organizations, runners, secrets, threads, tracing, users, and ziti-management.
7. **S3-compatible object storage** for Files and media uploads.
8. **Kubernetes Secrets** for database URLs, S3 credentials, OpenFGA config, OIDC credentials, app tokens, runner tokens, and private chart/image credentials.

## OpenZiti expectations

OpenZiti provides network-level identity, mTLS transport, and service-level access control.

Ziti Management needs access to the OpenZiti Edge Management API and stores platform identity mappings in PostgreSQL.

Runners, apps, agents, Gateway, LLM Proxy, and tracing use Ziti identities for cross-boundary connectivity.

## Expected outcome

Before installing Agyn charts, you should be able to point Helm values at existing Istio, OpenZiti, OpenFGA, OIDC, database, S3, and Secret resources.

Next: [Production Helm](./production-helm.md).
