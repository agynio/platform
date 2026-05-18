---
title: Identity
description: OIDC integration, user provisioning, devices.
order: 3
---

# Identity

Identity in Agyn covers four entity types. Each has a `identity_id` (UUID) and an `identity_type`:

| Type | Authentication |
|---|---|
| **user** | OIDC. Provisioned on first login. |
| **agent** | OpenZiti identity, created by the orchestrator at workload assembly. |
| **runner** | OpenZiti identity, created on enrollment. |
| **app** | OpenZiti identity, created on app enrollment. |

The Identity service is the central registry. Other services hold `identity_id` references and call Identity to resolve type when needed.

## OIDC for users

### What you configure

The Users service speaks to your OIDC IdP via:

- **Issuer URL** — the IdP's discovery endpoint base (without `/.well-known/openid-configuration`).
- **Client ID** — registered with the IdP.
- **Client secret** — optional, depending on the flow (PKCE-only flows don't need it).
- **Audience** — typically the client ID itself.

The Console and Chat apps use **Authorization Code with PKCE** — no client secret needed in browser flows. The Users service validates tokens server-side using the IdP's JWKS endpoint.

### First-login provisioning

When a user signs in for the first time:

1. The browser flow returns an ID token + access token.
2. The browser calls Gateway → Users → `ResolveUser` with the access token.
3. The Users service calls the IdP's UserInfo endpoint to fetch full claims.
4. A new user record is created with `oidc_subject` = the IdP's `sub` claim. The Identity service registers an `identity_id` of type `user`.
5. A `username` is derived from the user's email or `preferred_username`, with collision handling (append a suffix if taken).

Subsequent sign-ins look up the user by `oidc_subject` and return the existing record.

### Multiple IdPs

The Users service supports one IdP today. Multi-IdP setups (e.g. employee SSO + customer SSO on the same platform) are deferred — see [open questions in the architecture repo](https://github.com/agynio/architecture/blob/main/open-questions.md).

### Rotating the IdP

If you change IdPs:

1. New OIDC config takes effect on the next user authentication.
2. Existing user records keep their old `oidc_subject`. They fail to authenticate until you either:
   - Migrate their `oidc_subject` field to the value the new IdP issues for them, **or**
   - Have them sign in with the new IdP — but the Users service will create a new user record, breaking continuity with their existing memberships.

The first option is preferable. Run a migration script that maps old subjects to new ones.

## Agent identities

The orchestrator creates an OpenZiti identity per agent workload start (and reuses it across restarts in the same workload lifetime). The identity is bound to the agent's `identity_id` in the Identity service.

This is how:

- Agents authenticate to Gateway over OpenZiti as themselves.
- The Tracing service knows which agent emitted a span (resolves OpenZiti identity → `identity_id` → `agent_id`).
- Per-agent authorization tuples in OpenFGA take effect.

The Ziti Management service handles the OpenZiti identity lifecycle, including a GC for orphaned identities whose workloads stopped.

## Runner identities

Runner enrollment exchanges a long-lived service token for an OpenZiti identity:

1. Runners service generates the token at registration time.
2. On runner start, the runner calls `EnrollRunner` with the token.
3. The Runners service validates the token, asks Ziti Management to create an OpenZiti identity, stores the mapping.
4. Returns the enrolled identity to the runner.

Runners re-enroll with the same token across restarts. Each restart yields a fresh OpenZiti identity (the old one is deleted).

## App identities

Apps enroll with the service token from app publication. Same model as runners — token → OpenZiti identity. The app's `identity_id` is consistent across enrollments; the OpenZiti identity rotates.

## Devices

Devices belong to users — see [Use → Devices](../use/devices.md) for the user view. Operationally:

- Each device has its own OpenZiti identity, scoped to that user.
- The user uses the JWT to enroll the identity via a Ziti tunnel client.
- Revoking a device deletes its OpenZiti identity. Other devices for the same user are unaffected.

## Service accounts / non-human users

The platform supports "users" that are really machine accounts:

- Provision them in your IdP as you would any user.
- Their first OIDC sign-in (via a CI flow) creates a Users record.
- Generate API tokens under them for unattended access.

This is the recommended pattern for CI, Terraform automation, and other unattended callers — don't share personal tokens across systems.

## Audit

Every authentication and authorization decision is loggable. By default, Gateway logs:

- Auth method (OIDC / API token / OpenZiti).
- Resolved `identity_id`.
- Method called.
- Authorization outcome.

For long-term retention, ship Gateway logs to your SIEM. See [Logging & audit](./logging-audit.md).

## Related

- [Authorization](./authorization.md)
- [Networking](./networking.md) — OpenZiti is what backs agent/runner/app identities.
- [Use → API tokens](../use/api-tokens.md)
- [Use → Devices](../use/devices.md)
