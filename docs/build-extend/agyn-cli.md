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

```sh
agyn login --gateway https://gateway.agyn.example.com
```

Opens a browser, signs in via OIDC, stores a token in `~/.config/agyn/credentials`.

Alternatively, use an [API token](../use/api-tokens.md):

```sh
agyn login --gateway https://gateway.agyn.example.com --token "$AGYN_TOKEN"
```

Or set environment variables:

```sh
export AGYN_GATEWAY=https://gateway.agyn.example.com
export AGYN_TOKEN=agyn_...
agyn whoami
```

## Common commands

```sh
agyn whoami                       # current user
agyn organizations list           # orgs you can see
agyn organizations use <name>     # default org for subsequent commands

agyn agents list                  # agents in the current org
agyn agents get <name>            # detail
agyn agents create -f agent.yaml  # create from YAML

agyn runners list
agyn runners register --name local --scope org
agyn runners enroll --token <service-token>

agyn llm providers list
agyn llm models list
agyn llm models test gpt-4o "Hello"

agyn secrets list
agyn secrets create stripe-key --value "$STRIPE_KEY"

agyn threads list                 # all threads in current org
agyn threads tail <thread-id>     # follow messages live

agyn expose add 3000              # inside an agent — open port 3000
agyn expose list
agyn expose remove 3000
```

Run `agyn --help` or `agyn <command> --help` for full syntax.

## Output formats

- Default: human-readable tables.
- `-o json` or `-o yaml` for machine-parseable output.

Pipe JSON output through `jq` for scripting:

```sh
agyn agents list -o json | jq '.[] | select(.availability == "private") | .name'
```

## Use inside an agent workload

Inside a workload, `agyn` is already on PATH and configured to talk to Gateway over OpenZiti. No `agyn login` step needed — the pod's OpenZiti identity authenticates the calls.

Common in-workload commands:

```sh
agyn expose add 3000
agyn files upload report.pdf
agyn threads post "Status update: ..."
```

This is how agents call the platform without baking platform credentials into the agent CLI.

## Scripting tips

- Use `--gateway` and `--token` flags (or `AGYN_GATEWAY` / `AGYN_TOKEN` env vars) to keep credentials out of `~/.config`.
- Always pin to a known output format (`-o json`) when piping — the default table format is for humans and may change.
- `agyn` exits with non-zero on errors. Check `$?` in scripts.

## Related

- [Use → API tokens](../use/api-tokens.md) — credentials for CI use.
- [Gateway API](./gateway-api.md) — what `agyn` wraps.
- [Terraform provider](./terraform-provider.md) — for declarative management instead.
