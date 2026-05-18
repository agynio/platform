---
title: API contracts
description: Where to find the Protobuf schemas for every service.
order: 3
---

# API contracts

Every Agyn service exposes its API via Protobuf. The schemas live in a single repository — [`agynio/api`](https://github.com/agynio/api) — and are the source of truth for both internal gRPC services and the external Gateway via ConnectRPC.

This page is a pointer rather than a full API reference. The repository's schemas are versioned and machine-generatable; we don't duplicate them here.

## Repository layout

```
agynio/api/
├── proto/agynio/api/
│   ├── agents/v1/
│   ├── chat/v1/
│   ├── files/v1/
│   ├── identity/v1/
│   ├── llm/v1/
│   ├── notifications/v1/
│   ├── organizations/v1/
│   ├── runners/v1/
│   ├── secrets/v1/
│   ├── threads/v1/
│   ├── tracing/v1/
│   ├── users/v1/
│   └── ...
├── buf.yaml
└── buf.gen.yaml
```

Each package's `*.proto` file defines:

- The internal service (used by other platform services over gRPC).
- The external `<Service>Gateway` (exposed through the Gateway via ConnectRPC).
- All request/response messages and enums.

## Generate clients

With [`buf`](https://buf.build) installed:

```sh
buf generate https://github.com/agynio/api.git
```

`buf.gen.yaml` controls which languages get generated. Out of the box it includes Go and TypeScript; add more generators as needed.

For a one-off check of method signatures:

```sh
buf lint https://github.com/agynio/api.git
buf curl https://gateway.agyn.example.com/agynio.api.users.v1.UsersGateway/GetMe \
  --protocol connect --schema https://github.com/agynio/api.git
```

## Gateway services

The external API surface — every method below is callable via the Gateway:

| Service | Methods (selection) |
|---|---|
| `UsersGateway` | `GetMe`, `GetUser`, `SearchUsers`, `CreateAPIToken`, `ListAPITokens`, `RevokeAPIToken`, `CreateDevice`, `ListDevices`, `DeleteDevice` |
| `OrganizationsGateway` | `CreateOrganization`, `GetOrganization`, `ListOrganizations`, `UpdateOrganization`, `DeleteOrganization`, `CreateMembership`, `AcceptMembership`, `DeclineMembership`, `RemoveMembership`, `UpdateMembershipRole`, `ListMembers`, `ListMyMemberships` |
| `AgentsGateway` | `CreateAgent`, `GetAgent`, `ListAgents`, `UpdateAgent`, `DeleteAgent`, plus CRUD for MCPs, Skills, Hooks, ENVs, InitScripts, Volume Attachments, Image Pull Secret Attachments. Also: `SetAgentRole`, `RemoveAgentRole`, `ListAgentRoles`, `ListMyAgentRoles` |
| `RunnersGateway` | `RegisterRunner`, `GetRunner`, `ListRunners`, `UpdateRunner`, `DeleteRunner`, `EnrollRunner`, `ListWorkloads`, `GetWorkload`, `ListWorkloadsByThread`, `TouchWorkload`, `StreamWorkloadLogs`, `GetVolume`, `ListVolumes`, `ListVolumesByThread` |
| `LLMGateway` | `CreateProvider`, `GetProvider`, `ListProviders`, `UpdateProvider`, `DeleteProvider`, `CreateModel`, `GetModel`, `ListModels`, `UpdateModel`, `DeleteModel`, `TestModel` |
| `SecretsGateway` | `CreateSecretProvider`, `GetSecretProvider`, `ListSecretProviders`, `UpdateSecretProvider`, `DeleteSecretProvider`, `CreateSecret`, `GetSecret`, `ListSecrets`, `UpdateSecret`, `DeleteSecret`, `CreateImagePullSecret`, `GetImagePullSecret`, `ListImagePullSecrets`, `UpdateImagePullSecret`, `DeleteImagePullSecret` |
| `ChatGateway` | `ListConversations`, `GetConversation`, `CreateConversation`, `UpdateConversation`, `MarkRead`, `GetUnackedMessageCounts` |
| `ThreadsGateway` | `CreateThread`, `GetThread`, `ListThreads`, `SendMessage`, `AckMessages`, `GetUnackedMessages`, `GetMessages`, `AddParticipant`, `DegradeThread` |
| `FilesGateway` | `UploadFile`, `GetFileMetadata`, `GetDownloadUrl`, `GetFileContent` |
| `NotificationsGateway` | `Subscribe` (server-streaming) |
| `TracingGateway` | `ListSpans`, `GetSpan`, `GetTrace`, `StreamRunEvents` (server-streaming) |
| `AppsGateway` | `CreateApp`, `GetApp`, `GetAppBySlug`, `ListApps`, `UpdateApp`, `DeleteApp`, `InstallApp`, `GetInstallation`, `ListInstallations`, `UpdateInstallation`, `UninstallApp` |

For the full method list and request/response shapes, see each service's `.proto` file in the repository.

## Streaming methods

Server-streaming methods over ConnectRPC:

- `NotificationsGateway/Subscribe` — real-time events.
- `RunnersGateway/StreamWorkloadLogs` — container logs.
- `TracingGateway/StreamRunEvents` — run events as they happen.
- `FilesGateway/GetFileContent` — file bytes.

Most clients consume these via ConnectRPC's `stream` API. gRPC and gRPC-Web both work.

## Authentication for API calls

See [Build & extend → Gateway API](../build-extend/gateway-api.md) for how to authenticate (OIDC, API tokens, OpenZiti mTLS).

## Versioning

- All API packages are `v1`. Breaking changes will go through a `v2` package with both versions served for a deprecation window.
- Field additions are non-breaking and roll out without a version bump.
- Default field values are explicit on every message — clients should always send the fields they care about.

## Internal services

Not every service in `agynio/api` is exposed through the Gateway. Internal services (e.g. `Runners.CreateWorkload`, `Agents.ResolveAgentIdentity`) are restricted to specific platform callers via Istio `AuthorizationPolicy`. See each service's spec for the internal vs. external split.

## Related

- [Build & extend → Gateway API](../build-extend/gateway-api.md) — calling Gateway in practice.
- [Service catalog](./service-catalog.md) — which service backs each API package.
- [`agynio/api`](https://github.com/agynio/api) — the schemas themselves.
