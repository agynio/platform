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
- Create a model alias:
  - Name: gpt-5
  - Target: any real backend model you want the app to call (e.g., gpt-4o, gpt-4o-mini, or openai/gpt-4o)
  - Save. The app defaults to model "gpt-5" and will resolve to this alias.

App configuration: auto-provision virtual key
- The server can auto-provision a LiteLLM virtual key at startup when OPENAI_API_KEY is not set.
- Provide env vars to enable auto-provisioning:
  - LITELLM_BASE_URL=http://localhost:4000
  - LITELLM_MASTER_KEY=sk-<master-key>
  - Optional overrides:
    - LITELLM_MODELS=gpt-5 (comma-separated list)
    - LITELLM_KEY_DURATION=30d
    - LITELLM_KEY_ALIAS=agents-${process.pid}
    - Limits: LITELLM_MAX_BUDGET, LITELLM_RPM_LIMIT, LITELLM_TPM_LIMIT, LITELLM_TEAM_ID
- On success, the server sets OPENAI_API_KEY and OPENAI_BASE_URL automatically (defaults to `${LITELLM_BASE_URL}/v1` if not provided).

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
