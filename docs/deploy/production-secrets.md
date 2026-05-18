---
title: Production Secrets
description: Configure database, S3, and service tokens without plaintext values files.
order: 4
---

# Production Secrets

`platform-charts` is designed for secret-first production configuration.

Provide database URLs, S3 credentials, app service tokens, and runner service tokens through pre-created Kubernetes Secrets.

Example database URL secret:

```sh
kubectl create secret generic agyn-platform-database-urls \
  --from-literal=agents=postgresql://agents:REDACTED@postgres.example.com:5432/agents \
  --from-literal=threads=postgresql://threads:REDACTED@postgres.example.com:5432/threads
```

Example files S3 secret:

```sh
kubectl create secret generic agyn-files-s3 \
  --from-literal=access-key=REDACTED \
  --from-literal=secret-key=REDACTED
```

Set `platform.database.existingSecret` and `platform.database.existingSecretKeyPattern` in chart values.

For files storage, align `s3.existingSecret`, `s3.accessKeyKey`, and `s3.secretKeyKey` with `files.files.s3.*` values.
