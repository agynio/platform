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

App configuration: LiteLLM admin requirements
- Set `LLM_PROVIDER=litellm` on the platform server.
- LiteLLM administration env vars are required at boot:
  - `LITELLM_BASE_URL=http://localhost:4000`
  - `LITELLM_MASTER_KEY=sk-<master-key>`
- The server provisions virtual keys by calling LiteLLM's admin API. Missing either env produces a `503 litellm_missing_config` response for the LLM settings API and disables UI writes.
- Optional overrides for generated virtual keys:
  - `LITELLM_MODELS=gpt-5` (comma-separated list)
  - `LITELLM_KEY_DURATION=30d`
  - `LITELLM_KEY_ALIAS=agents-${process.pid}`
  - Limits: `LITELLM_MAX_BUDGET`, `LITELLM_RPM_LIMIT`, `LITELLM_TPM_LIMIT`, `LITELLM_TEAM_ID`
- Runtime requests use `${LITELLM_BASE_URL}/v1` with either the master key or the generated virtual key.

Model naming guidance
- Use the exact LiteLLM model name as configured in the LiteLLM UI. For OpenAI via LiteLLM, provider prefixes may be required (e.g., openai/gpt-4o-mini).
- Aliases are supported; enter the alias in the UI if you created one (e.g., gpt-5).
- Provider identifiers should match the canonical keys exposed by LiteLLM's `/public/providers` endpoint. The platform normalizes a few historical aliases (for example, `azure_openai` now maps to `azure`), but using the official key avoids sync errors.
- Provider names are handled case-insensitively and persisted as lowercase canonical keys.
- The UI does not enforce a list of models; it accepts any non-empty string. Validation occurs at runtime when calling the provider.

Agent configuration behavior
- Agents respect the configured model end-to-end. If you set a model in the Agent configuration, the runtime binds that model to both the CallModel and Summarization nodes and will not silently fall back to the default (gpt-5).
- Ensure the chosen model or alias exists in LiteLLM; misconfigured names will surface as runtime errors from the provider.

Direct OpenAI mode
- Set `LLM_PROVIDER=openai` and provide `OPENAI_API_KEY` (and optional `OPENAI_BASE_URL`). No LiteLLM envs are read in this mode.

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
