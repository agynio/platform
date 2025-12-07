LiteLLM setup (local)

Tip
- Run `docker compose pull` before the first start to ensure you have the latest images.

Prerequisites
- Docker and Docker Compose
- agents repo checked out locally

Start services
- docker compose up -d litellm-db litellm

UI access
- URL: http://localhost:4000/ui
- Credentials: from env (defaults)
  - UI_USERNAME: admin
  - UI_PASSWORD: admin

Networking and ports
- By default in development, LiteLLM binds to 127.0.0.1:4000 on the host to avoid exposing externally.
- To expose on your LAN (not recommended without auth/TLS), edit docker-compose.yml and change the litellm ports mapping to either `0.0.0.0:4000:4000` or just `4000:4000`.

Initial configuration (via UI)
- Create a provider key: add your real OpenAI (or other) API key under Providers.
- Create a model alias if desired:
  - Choose any name you prefer (e.g., gpt-5) and point it to a real backend model target (e.g., gpt-4o, gpt-4o-mini, or openai/gpt-4o).
  - In the Agents UI, the Model field now accepts free-text. Enter either your alias name (e.g., gpt-5) or a provider-prefixed identifier (e.g., openai/gpt-4o-mini). The UI does not validate availability; runtime will surface errors if misconfigured.

App configuration: long-lived service token
- When `OPENAI_API_KEY` is unset, the platform-server provisions **one** LiteLLM virtual key using a constant alias (`agents-service`).
- The active token is persisted to `packages/platform-server/config/secrets/litellm/service_token.json` (mode `600`). Multiple instances coordinate with an advisory lock (`service_token.lock`) so only one token is created.
- On restart the server validates the stored token (via `GET /key/info`) and reuses it. If the token is invalid or missing, the server deletes stale aliases, ensures the service team exists, and generates a replacement before updating the secrets file.
- LiteLLM admin access still requires the base URL and master key:
  - `LITELLM_BASE_URL=http://localhost:4000`
  - `LITELLM_MASTER_KEY=sk-<master-key>`
- Optional environment controls (defaults in parentheses):
  - `LITELLM_SERVICE_TEAM_ALIAS` (`agents-service`)
  - `LITELLM_SERVICE_KEY_ALIAS` (`agents-service`)
  - `LITELLM_SERVICE_MODELS` (`all-team-models`, comma-separated list)
  - `LITELLM_SERVICE_KEY_DURATION` (unset for non-expiring; supports `30m`, `30h`, `30d`, `90d`)
  - `LITELLM_CLEANUP_OLD_KEYS` (`true`)
  - `LITELLM_KEY_VALIDATION_TIMEOUT_MS` (`2000`)
  - `LITELLM_KEY_API_RETRY_MAX` (`3`)
  - `LITELLM_KEY_API_RETRY_BASE_MS` (`300`)
  - `LITELLM_TOKEN_LOCK_STALE_MS` (`60000`, max age before recovering a stale `service_token.lock`)
- To force rotation, delete `service_token.json` (and optionally clean up the alias in LiteLLM); the next startup will provision a fresh token.
- Successful provisioning still exports `OPENAI_API_KEY` and `OPENAI_BASE_URL` to the runtime (`${LITELLM_BASE_URL}/v1` if not explicitly provided).

Model naming guidance
- Use the exact LiteLLM model name as configured in the LiteLLM UI. For OpenAI via LiteLLM, provider prefixes may be required (e.g., openai/gpt-4o-mini).
- Aliases are supported; enter the alias in the UI if you created one (e.g., gpt-5).
- The UI does not enforce a list of models; it accepts any non-empty string. Validation occurs at runtime when calling the provider.

Agent configuration behavior
- Agents respect the configured model end-to-end. If you set a model in the Agent configuration, the runtime binds that model to both the CallModel and Summarization nodes and will not silently fall back to the default (gpt-5).
- Ensure the chosen model or alias exists in LiteLLM; misconfigured names will surface as runtime errors from the provider.

Fallback to direct OpenAI
- Unset LITELLM_* envs and set OPENAI_API_KEY to your real OpenAI key.

Persistence verification
- The LiteLLM DB persists to the named volume litellm_pgdata.
- Stop and start services; your providers, virtual keys, and aliases should remain.

Troubleshooting
- litellm-db healthcheck: ensure it is healthy before litellm starts.
- If UI is unreachable, verify port 4000 is exposed and service is running.
- Check logs: `docker compose logs -f litellm litellm-db`
- Verify DATABASE_URL points to litellm-db and credentials match.

Security notes (important for production)
- Change defaults: LITELLM_MASTER_KEY, LITELLM_SALT_KEY, UI_USERNAME, UI_PASSWORD, and Postgres password.
- Do not expose the database to the public internet; keep litellm-db without host ports (already configured).
- Consider placing LiteLLM behind a reverse proxy with TLS (e.g., Traefik, Nginx) and enabling authentication.
