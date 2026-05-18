---
title: Networking
description: OpenZiti, Istio, DNS, ingress, TLS.
order: 2
---

# Networking

Agyn's networking has three layers, each with a clear job:

| Layer | What it does |
|---|---|
| **Ingress + TLS** | Terminates public TLS for browser-facing apps (Chat, Console, Tracing, Gateway). |
| **Istio mesh** | In-cluster service-to-service mTLS and `AuthorizationPolicy`. |
| **OpenZiti overlay** | Zero-trust private network for agent workloads, LLM Proxy, runners, and user devices. |

You configure all three at install time. The bootstrap path sets sensible defaults for everything; the production path expects you to manage them.

## Ingress + TLS

Public DNS hostnames you typically expose:

| Hostname | Purpose |
|---|---|
| `chat.<domain>` | Chat app. |
| `console.<domain>` | Console app. |
| `tracing.<domain>` | Tracing app. |
| `gateway.<domain>` | Gateway (subdomain endpoint). |
| `<domain>/api/*` | Gateway (path endpoint, used by browser apps to avoid CORS). |
| `media.<domain>` | Media proxy (authenticated). |

TLS certificates come from your cert-manager `ClusterIssuer`. Wildcards work fine. The platform charts wire up `Ingress`/`Gateway` resources for each hostname.

For Istio installations, ingress is typically the Istio ingress gateway. For non-Istio installations, any ingress controller works as long as it terminates TLS and routes to the right Service.

## Istio mesh

The platform requires Istio in `STRICT` mTLS mode. Reasons:

- Service-to-service traffic is cryptographically authenticated as a specific Kubernetes ServiceAccount.
- `AuthorizationPolicy` resources gate which ServiceAccounts can call which services on which methods.
- Internal RPCs (e.g. `Runners.CreateWorkload`, `Agents.ResolveAgentIdentity`) are restricted to specific callers without relying on application-level checks.

### `AuthorizationPolicy` examples

The platform charts ship policies for every service. A few patterns:

- The Agents Orchestrator's ServiceAccount is the only caller allowed for `Runners.CreateWorkload`, `Runners.UpdateWorkload`, `Agents.GetAgent` (config-fields view), and similar.
- The Tracing service's ServiceAccount is the only caller allowed for `Agents.ResolveAgentIdentity`.
- The Gateway's ServiceAccount is the only caller allowed for the user-facing `*Gateway` RPCs on each service.

If you ship your own internal callers (e.g. a custom reconciler), extend the affected services' `AuthorizationPolicy` to include your ServiceAccount.

## OpenZiti overlay

OpenZiti is a zero-trust overlay network. The platform uses it for:

- **Agent workloads** dialing Gateway, LLM Proxy, and Tracing — `gateway.ziti`, `llm-proxy.ziti`, `tracing.ziti`.
- **Runners** dialed by the Orchestrator over `runner-<id>` services.
- **Apps** dialing Gateway as themselves.
- **User devices** reaching exposed services in agent containers via `exposed-<id>.ziti:<port>`.

### Service naming

Each identity binds to one or more OpenZiti services. The naming convention:

| Service name | Bound by |
|---|---|
| `gateway` | The Gateway pods. |
| `llm-proxy` | LLM Proxy pods. |
| `tracing` | Tracing pods. |
| `runner-<id>` | One per registered runner. |
| `app-<id>` | One per registered app. |
| `exposed-<id>` | One per agent port exposure. |

### Static service policies

Static policies decide which identity types can bind / dial which services:

- `gateway-bind` / `gateway-dial` — Gateway pods bind; agents, apps, devices, and infrastructure services dial.
- `llm-proxy-bind` / `llm-proxy-dial` — LLM Proxy binds; agents dial.
- `tracing-bind` / `tracing-dial` — Tracing binds; agents dial.
- `runners-bind` / `orchestrators-dial-runners` — runners with `#runners` attribute bind their per-runner service; orchestrators dial.
- `apps-bind` / `apps-dial-gateway` — apps bind their per-app service and may dial gateway.

The platform charts apply these as part of install. No per-resource policy creation is needed when you register a new runner or install a new app — the static policies cover them.

### Ziti Management service

All OpenZiti operations go through the Ziti Management service. Nothing else talks to the OpenZiti Controller directly. This:

- Centralizes the controller credentials.
- Makes identity / service / policy operations observable.
- Avoids each service needing to manage its own OpenZiti client.

The controller credentials are mounted into Ziti Management as a Secret. Rotate them by updating the Secret and restarting the deployment.

## DNS

Apart from the public ingress hostnames, the platform needs:

- **`.ziti` DNS** resolvable inside agent pods. The Ziti sidecar handles this.
- **`.ziti` DNS** resolvable on enrolled user devices. The Ziti tunnel client handles this.
- **In-cluster service DNS** (standard Kubernetes `<service>.<ns>.svc.cluster.local`). Used for service-to-service over Istio.

Public DNS only carries the customer-facing hostnames.

## Network policies

Recommended (not enforced by default):

- Egress: agents can only reach the Ziti sidecar; LLM Proxy can reach configured providers; nothing else has internet.
- Ingress: only Istio ingress gateway is exposed publicly; everything else is `ClusterIP`.

The platform charts include sample `NetworkPolicy` manifests under `charts/platform/templates/networkpolicies/`. Enable them via `--set networkPolicies.enabled=true`.

## Related

- [Architecture overview](./architecture.md)
- [Identity](./identity.md)
- [Authorization](./authorization.md)
- [Security](./security.md)
