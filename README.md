# Agyn

Ship AI agents to your company. Safely.

You built the agent. Now how do you let the rest of the company use it — without exposing secrets, blowing budgets, or losing control?

Agyn is an open-source platform that moves agents from laptops to company infrastructure with the controls enterprises need.

## Why Agyn

| Problem | Agyn |
|---------|------|
| Agents run on individual laptops | Centralized deployment on your infrastructure |
| Secrets passed directly to models | Secrets isolated, never exposed to the model |
| No budget visibility or limits | Spend caps at any level — per agent, per team, per org |
| No access control | RBAC, SSO, audit logs |
| Locked to one vendor | Agent-agnostic, model-agnostic |
| Can't scale | Horizontal scaling, auto-termination on idle |

## Demo

[![Agyn Demo](https://img.youtube.com/vi/v97sy17_w3A/maxresdefault.jpg)](https://www.youtube.com/watch?v=v97sy17_w3A)

## Get Running in 60 Seconds

```bash
git clone https://github.com/agynio/bootstrap.git
cd bootstrap
./apply.sh
```

Open the console. Create an org. Deploy your first agent.

## Provision Agents with Terraform

Stop clicking. Version your agent infrastructure.

```hcl
resource "agyn_agent" "data_engineer" {
  name          = "data-engineer"
  model         = "claude-sonnet-4-6"
  sandbox_image = "agyn/sandbox:latest"
  idle_timeout  = "10m"

  mcp = ["filesystem", "postgres", "slack"]
}

resource "agyn_agent" "support" {
  name          = "support-agent"
  model         = "gpt-4o"
  sandbox_image = "agyn/sandbox:latest"
  idle_timeout  = "2m"

  mcp = ["zendesk", "notion"]
}
```

```bash
terraform init && terraform apply
```

## How It Works

Each agent is a first-class citizen:

- **Isolated sandbox** — own container, filesystem, env vars, secrets
- **MCPs in separate containers** — full process isolation per tool
- **Observability built in** — token usage, compute, activity logs
- **Auto-scaling** — agents spin up on demand, terminate on idle

## Documentation

- [Architecture](https://github.com/agynio/architecture)

## Community

- [Website](https://agyn.io)
- [Blog](https://agyn.io/blog)
- [Discord](https://discord.com/invite/eQKYwnNqRX)

## License

AGPL-3.0
