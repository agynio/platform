---
title: LLM calls fail
description: Auth errors, rate limits, model not found.
order: 5
---

# LLM calls fail

Most LLM call failures show up in the [Run Timeline](../use/run-timeline.md) as an LLM event with status `failed`. The detail pane shows the upstream provider's response — usually a JSON body with a clear error code.

## 401 / 403 from the provider

The credentials are wrong, the auth header is wrong, or the credential has been revoked.

- Open [Administer → LLM providers](../administer/llm-providers.md). Confirm the provider's auth method and credential.
- Rotate the credential at the provider and re-paste it (or update the backing Vault path).
- For `custom_headers` providers: confirm the headers are exactly what the provider expects (some providers require both `x-api-key` and `Authorization`).
- Use the **Test** action on any model attached to the provider — that's the fastest verification.

## 404 / "model not found"

The provider's API rejects the model name.

- The `remote_model_name` on the platform's model record doesn't match what the provider serves. Confirm with the provider's model list — the Console's **Test** action surfaces the exact error.
- For Azure OpenAI: the model name is your **deployment** name, not the OpenAI model name. Check Azure's deployments list.

## 429 / rate-limited

The provider is throttling you.

- **Per-key rate limits.** Most providers throttle by API key. If many agents share one key, the limit fires fast. Register multiple providers (each with its own key) and split agents across them.
- **Tokens-per-minute limit.** Distinct from requests-per-minute. Higher concurrency on long prompts hits TPM first. Lower concurrency or use a shorter prompt.
- **LLM Proxy per-provider concurrency.** You can cap concurrent requests per provider in the LLM Proxy chart values to avoid hitting the upstream limit. See [Operate → Scaling](../operate/scaling.md#llm-proxy).

## 500 / 502 from the provider

The provider is having an issue. Check their status page. Most providers retry idempotent calls automatically on the LLM Proxy side; persistent 500s mean it's not transient.

## "Model resolved but call hangs"

The LLM Proxy resolved the model but the upstream provider isn't responding.

- Network egress from LLM Proxy to the provider is blocked. Confirm egress allowlists / proxies.
- The provider's endpoint is unreachable from your region.
- For streaming responses: the connection was set up but the provider isn't streaming. Some providers have a long time-to-first-token (TTFT) for cold models — wait a bit.

## Context window exceeded

The provider returns "context window exceeded" or similar.

- The agent's run accumulated too much context. The agent CLI should summarize automatically — check the Run Timeline for Summarization events. If none, the agent's CLI may not be configured for summarization.
- For agents that legitimately need a huge context, switch to a model with a larger context window.
- Review the agent's skills, init script outputs, and historical messages — they all count against the window.

## Token usage looks wrong

The platform records token usage from the provider's `usage` field in the response.

- Some providers don't return usage data (older models, streaming responses without `stream_options`). The Run Timeline shows token usage when available.
- Cached tokens depend on the provider's prompt cache support — see provider docs.
- Token counting in [Use → Usage](../use/usage.md) is a sum over time; if individual calls don't report usage, the totals are an underestimate.

## Calls bypass the proxy and hit the provider directly

This shouldn't happen — `agynd` exports `OPENAI_API_BASE` pointing at LLM Proxy. If the agent CLI uses a hard-coded base URL, it might bypass the proxy.

- Check the agent CLI's documentation for how to override the endpoint.
- Most CLIs respect `OPENAI_API_BASE` and equivalents. If yours doesn't, set the appropriate variable in the agent's ENVs.

## Direct test against LLM Proxy

```sh
curl -X POST http://llm-proxy.ziti:8080/v1/responses \
  -H "Authorization: Bearer ignored-by-proxy" \
  -d '{"model": "gpt-4o", "input": "hi"}'
```

(Run this from inside an enrolled pod, or use port-forward.) Should return a streaming response. If LLM Proxy responds but the upstream provider doesn't, the issue is in resolution or upstream auth.

## Related

- [Administer → LLM providers](../administer/llm-providers.md)
- [Administer → Models](../administer/models.md)
- [Use → Run Timeline](../use/run-timeline.md)
- [Operate → Scaling](../operate/scaling.md)
