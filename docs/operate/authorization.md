---
title: Authorization
description: OpenFGA, the ReBAC model, common queries.
order: 4
---

# Authorization

Agyn's authorization is **relationship-based access control (ReBAC)**, implemented with [OpenFGA](https://openfga.dev). Every check answers questions of the form "does identity X have relation Y on object Z?"

The Authorization service is a thin proxy in front of OpenFGA — it centralizes the model, adds observability, and applies a few platform conventions. Services do not talk to OpenFGA directly; they go through Authorization.

## Model in a nutshell

A small set of types and relations:

| Type | Relations |
|---|---|
| `cluster` | `admin` |
| `organization` | `owner`, `member`, `internal_access` (per-agent shortcut) |
| `agent` | `org`, `owner`, `maintainer`, `participant`, derived: `can_read_config`, `can_edit_config`, `can_delete`, `can_manage_roles`, `can_init_thread` |
| `model`, `secret`, `secret_provider`, `volume`, `runner`, `app`, `installation`, `thread` | each tied to `organization` with appropriate derivations |
| `identity` | the actor type (users, agents, runners, apps) |

Most checks reduce to "is `identity:X` a `member` or `owner` of `organization:Y`?" via inference. Per-agent roles and other fine-grained grants exist for the cases org-level isn't sufficient.

The full model lives in the `agynio/authorization` repo. The platform charts apply it during install.

## Common queries

Every platform service issues these via the Authorization service.

| Service | Common check |
|---|---|
| Agents | `member` on `organization:<org>` to list agents, `can_read_config` / `can_edit_config` on `agent:<id>` for details. |
| Threads | `member` on `organization:<org>` for thread list; `participant` of the thread to read/write messages. |
| Files | `member` on the thread the file is attached to. |
| LLM | `member` on `organization:<org>` to read providers and models. |
| Secrets | `member` for reads of metadata; `owner` for writes. Actual values resolved only by the orchestrator and LLM Proxy. |
| Runners | `member` for read; `owner` / cluster `admin` for writes. |
| Apps | `member` for read; `owner` for install/uninstall; cluster `admin` for publishing public apps. |
| Tracing | `member` on the workload's organization. |

## Internal vs. external

- **External calls** (Gateway): OpenFGA-checked. Authorization service called by each platform service to evaluate the relevant relation.
- **Internal calls** (Istio mesh): not OpenFGA-checked. Instead, Istio `AuthorizationPolicy` restricts callers by ServiceAccount. Example: `Runners.CreateWorkload` is callable only by the Orchestrator's ServiceAccount.

This split exists for performance and clarity — the Orchestrator's privileged operations don't need to round-trip through OpenFGA on every reconciliation tick.

## Tuple lifecycle

The platform writes OpenFGA tuples on resource creation, deletion, and grant changes. Examples:

- `CreateAgent` writes: the org→agent `org` tuple, the creator→agent `owner` tuple, and (if availability is `internal`) the org→agent `internal_access` tuple.
- `SetAgentRole` writes/replaces a `<identity>, <role>, agent:<id>` tuple.
- `DeleteAgent` deletes every tuple on `agent:<id>`.

You can inspect the OpenFGA store directly with the `fga` CLI for debugging. The Authorization model docs describe every relation and the inference rules.

## OpenFGA store and model versioning

OpenFGA stores tuples in PostgreSQL. The model itself is versioned — re-applying the `platform` Terraform stack writes new model versions when the schema changes. Old tuples that reference removed relations are migrated by the service that owns them.

To list models:

```sh
fga model list --store-id $FGA_STORE_ID
```

To pin to a specific model (typically only for debugging):

```sh
fga model write --store-id $FGA_STORE_ID --file new-model.json
```

The platform always reads the latest model.

## Common operator queries

### "Who has access to organization X?"

```sh
fga query list-users --store-id $FGA_STORE_ID \
  --type identity --object organization:<org-id> --relation member
```

### "What organizations does user Y belong to?"

```sh
fga query list-objects --store-id $FGA_STORE_ID \
  --user identity:<identity-id> --type organization --relation member
```

### "Who can edit agent Z's configuration?"

```sh
fga query list-users --store-id $FGA_STORE_ID \
  --type identity --object agent:<agent-id> --relation can_edit_config
```

(`can_edit_config` derives from agent `owner`, agent `maintainer`, and org `owner`.)

### "Is this token a cluster admin?"

```sh
fga query check --store-id $FGA_STORE_ID \
  --user identity:<identity-id> --relation admin --object cluster:global
```

## Authorization Playground

For visual exploration of the model and tuples, deploy OpenFGA's Playground:

- Bootstrap: bundled at `https://openfga-playground.agyn.dev:2496/`.
- Production: install separately and point at your store.

Playground is invaluable for debugging "why doesn't this user see X?" problems.

## Adding custom relations

Custom relations require updating the model. Process:

1. Fork or extend `agynio/authorization`.
2. Edit the model DSL.
3. Test in your dev environment.
4. Submit as an upstream change (we welcome them).

We are conservative about model changes — they affect every check on the platform.

## Related

- [Identity](./identity.md)
- [Architecture overview](./architecture.md) — internal vs. external context.
- [Authorization model in agynio/authorization](https://github.com/agynio/authorization)
