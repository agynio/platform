---
title: Networking / OpenZiti
description: Agent can't reach Gateway, `.ziti` hostname fails.
order: 3
---

# Networking / OpenZiti

## Agent pod can't reach Gateway over `gateway.ziti`

Symptom: `agynd` logs show `dial tcp: lookup gateway.ziti: no such host` or `connection refused`.

Walk through:

1. **Ziti sidecar present?** `kubectl get pod -n agyn-workloads <agent-pod> -o jsonpath='{.spec.containers[*].name}'`. The list should include a `ziti-sidecar` (or similar — name set by the runner).
2. **Ziti sidecar healthy?** `kubectl logs -n agyn-workloads <agent-pod> -c ziti-sidecar`. Look for enrollment errors, controller unreachable, certificate issues.
3. **Identity created?** Each agent workload gets a fresh OpenZiti identity. Check Ziti Management logs in the platform namespace:
   ```sh
   kubectl logs -n agyn deploy/ziti-management --tail=200 | grep <agent-id>
   ```
   Should show `CreateAgentIdentity` for the agent.
4. **Service policy applied?** Static policies `gateway-bind` and `agents-dial-gateway` should be in place from chart install. If they're missing, agents can't dial Gateway. Verify:
   ```sh
   ziti edge list service-policies
   ```

If the Ziti sidecar isn't there at all, the runner is not injecting it. Check the runner's configuration.

## Device can't reach `exposed-<id>.ziti:<port>`

1. **Tunnel client running?** `pgrep ziti-edge-tunnel` (Linux) or check Ziti Desktop Edge is signed in.
2. **Identity enrolled?** In Ziti Desktop Edge, the identity should show as enrolled and connected. In `ziti-edge-tunnel`, check `journalctl -u ziti-edge-tunnel`.
3. **DNS resolution working?** `dig +short exposed-<id>.ziti`. If empty, the tunnel client isn't routing the hostname; restart it.
4. **Service registered?** The expose service creates an OpenZiti service per exposure. Confirm:
   ```sh
   ziti edge list services --filter 'name contains "exposed-"'
   ```
5. **Agent still alive?** Exposures are auto-cleaned when the agent workload stops. Check Activity → Workloads — if the workload is gone, the exposure is gone too.

## OpenZiti Controller unreachable from platform services

Ziti Management's logs show `failed to connect to controller`:

- **`agyn-platform-ziti` Secret missing or wrong.** Verify the controller URL is reachable from inside the cluster.
- **Controller certificate expired.** Rotate by updating the Secret and restarting `ziti-management`.
- **Network policy blocking egress.** Allow Ziti Management to reach the controller.

## Istio mTLS errors

Symptom: services log `mTLS handshake failure` or `peer not authenticated`.

- **Istio injection missing.** `kubectl get namespace agyn --show-labels`. Should include `istio-injection=enabled`.
- **`PeerAuthentication` not in STRICT mode.** Set the mesh-wide PA to `STRICT`.
- **`AuthorizationPolicy` denying the caller.** Each service has policies restricting which ServiceAccounts can call them. Check `kubectl logs <pod>` for the explicit `denied by AuthorizationPolicy` message — gives you the rule name to fix.

## DNS resolution for Ziti hostnames inside agent pods

The Ziti sidecar provides DNS resolution for `.ziti` names. If resolution fails:

- The sidecar is not enrolled (see above).
- The pod's `/etc/resolv.conf` doesn't list the sidecar's DNS first. The runner should configure this — check the pod spec for `dnsConfig`.

## Outbound LLM calls fail with TLS or connection errors

LLM Proxy → upstream provider:

- **Provider's IP changed and your egress allowlist hasn't.** Update the allowlist.
- **Cert chain trust.** If you intercept TLS, install your CA in the LLM Proxy pods (mount as a Secret, point `SSL_CERT_DIR` at it).
- **Region-restricted endpoints.** Some providers (Azure, Bedrock) restrict by region — confirm the endpoint URL matches your provider's region availability.

## "Port already in use" inside an agent pod after `agyn expose`

The agent CLI or another sidecar is already listening on the port. Either:

- Move the service to a different port.
- Stop the conflicting process.

`agyn expose` does not bind the port itself — it just registers an OpenZiti service that routes to whatever is listening on that port in the pod.

## Related

- [Operate → Networking](../operate/networking.md)
- [Use → Port exposure](../use/port-exposure.md)
- [Use → Devices](../use/devices.md)
