---
title: LLM providers
description: Connect Agyn to OpenAI, Anthropic, or a self-hosted endpoint.
order: 13
---

# LLM providers

An LLM provider is a configured upstream model provider — OpenAI, Anthropic, or any service that speaks one of the protocols the platform supports. Each provider has an endpoint, an auth method, and the credentials needed to call it. You register a provider once per organization; then you register one or more [models](./models.md) that point to it.

## Supported protocols

| Protocol | Common providers |
|---|---|
| `responses` (OpenAI Responses API) | OpenAI, Azure OpenAI, OpenAI-compatible gateways. |
| `anthropic_messages` (Anthropic Messages API) | Anthropic, Anthropic-compatible gateways. |

The LLM Proxy speaks both protocols natively. Agents use whichever protocol corresponds to the model they call — no per-agent configuration is required.

## Auth methods

| Method | When to use |
|---|---|
| `bearer` | Most OpenAI-compatible endpoints (header: `Authorization: Bearer <key>`). |
| `x_api_key` | Anthropic and a few OpenAI-compatible gateways (header: `x-api-key: <key>`). |
| `custom_headers` | Anything else — for example, gateways that require a custom header name. You provide the full header map. |

For `custom_headers`, you cannot set `Host`, `Content-Length`, `Connection`, or `Transfer-Encoding` — these are managed by the proxy.

## Register a provider

### In the Console

1. Console → **LLM Providers** (`/organizations/<org>/llm-providers`).
2. Click **New provider**.
3. Fill in:
   - **Name** — display name (e.g. `openai-prod`).
   - **Endpoint** — base URL of the upstream API (e.g. `https://api.openai.com/v1`).
   - **Protocol** — `responses` or `anthropic_messages`.
   - **Auth method** — `bearer`, `x_api_key`, or `custom_headers`.
   - **Credentials** — the API key (for `bearer` / `x_api_key`) or a header map (for `custom_headers`). Credentials are masked after save; click the eye icon to reveal.
4. Save.


The Console hides the credential value after the first save. To rotate it, click **Edit**, paste the new key, and save again.

### With Terraform

```hcl
resource "agyn_secret" "openai_key" {
  organization_id = agyn_organization.acme.id
  name            = "openai-api-key"
  value           = var.openai_api_key
}

resource "agyn_llm_provider" "openai" {
  organization_id = agyn_organization.acme.id

  name        = "openai-prod"
  endpoint    = "https://api.openai.com/v1"
  protocol    = "responses"
  auth_method = "bearer"

  token_secret_id = agyn_secret.openai_key.id
}
```

For an Anthropic provider with the same model:

```hcl
resource "agyn_llm_provider" "anthropic" {
  organization_id = agyn_organization.acme.id

  name        = "anthropic-prod"
  endpoint    = "https://api.anthropic.com/v1"
  protocol    = "anthropic_messages"
  auth_method = "x_api_key"

  token_secret_id = agyn_secret.anthropic_key.id
}
```

For `custom_headers`, pass a map under `custom_headers` instead of `token_secret_id`.

## Test a provider

The provider page in the Console shows the count of models that use the provider. To verify the credentials work, use the **Test** action on any model registered under the provider — see [Models](./models.md#test-a-model).

## Edit and delete

Editing a provider's credentials applies to **future** LLM calls. Calls already in flight finish with the old credentials.

Deleting a provider removes the configuration. Any models pointing at it are orphaned and stop resolving — agents using those models start failing their next LLM call. The Console warns you about dependent models before allowing the delete.

## Self-hosted endpoints

For self-hosted or air-gapped deployments, you can register a provider pointing at any URL that speaks the `responses` or `anthropic_messages` protocol — for example, a vLLM or TGI server with the appropriate adapter in front. Set `endpoint` to your service URL and `auth_method` to whatever your gateway expects.

## Related

- [Models](./models.md) — give each provider one or more named models.
- [Secrets](./secrets.md) — where the credential value lives.
- [Operate → Architecture overview](../operate/architecture.md) — how LLM Proxy bridges agents to providers.
