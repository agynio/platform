---
title: Security
description: Hardening, key rotation, network policies.
order: 10
---

# Security

This page covers the security model and hardening recommendations for production deployments. The platform aims for sensible defaults — this page is for taking them further.

## Trust boundaries

| Boundary | What's on each side |
|---|---|
| **Browser ↔ Gateway** | Browser holds OIDC ID token + access token. Gateway validates each request. Use HTTPS + HSTS. |
| **API token ↔ Gateway** | Token holder has all permissions of the owning identity. Tokens are bearer credentials — treat as secrets. |
| **Agent pod ↔ Gateway / LLM Proxy** | Agent pod has an OpenZiti identity. Authentication is the mTLS handshake. No bearer tokens leak out of the pod. |
| **Service ↔ Service (Istio mesh)** | Istio mTLS in `STRICT` mode. `AuthorizationPolicy` restricts caller ServiceAccounts. |
| **Operator ↔ Cluster** | kubectl / Helm / direct cluster access. Use your standard IAM. |

The two most important: the **browser ↔ Gateway** boundary (the user-facing attack surface) and the **agent pod ↔ Gateway** boundary (agent code running with the agent's identity).

## TLS

- Public endpoints (`chat`, `console`, `tracing`, `gateway`, `media`) use TLS terminated by your ingress / Istio gateway. Use a real certificate (cert-manager + Let's Encrypt, or your CA).
- In-cluster traffic uses Istio mTLS — `PeerAuthentication` set to `STRICT` mesh-wide. Verify with `istioctl x authz check`.
- OpenZiti uses its own mTLS. Identity certificates rotate; the platform handles re-enrollment automatically for agents and runners. For user devices, JWT enrollment is one-shot.

## OIDC hardening

- Use **PKCE** for the browser flow (mandatory).
- Use **short token lifetimes** (5-15 min for access tokens) plus refresh.
- Require **MFA** at the IdP for accounts that hold cluster admin or org owner.
- Configure the IdP to use **audience-restricted tokens** so a token issued for Agyn isn't usable elsewhere.

## API token hygiene

- Tokens are stored hashed on the platform — only the prefix is visible after creation.
- The `agyn_` prefix exists for secret-scanning tools (GitHub, GitLab, TruffleHog). Enable scanning on every repo that might handle tokens.
- Rotate any long-lived service tokens on a schedule (every 90 days is reasonable).
- Use **one token per consumer** — don't share between systems. Revocation should not break unrelated systems.

## OpenFGA model integrity

- Treat the authorization model as production code. Changes go through code review.
- Re-apply the model on every upgrade — the chart does this automatically; if you have a custom flow, don't skip.
- Periodically audit tuples that grant elevated relations:
  ```sh
  fga query list-users --store-id $FGA_STORE_ID \
    --type identity --object cluster:global --relation admin
  ```
  Anything you don't recognize is worth investigating.

## Secret management

- Use a [secret provider](../administer/secret-providers.md) (Vault) for credentials whenever possible. Avoids storing values in the platform database.
- Local secrets are encrypted at rest with a Kubernetes Secret key — rotate this key periodically. The chart includes a rotation procedure (see release notes for the appropriate version).
- Never log secret values. Service logs redact known secret keys; review your own code if you add custom logging.

## Network policies

The platform charts include sample `NetworkPolicy` manifests. Enable them:

```sh
helm upgrade agyn-platform agyn/platform -n agyn \
  --set networkPolicies.enabled=true
```

Default policies:

- **Agent pods** can only reach the Ziti sidecar. No direct internet.
- **LLM Proxy** can reach configured providers' egress IP ranges (configure via `llmProxy.allowedEgressCidrs`).
- **Platform services** can only reach other in-cluster services and their configured databases / Redis.
- **OpenFGA** is reachable only from the Authorization service.

Tune per-environment — DR replicas and observability tooling may need exceptions.

## SSRF protection

The Media Proxy proxies external URLs on behalf of the browser (for inline images and media). To prevent SSRF, it blocks:

- RFC 1918 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Link-local (`169.254.0.0/16`).
- ULA (`fc00::/7`).
- Configured allow/deny lists.

Custom Media Proxy filters live in `mediaProxy.allowDeny` in the chart.

## Kubernetes hardening

- Run platform services as **non-root** with **read-only root filesystems**. The chart defaults to this.
- Use **PodSecurityStandards: restricted** on the `agyn` namespace.
- Use **`runAsNonRoot`** with explicit user/group IDs.
- Limit container capabilities (`drop: ["ALL"]`).
- Use **`automountServiceAccountToken: false`** on pods that don't need K8s API access.

Agent pods need slightly more capability than platform services (they run user code). Still scope them — use a separate namespace (`agyn-workloads`) and a restricted ServiceAccount.

## Vulnerability management

- Subscribe to release notifications for `agynio/*` repositories.
- Apply patch releases promptly. Security patches are flagged in release notes.
- Run image vulnerability scans (Trivy, Snyk, your preferred scanner) on the platform images you pull. Most CVEs come from base images.

## Audit log

For privileged actions:

- Cluster admin grants/revokes.
- Organization deletions.
- App publications.
- Configuration of LLM providers and credentials.
- Secret writes.

The platform emits structured audit events. Ship them to your SIEM. See [Logging & audit](./logging-audit.md).

## Multi-tenant isolation

The platform's authorization model isolates organizations by ReBAC. Concretely:

- A user in org A cannot see org B's threads, agents, or runners — every API call is scoped by the organization the caller has membership in.
- Apps installed in org A do not see org B's data.
- Cluster admins can see all orgs by design — treat the cluster admin role as the most powerful role on the platform.

Audit cluster admin holdership regularly.

## Penetration testing

If you operate a high-stakes deployment, periodic third-party pentests are worth the cost. Focus areas:

- Authentication and session management.
- Authorization edge cases (especially around app installations and per-agent roles).
- File upload and download (Media Proxy SSRF surface).
- OpenZiti exposure (devices, port exposure).
- Tracing data leakage (contexts contain anything in agent prompts).

## Related

- [Identity](./identity.md)
- [Authorization](./authorization.md)
- [Networking](./networking.md)
- [Logging & audit](./logging-audit.md)
