---
title: agyn CLI
description: Interactive and scripting access from your shell.
order: 7
---

# agyn CLI

`agyn` is the platform CLI. It wraps the [Gateway API](./gateway-api.md) for interactive and scripting use. Use it from your laptop to query and manage platform resources, or from inside an agent workload to talk to the platform programmatically.

Source: [`agynio/agyn-cli`](https://github.com/agynio/agyn-cli).

## Install

```sh
# macOS / Linux via Homebrew
brew install agynio/tap/agyn

# Or download from releases
curl -L https://github.com/agynio/agyn-cli/releases/latest/download/agyn-$(uname -s)-$(uname -m) \
  -o /usr/local/bin/agyn && chmod +x /usr/local/bin/agyn
```

Inside agent workloads, `agyn` is on PATH automatically — it ships in every init image.

## Authenticate

Create an [API token](../use/api-tokens.md) in the Console, point a profile at your gateway, and hand the token to the CLI:

```sh
agyn profile set default --gateway-url https://gateway.agyn.example.com
agyn auth set-token
agyn auth whoami
```

`agyn auth set-token` prompts when attached to a terminal and otherwise reads stdin. It never takes the token as an argument, so it stays out of your shell history:

```sh
echo "$AGYN_TOKEN" | agyn auth set-token
```

The token is stored in `~/.agyn/credentials`, keyed by profile. The gateway URL defaults to `https://gateway.agyn.dev` when no profile sets one, which is what a [local install](../local-install/install.md) uses.

Once authenticated, you can mint further tokens from the CLI itself:

```sh
agyn auth create-token --name ci   # prints the token once
agyn auth list-tokens
agyn auth revoke-token <id>
```

### Environment variables

For CI, skip the config file entirely:

```sh
export AGYN_GATEWAY_URL=https://gateway.agyn.example.com
export AGYN_TOKEN=agyn_...
agyn auth whoami
```

| Variable | Purpose |
|---|---|
| `AGYN_GATEWAY_URL` | Gateway base URL |
| `AGYN_TOKEN` | API token |
| `AGYN_ORGANIZATION` | Organization for org-scoped commands |
| `AGYN_PROFILE` | Profile to run under |

## Profiles

A profile is a named set of connection settings — gateway URL, organization, and a CA to trust — each with its own stored token. One machine can address a cloud platform and a [local VM](../local-install/manage.md) without rewriting configuration between commands.

```sh
agyn profile list
agyn profile set staging --gateway-url https://gateway.staging.example.com
agyn profile use staging          # or: agyn profile select — interactive picker
agyn profile show
agyn profile remove staging
```

Resolution order: `--profile`, then `AGYN_PROFILE`, then the recorded choice, then `default`. `agyn local start` provisions a `local` profile for the VM it creates.

## Common commands

```sh
agyn auth whoami                  # current identity, profile, organization
agyn organizations list
agyn organizations use <name>     # or: agyn organizations select

agyn threads list
agyn threads create --ref research --add @research_bot --send "Summarize X"
agyn threads send --thread research --message "Focus on methodology" --wait 120
agyn threads read --thread research --unread
agyn threads add --thread research --participant @planner

agyn files upload ./report.pdf    # prints the file ID
agyn files download <file-id>

agyn sandbox start --env python-tools
agyn sandbox connect
agyn sandbox list

agyn expose add 3000              # inside an agent — open port 3000
agyn expose list
agyn expose remove 3000
```

Other command groups: `agyn apps`, `agyn group`, `agyn egress rule`, `agyn network`, `agyn resource`, `agyn tunnel`, `agyn messages`, `agyn local`, `agyn app-proxy`.

Run `agyn --help` or `agyn <command> --help` for full syntax.

### Managed elsewhere

Agents, runners, LLM providers and models, secrets, and users have no CLI command group. Manage them in the [Console](../administer/console-overview.md) or with the [Terraform provider](./terraform-provider.md).

## Output formats

- Default: human-readable tables.
- `-o json` or `-o yaml` for machine-parseable output.
- `--no-color` disables color.

Pipe JSON output through `jq` for scripting:

```sh
agyn threads list -o json | jq '.[] | .id'
```

## Use inside an agent workload

Inside a workload, `agyn` is already on PATH and configured to talk to Gateway over OpenZiti. No authentication step is needed — the pod's OpenZiti identity authenticates the calls.

Common in-workload commands:

```sh
agyn expose add 3000
agyn files upload report.pdf
agyn threads send --thread research --message "Status update: ..."
```

This is how agents call the platform without baking platform credentials into the agent CLI.

## Scripting tips

- Use `--gateway-url` with `AGYN_TOKEN`, or a dedicated `--profile`, to keep CI credentials out of your everyday config.
- Always pin to a known output format (`-o json`) when piping — the default table format is for humans and may change.
- `agyn` exits with non-zero on errors. Check `$?` in scripts.

## Related

- [Use → API tokens](../use/api-tokens.md) — credentials for CI use.
- [Gateway API](./gateway-api.md) — what `agyn` wraps.
- [Terraform provider](./terraform-provider.md) — for declarative management instead.
