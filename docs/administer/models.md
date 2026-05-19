---
title: Models
description: Register the LLM models your agents can call.
order: 14
---

# Models

A model is a platform-side identifier (`gpt-4o`, `sonnet-4-6`, etc.) that maps to a provider, a remote model name, and the credentials needed to call it. Agents reference models by their platform name; the LLM Proxy resolves them at call time.

You need at least one [LLM provider](./llm-providers.md) before you can register a model.

## Add a model

### In the Console

1. Console → **Models** (`/organizations/<org>/models`).
2. Click **New model**.
3. Fill in:
   - **Provider** — pick from your registered providers.
   - **Name** — the platform-side identifier agents will reference (e.g. `gpt-4o`).
   - **Remote model name** — the provider's model ID (e.g. `gpt-4o-2024-08-06`).
4. Save.


The model now appears in the Models list and is selectable when creating or editing an agent.

### With Terraform

```hcl
resource "agyn_llm_model" "gpt_4o" {
  organization_id   = agyn_organization.acme.id
  provider_id       = agyn_llm_provider.openai.id

  name              = "gpt-4o"
  remote_model_name = "gpt-4o-2024-08-06"
}
```

For an Anthropic model:

```hcl
resource "agyn_llm_model" "sonnet_4_6" {
  organization_id   = agyn_organization.acme.id
  provider_id       = agyn_llm_provider.anthropic.id

  name              = "sonnet-4-6"
  remote_model_name = "claude-sonnet-4-6"
}
```

## Test a model

Verifying the model works end-to-end (credentials, endpoint, model name) without creating an agent:

### In the Console

1. Models list → click the model row.
2. In the detail pane, click **Test**.
3. The Console sends `Hello, world` to the model through the LLM Proxy and displays the response.
4. Errors (auth, model-not-found, rate limit) are shown verbatim from the provider's response.


The Test call hits the same LLM Proxy that agents use, so a successful test means real agents can call the model.

## Use a model on an agent

Agents pick a model by name. In the [Agent](./agents.md) form, the **Model** dropdown lists every registered model in the organization. Set it once and it applies to every LLM call the agent makes.

## Model naming convention

The model `name` is a platform-side identifier — pick whatever makes sense for your team:

| Pattern | Example |
|---|---|
| Mirror the provider's marketing name | `gpt-4o`, `claude-sonnet-4-6` |
| Use environment suffixes | `gpt-4o-prod`, `gpt-4o-dev` |
| Use purpose-based names | `fast-tier`, `reasoning-tier` — useful if you rotate which actual model fills each role |

The platform does not interpret the name beyond uniqueness within the organization.

## Edit and delete

Editing a model takes effect on the next LLM call. Calls already in flight complete with the old configuration.

Deleting a model removes it from the platform. Agents that referenced it by name fail their next LLM call until you either re-create the model with the same name or change the agent's model assignment.

## Token counting and cost

The platform's Metering service records every LLM call's token usage (input, cached, output, reasoning) per model. See [Use → Usage](../use/usage.md) for the customer view, and [Operate → Monitoring](../operate/monitoring.md) for the operator view.

## Related

- [LLM providers](./llm-providers.md)
- [Agents](./agents.md) — pick a model for an agent.
- [Use → Usage](../use/usage.md) — track tokens and cost.
