LiteLLM setup (OpenAI-compatible proxy)

- Start services: `docker compose up -d litellm_db litellm`
- Open the UI: http://localhost:4000/ui
  - Add providers/models and generate a virtual key
- Configure the server to use LiteLLM by setting:
  - `OPENAI_API_KEY=<your-litellm-virtual-key>`
  - `OPENAI_BASE_URL=http://litellm:4000`
- Run the app as before; all ChatOpenAI calls route through LiteLLM.

Note: No litellm_config.yaml is mounted; use the built-in UI for configuration.
