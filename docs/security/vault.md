HashiCorp Vault integration (dev)

Overview
- Dev-only Vault integration to source container env vars and GitHub Clone token via Vault KV v2.
- Secrets are resolved server-side only; values are never returned to the browser and are redacted in logs.
- Configuration now uses structured reference objects shared across server/runtime (`{ kind: 'vault' | 'var', ... }`).

Dev setup
1) Start Vault and seed example secrets:
   - docker compose up -d vault vault-init
   - Vault UI/API available at http://localhost:8200 (token: dev-root)
   - KV v2 is enabled at mount `secret/` and an example token is seeded at `secret/github` with key `GH_TOKEN`.
2) Configure server env (packages/platform-server/.env):
   - VAULT_ENABLED=true
   - VAULT_ADDR=http://localhost:8200
   - VAULT_TOKEN=dev-root

Workspace env vars
- In the Workspace node (containerProvider) static config, use the unified env array:
  - `env: Array<{ key: string; value: string | SecretRef | VariableRef }>`
  - Plain strings are injected verbatim.
  - Vault references use `{ kind: 'vault', path: 'services/slack', key: 'BOT_TOKEN', mount?: 'secret' }`.
  - Graph variable references use `{ kind: 'var', name: 'SLACK_BOT_TOKEN', default?: 'fallback' }`.
- On provision, the server resolves vault-backed entries and injects values into the container environment.
- Legacy compatibility removed: envRefs is no longer supported. Providing envRefs will fail validation. A legacy plain env map may still be accepted by the server for convenience, but new configurations should use the array form.

GitHub Clone Repo auth
- New: `token?: string | SecretRef | VariableRef`
  - Plain strings are used directly.
  - Vault references are resolved server-side before cloning.
  - Variable references allow graph variables to supply tokens.
- Fallbacks: if not provided or resolution fails, server falls back to `ConfigService.githubToken`.
- Backward compatibility: legacy `authRef` remains supported at runtime but is not shown in templates.

Autocomplete endpoints
- When VAULT_ENABLED=true, the server exposes:
  - GET /api/vault/mounts -> { items: string[] }
  - GET /api/vault/kv/:mount/paths?prefix=foo -> { items: string[] }
  - GET /api/vault/kv/:mount/keys?path=github -> { items: string[] }
- These return metadata only (no values) and are intended for UI autocompletion.

Security notes
- Logs never include secret values; only references (mount/path/key) and high-level errors are logged.
- This dev integration uses a root token and a dev server; do not use in production.
