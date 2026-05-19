# Agyn

> Ship AI agents to your company. Safely.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub stars](https://img.shields.io/github/stars/agynio/platform?style=social)](https://github.com/agynio/platform/stargazers)
[![Discord](https://img.shields.io/discord/1474017426898157618?label=Discord&logo=discord&logoColor=white&color=5865F2)](https://discord.com/invite/eQKYwnNqRX)

![Agyn Tour](agyn-tour.webp)

You built the agent. Now how do you let the rest of the company use it — without exposing secrets, blowing budgets, or losing control? Agyn is an open-source, Kubernetes-native platform that moves agents from laptops to company infrastructure with the controls enterprises need.

## Why Agyn

| Problem | Agyn |
|---------|------|
| Agents run on individual laptops | Centralized deployment on your infrastructure |
| Secrets passed directly to models | Secrets isolated, never exposed to the model |
| No budget visibility or limits | Spend caps at any level — per agent, per team, per org |
| No access control | RBAC, SSO, audit logs |
| Locked to one vendor | Agent-agnostic, model-agnostic |
| Can't scale | Horizontal scaling, auto-termination on idle |

## Get running in 15 minutes

```bash
git clone https://github.com/agynio/bootstrap.git
cd bootstrap
./apply.sh
```

Open the console. Create an org. Deploy your first agent.

Want a ready-made fleet to play with? Apply [`agynio/demo-agent`](https://github.com/agynio/demo-agent) — a Terraform config that provisions a support, marketing, and data-engineer agent in one command.

For production installs, see [Self-host install](./docs/self-host-install/README.md).

## Define agents as code

Stop clicking. Version your agent infrastructure.

```hcl
resource "agyn_agent" "support" {
  organization_id = agyn_organization.acme.id

  name       = "Support"
  nickname   = "support"
  model      = agyn_llm_model.gpt_4o.name
  image      = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image = "ghcr.io/agynio/agent-init-codex:v1.0.0"

  idle_timeout = "5m"
  availability = "internal"
}

resource "agyn_agent_mcp" "zendesk" {
  agent_id = agyn_agent.support.id
  name     = "zendesk"
  image    = "ghcr.io/acme/zendesk-mcp:latest"

  envs = [
    {
      name      = "ZENDESK_TOKEN"
      secret_id = agyn_secret.zendesk_token.id
    },
  ]
}
```

```bash
terraform init && terraform apply
```

See the [Terraform provider](./docs/build-extend/terraform-provider.md) reference for every resource.

## How it works

Each agent is a first-class citizen:

- **Isolated sandbox** — own container, filesystem, env vars, secrets
- **MCPs in separate containers** — full process isolation per tool
- **Observability built in** — token usage, compute, activity logs
- **Auto-scaling** — agents spin up on demand, terminate on idle

Full architecture: [docs/operate/architecture.md](./docs/operate/architecture.md).

## Video walkthroughs

| Video | What it shows |
|---|---|
| <a href="https://www.youtube.com/watch?v=v97sy17_w3A"><img src="https://img.youtube.com/vi/v97sy17_w3A/mqdefault.jpg" width="280" alt="Agyn demo"></a> | **Agyn in 5 minutes** — From clean cluster to a working agent answering a chat message. End-to-end tour. |
| *Coming soon* | **Deploying agents with Terraform** — Define an agent fleet as code, apply it, talk to them. |
| *Coming soon* | **Inspecting a run with Tracing** — Every LLM call, every tool execution, every context decision. |

## Documentation

Full docs live in [`docs/`](./docs/README.md):

- [Introduction](./docs/introduction/README.md) — what Agyn is, concepts, architecture at a glance.
- [Self-host install](./docs/self-host-install/README.md) — bootstrap, production install, upgrades.
- [Administer](./docs/administer/README.md) — Console + Terraform for orgs, agents, models, secrets, runners, apps.
- [Use](./docs/use/README.md) — chat, files, tracing, usage, port exposure.
- [Build & extend](./docs/build-extend/README.md) — Gateway API, MCP servers, agent CLIs, apps.
- [Operate](./docs/operate/README.md) — networking, identity, scaling, backups, security.
- [Reference](./docs/reference/README.md) — glossary, service catalog, schema pointers.
- [Troubleshooting](./docs/troubleshooting/README.md) — diagnostic playbook by symptom + FAQ.

## Repository map

Agyn is split across focused repositories. The most useful starting points:

| Repo | What it is |
|---|---|
| [`agynio/platform`](https://github.com/agynio/platform) | This repo. Documentation hub. |
| [`agynio/architecture`](https://github.com/agynio/architecture) | Source-of-truth architecture and product specs. |
| [`agynio/bootstrap`](https://github.com/agynio/bootstrap) | One-command local install (k3d + Terraform). |
| [`agynio/platform-charts`](https://github.com/agynio/platform-charts) | Production Helm charts. |
| [`agynio/api`](https://github.com/agynio/api) | Protobuf schemas for every service. |
| [`agynio/terraform-provider-agyn`](https://github.com/agynio/terraform-provider-agyn) | Terraform provider. |
| [`agynio/agyn-cli`](https://github.com/agynio/agyn-cli) | Platform CLI. |
| [`agynio/console-app`](https://github.com/agynio/console-app) · [`chat-app`](https://github.com/agynio/chat-app) · [`tracing-app`](https://github.com/agynio/tracing-app) | Browser UIs. |
| [`agynio/agent-init-codex`](https://github.com/agynio/agent-init-codex) · [`agent-init-claude`](https://github.com/agynio/agent-init-claude) · [`agent-init-agn`](https://github.com/agynio/agent-init-agn) | Agent CLI init images. |

Full list with descriptions: [docs/reference/service-catalog.md](./docs/reference/service-catalog.md).

## Community

- [Website](https://agyn.io)
- [Blog](https://agyn.io/blog)
- [Discord](https://discord.com/invite/eQKYwnNqRX)

## Contributing

Good places to start:

- Read [the architecture docs](https://github.com/agynio/architecture) to understand the system before touching code.
- Join the [Discord](https://discord.com/invite/eQKYwnNqRX) for questions while you work.

## License

AGPL-3.0
