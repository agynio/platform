---
title: FAQ
description: Short answers to common questions.
order: 8
---

# FAQ

## General

**Is Agyn open source?**

Yes. The platform services, runtime, and tooling are AGPL-3.0 — see the `LICENSE` files in `agynio/*` repositories.

**Is there a hosted version?**

Not yet. Self-hosting is the only path today. When hosted Agyn launches, the Self-host install section of these docs will be marked optional.

**Which models can my agents use?**

Anything reachable through an OpenAI Responses API-compatible or Anthropic Messages API-compatible endpoint. That covers OpenAI, Azure OpenAI, Anthropic, and any self-hosted gateway (vLLM, TGI with adapter, etc.) that speaks one of those protocols.

**Can the platform run without internet?**

Yes — with caveats. You need:

- A self-hosted LLM endpoint reachable from the cluster.
- Container images mirrored to an internal registry.
- An internal OIDC IdP.
- Internal Postgres, Redis, S3, OpenZiti, OpenFGA.

The OpenZiti overlay is internal-only by design.

## Users and organizations

**Can a user belong to multiple organizations?**

Yes. The user switches contexts in the Console (and Chat) to choose which organization they are operating in.

**Can a user be cluster admin and an organization owner at the same time?**

Yes. Cluster admin gives platform-wide rights; the organization owner role is implicit for cluster admins on every organization.

**How do I bulk-invite users?**

Today, through the Gateway API or Terraform. The Console invites one at a time. A bulk-invite UI is on the roadmap.

**How do I rename a user?**

Users update their own profile via the Chat or Console user menu. Administrators don't rename users on their behalf.

## Agents

**Can an agent talk to another agent?**

Yes. Add multiple agents as participants in a conversation. Each gets its own context. The agents see each other's messages and can coordinate.

**Can the same agent run multiple workloads at once?**

Yes — one workload per active thread. If the agent participates in 10 threads with new messages, you'll see 10 concurrent workloads.

**Can I change an agent's model mid-conversation?**

Editing the agent's model applies to **future** workloads. Workloads currently running stay on the old model until they restart.

**Can I share a workload across organizations?**

No. Workloads are scoped to a single organization (inherited from the agent's organization).

**How do I run an agent on GPU?**

Register a runner with `capabilities: ["gpu"]` and set `capabilities: ["gpu"]` on the agent. The orchestrator only places GPU-requesting agents on GPU runners.

## Tools and MCP

**Does Agyn support every MCP server?**

Yes — the platform speaks standard MCP. Both Streamable HTTP and stdio transports are supported.

**Can an MCP call other MCPs?**

Yes. The MCP server is a regular process — it can do whatever it wants, including calling other MCPs.

**Can the same MCP be used by multiple agents?**

Yes. Configure the MCP image and ENVs the same way on each agent. The platform spins up one MCP sidecar per agent — they're isolated.

**Where do MCP sidecars run?**

In the same pod as the agent runtime container. They share the pod network and can be configured to share volumes.

## Apps

**Where do apps run?**

Wherever you deploy them. Some platform-provided apps (Reminders) ship with the platform Helm chart and run in-cluster. 3rd-party apps (Telegram Connector) run wherever you like — same cluster, your own cluster, or elsewhere — and connect to the platform via OpenZiti.

**Can apps be private to my organization?**

Yes. Publish with `visibility = "internal"`. Other organizations can't install it.

**How is an app authenticated?**

App publishing generates a service token. The app exchanges that for an OpenZiti identity on startup. All subsequent calls go over OpenZiti as the app's identity.

## Files

**What's the max file size?**

20 MB per file. Larger files require a custom MCP that handles chunked content.

**How long are files stored?**

As long as the conversation exists. Deleting a message removes the attachment from the message but keeps the file in S3 — to fully purge, an admin deletes via Activity → Storage.

**Are files encrypted at rest?**

Yes — at the S3 layer using your S3 provider's default encryption. The platform doesn't add its own encryption.

## Costs

**How do I see token spend?**

Console → Activity → Usage. Shows tokens broken down by consumer and model.

**Does Agyn charge for itself?**

The platform is open source. The cost is your infrastructure (Kubernetes, Postgres, S3) plus your LLM provider invoices.

**Can I cap a user's or organization's spend?**

Not directly today. Use your LLM provider's per-key spend limits and register separate providers per organization for hard isolation.

## Security

**Can a user see other organizations' data?**

Only cluster admins. The authorization model strictly scopes data to organizations.

**Are LLM prompts logged in plain text?**

Yes — in the Tracing service, for observability. This is the same data shown in the Run Timeline. Anyone with `can_view_workloads` on the organization can read it. Restrict accordingly.

**Are secret values ever logged?**

No. Secret values are resolved in-memory and never logged. Only references (provider + path) are logged.

**How is mTLS configured between services?**

Istio mesh in `STRICT` mode. Every in-cluster RPC requires mTLS. See [Operate → Networking](../operate/networking.md).

## Related

- [Troubleshooting overview](./README.md)
- [Choose your path](../introduction/choose-your-path.md)
