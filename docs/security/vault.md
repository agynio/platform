HashiCorp Vault integration (dev)

Overview
- Dev-only Vault integration to source container env vars and GitHub Clone token via Vault KV v2.
- Secrets are resolved server-side only; values are never returned to the browser and are redacted in logs.

Dev setup
1) Start Vault and seed example secrets:
   - docker compose up -d vault vault-init
   - Vault UI/API available at http://localhost:8200 (token: dev-root)
   - KV v2 is enabled at mount `secret/` and an example token is seeded at `secret/github` with key `GH_TOKEN`.
2) Configure server env (apps/server/.env):
   - VAULT_ENABLED=true
   - VAULT_ADDR=http://localhost:8200
   - VAULT_TOKEN=dev-root

Workspace env vars
- In the Workspace node (containerProvider) static config, add plain env under `env`.
- For Vault-backed vars, add entries under `envRefs` with fields: mount (default secret), path, key, optional.
- On provision, the server resolves envRefs and injects values into the container environment.

GitHub Clone Repo auth
- The GitHub Clone tool static config accepts `authRef` to override the token source:
  - source=env -> read from a process env var name (default GH_TOKEN)
  - source=vault -> resolve from Vault using mount/path/key (defaults secret/github/GH_TOKEN)
- If not set or resolution fails, the server falls back to ConfigService.githubToken.

Autocomplete endpoints
- When VAULT_ENABLED=true, the server exposes:
  - GET /api/vault/mounts -> { items: string[] }
  - GET /api/vault/kv/:mount/paths?prefix=foo -> { items: string[] }
  - GET /api/vault/kv/:mount/keys?path=github -> { items: string[] }
- These return metadata only (no values) and are intended for UI autocompletion.

Security notes
- Logs never include secret values; only references (mount/path/key) and high-level errors are logged.
- This dev integration uses a root token and a dev server; do not use in production.
