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

App configuration: LiteLLM service alias
- The platform-server provisions a LiteLLM virtual key on startup using the constant alias `agents-service`—LiteLLM is the only supported runtime path.
- Boot sequence:
  1. POST `/key/delete` with `key_aliases: ["agents-service"]` to clear any prior token for the alias. Errors are logged but do not block boot.
  2. POST `/key/generate` with `key_alias: "agents-service"` (and default LiteLLM duration) to mint a new key. The token is kept in memory only; no filesystem persistence is used.
  3. The generated key is returned to the runtime and used with the inference base `${LITELLM_BASE_URL}/v1`.
- Required admin credentials remain unchanged:
  - `LITELLM_BASE_URL=http://localhost:4000`
  - `LITELLM_MASTER_KEY=sk-<master-key>`
- These env vars are mandatory; the server exits at startup if either is missing.
- Optional: set `LITELLM_MODELS` (comma-separated) to restrict which LiteLLM models are granted to the generated key. When unset, the provisioner requests `all-team-models` to inherit your LiteLLM default access list.
- Alias deletion is attempted once per startup; failures are logged and startup continues.
- Key generation is attempted once per startup; failures surface immediately so operators can address configuration issues.
- Because keys are regenerated on every boot, you do not need to manage secrets files or clean up stale locks.

Model naming guidance
- Use the exact LiteLLM model name as configured in the LiteLLM UI. For OpenAI via LiteLLM, provider prefixes may be required (e.g., openai/gpt-4o-mini).
- Aliases are supported; enter the alias in the UI if you created one (e.g., gpt-5).
- The UI does not enforce a list of models; it accepts any non-empty string. Validation occurs at runtime when calling the provider.

Agent configuration behavior
- Agents respect the configured model end-to-end. If you set a model in the Agent configuration, the runtime binds that model to both the CallModel and Summarization nodes and will not silently fall back to the default (gpt-5).
- Ensure the chosen model or alias exists in LiteLLM; misconfigured names will surface as runtime errors from the provider.

Persistence verification
- The LiteLLM DB persists to the named volume litellm_pgdata.
- Stop and start services; provider keys, generated virtual key history, and aliases continue to reside in LiteLLM. The platform-server will create a fresh `agents-service` key at each boot.

Troubleshooting
- litellm-db healthcheck: ensure it is healthy before litellm starts.
- If UI is unreachable, verify port 4000 is exposed and service is running.
- Check logs: `docker compose logs -f litellm litellm-db`
- Verify DATABASE_URL points to litellm-db and credentials match.

Security notes (important for production)
- Change defaults: LITELLM_MASTER_KEY, LITELLM_SALT_KEY, UI_USERNAME, UI_PASSWORD, and Postgres password.
- Do not expose the database to the public internet; keep litellm-db without host ports (already configured).
- Consider placing LiteLLM behind a reverse proxy with TLS (e.g., Traefik, Nginx) and enabling authentication.
