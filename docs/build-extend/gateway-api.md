---
title: Gateway API
description: ConnectRPC entry point for everything external clients do.
order: 1
---

# Gateway API

The Gateway is the platform's external API. Every client — Console, Chat app, Tracing app, `agyn` CLI, Terraform, your own integrations, even agent workloads — calls Gateway to do anything on the platform.

## Wire protocols

Gateway speaks [ConnectRPC](https://connectrpc.com), which is a multi-protocol gRPC implementation. A single Gateway endpoint serves three protocols from the same handler:

| Protocol | Use case |
|---|---|
| **ConnectRPC** (HTTP/1.1 or HTTP/2, JSON or Protobuf body) | Browser clients, simple JSON-over-HTTP integrations. |
| **gRPC** (HTTP/2, Protobuf body) | Server-to-server when you have a gRPC client. |
| **gRPC-Web** | Browser streaming RPCs. |

Most teams pick ConnectRPC with JSON for simplicity. Server-side languages with gRPC tooling can use whichever they prefer.

## Endpoints

| URL | Notes |
|---|---|
| `gateway.<your-domain>` | Subdomain endpoint. Mostly used by clients dialing Gateway directly. |
| `<your-domain>/api/` | Path-based endpoint. Prefix is stripped before routing. Used by Console and Chat to avoid CORS. |

## Authentication

Every request is authenticated independently. The Gateway accepts:

- **OIDC JWTs** in `Authorization: Bearer <token>` — for browser users after sign-in.
- **API tokens** in `Authorization: Bearer agyn_<...>` — for programmatic access. See [Use → API tokens](../use/api-tokens.md).
- **OpenZiti mTLS** — automatically presented by agent workloads, apps, and infrastructure services dialing Gateway over the platform's overlay network. No `Authorization` header needed in that path.

All three resolve to the same `identity_id`. Authorization checks happen on the identity, not on the credential type.

## Calling the API

Pick a service from the [API contracts](../reference/api.md) — typically one of `UsersGateway`, `OrganizationsGateway`, `AgentsGateway`, `RunnersGateway`, `LLMGateway`, `SecretsGateway`, `AppsGateway`, `ChatGateway`, `ThreadsGateway`, `FilesGateway`, `NotificationsGateway`, `TracingGateway`.

Each service has a fully-qualified path: `<package>.<Service>/<Method>`.

### Example: get the current user

ConnectRPC over JSON:

```sh
curl -X POST \
  https://gateway.agyn.example.com/api/agynio.api.users.v1.UsersGateway/GetMe \
  -H "Authorization: Bearer $AGYN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:

```json
{
  "user": {
    "identityId": "f0c1e3...",
    "username": "vitalii",
    "email": "vitalii@agyn.io",
    "name": "Vitalii Valkov"
  }
}
```

### Example: list agents in an organization

```sh
curl -X POST \
  https://gateway.agyn.example.com/api/agynio.api.agents.v1.AgentsGateway/ListAgents \
  -H "Authorization: Bearer $AGYN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "<org_id>", "pageSize": 50}'
```

## Generated clients

Use the official Protobuf schemas from [`agynio/api`](https://github.com/agynio/api) to generate clients in your language. With [`buf`](https://buf.build):

```sh
buf generate https://github.com/agynio/api.git
```

`buf.gen.yaml` controls the generators (Go, TypeScript, Python, etc.). The Console and Chat apps use `buf` with TypeScript generators; the `agyn` CLI uses Go generators.

## Streaming RPCs

A few Gateway methods are server-streaming — the response is a sequence of messages over time:

- `NotificationsGateway/Subscribe` — real-time events for the UI.
- `RunnersGateway/StreamWorkloadLogs` — container logs.
- `TracingGateway/StreamRunEvents` — run events as they happen.

Use ConnectRPC streaming, gRPC streaming, or gRPC-Web (depending on your client and environment) to consume them.

## Pagination

List endpoints use cursor-based pagination:

```json
{
  "pageToken": "...",   // empty on first page
  "pageSize": 50
}
```

The response includes `nextPageToken` if more results exist. Pass it back in the next request. Changing filters or sort resets pagination — discard any previous `pageToken`.

## Errors

Gateway returns gRPC status codes mapped into HTTP for ConnectRPC. Common ones:

| Code | Meaning |
|---|---|
| `INVALID_ARGUMENT` | Required field missing or malformed. |
| `UNAUTHENTICATED` | No valid credential. |
| `PERMISSION_DENIED` | Authenticated but lacking authorization for this resource. |
| `NOT_FOUND` | Resource does not exist (or you're not allowed to know). |
| `RESOURCE_EXHAUSTED` | Rate-limited. |
| `INTERNAL` | Server-side error — open an issue. |

Error responses carry a `code` and `message`, plus optionally a `details` array for structured error info.

## What's exposed and what isn't

Gateway exposes the **external** surface of every platform service. Internal RPCs (orchestrator-to-runner, service-to-service over Istio) are not reachable from Gateway. The dividing line is documented in each service's spec — see [Reference → Service catalog](../reference/service-catalog.md) for pointers.

## Related

- [Reference → API contracts](../reference/api.md)
- [Use → API tokens](../use/api-tokens.md) — credentials for calling Gateway.
- [Terraform provider](./terraform-provider.md) — built on top of Gateway.
- [agyn CLI](./agyn-cli.md) — interactive Gateway client.
