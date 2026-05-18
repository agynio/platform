---
title: Production Helm
description: Install Agyn platform and apps with Helm using secret-first configuration.
order: 3
---

# Production Helm

Use Helm for production when prerequisites are already installed and operated by your platform team.

`agynio/platform-charts` provides two umbrella charts.

| Chart | Purpose |
| --- | --- |
| `agyn-platform` | Core platform services. |
| `agyn-apps` | Optional apps plus the default Kubernetes runner. |

## What Helm does not provision

The charts do not create your Kubernetes cluster, Istio installation, OpenZiti deployment, OpenFGA store, OIDC provider, PostgreSQL databases, Redis, S3 bucket, DNS records, TLS certificates, or production secret values.

Create those first, then pass references through values and Kubernetes Secrets.

## Steps

1. Authenticate to GHCR if charts are private:

   ```sh
   helm registry login ghcr.io
   ```

2. Create database URL, Redis, S3, OIDC, OpenFGA, app token, runner token, and Ziti credential Secrets before installing.

3. Install platform services:

   ```sh
   helm upgrade --install agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
     --version 0.1.0 \
     --namespace platform \
     --create-namespace \
     --values production-platform-values.yaml
   ```

4. Install apps and the default runner:

   ```sh
   helm upgrade --install agyn-apps oci://ghcr.io/agynio/charts/agyn-apps \
     --version 0.1.0 \
     --namespace apps \
     --create-namespace \
     --values production-apps-values.yaml
   ```

## Secret-first configuration

Database URLs come from `platform.database.existingSecret` and `platform.database.existingSecretKeyPattern`.

S3 values come from an existing Secret referenced by `s3.existingSecret`, `s3.accessKeyKey`, and `s3.secretKeyKey`.

OpenFGA, OIDC, Ziti, Redis, app registration, and runner registration values should be wired through non-secret IDs plus Kubernetes Secret references where values are sensitive.

`platform-charts` explicitly separates workload deployment from registration: app and runner registrations and service tokens must be supplied as pre-created Secrets or non-secret IDs.

## Expected outcome

Helm should render workloads without plaintext database URLs, OIDC secrets, app tokens, runner tokens, Ziti credentials, or S3 credentials in values files.

Set `validation.requireExistingSecrets=true` during live cluster installs when you want Helm to fail if referenced Secrets or keys are missing.
