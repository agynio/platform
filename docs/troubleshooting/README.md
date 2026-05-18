---
title: Troubleshooting
description: Diagnostic playbook by symptom and FAQ.
order: 8
---

# Troubleshooting

Symptoms grouped by where they tend to show up. Start with whichever page matches what you're seeing; cross-references take you to deeper context.

## Pages

- [Install](./install.md) — bootstrap or production install failed, services won't come up.
- [Authentication / OIDC](./auth-oidc.md) — can't sign in, sign-in loop, claims missing.
- [Networking / OpenZiti](./networking-ziti.md) — agent can't reach Gateway, `.ziti` hostname fails.
- [Agents won't start](./agents.md) — workload fails, init container errors, image pull issues.
- [LLM calls fail](./llm-calls.md) — auth errors, rate limits, model not found.
- [MCP tools fail](./mcp-tools.md) — tool returns error, tool not visible to agent.
- [Tracing gaps](./tracing.md) — spans missing, run timeline empty.
- [FAQ](./faq.md) — short answers to common questions.

## Diagnostic mindset

When something doesn't work:

1. **Reproduce it.** Confirm the failure is reliable. Intermittent failures usually mean rate limits, resource contention, or DNS — different troubleshooting from "always broken."
2. **Look at the run.** If an agent is involved, open the [Run Timeline](../use/run-timeline.md). Half the time the issue is visible there (an LLM call returned an error, a tool returned bad data).
3. **Look at the logs.** Filter by `identity_id` or `trace_id` across services. See [Operate → Logging & audit](../operate/logging-audit.md).
4. **Check the obvious.** Is the service running? Are credentials in the right Secret? Did the certificate expire? Did the OIDC provider rotate keys?
5. **Bisect by component.** If you don't know which service is failing, walk through the request path (Chat app → Gateway → Threads → Notifications → Orchestrator → Runner → Pod → MCP).

## Where to ask for help

- **GitHub issues** on the relevant `agynio/*` repository — see [Reference → Service catalog](../reference/service-catalog.md).
- **Community channels** linked from the project README.
- For commercial support, your contract details apply.

When filing an issue, include:

- Agyn chart version (`helm list -n agyn`).
- Service version (look at the pod image).
- Reproduction steps.
- Relevant log snippets with `trace_id`.
- Any sanitized config (`.tf` files, Helm values).

Sanitize secrets, tokens, and personally-identifying information before sharing.
