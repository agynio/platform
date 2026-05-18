---
title: Port exposure
description: Access services running inside an agent container from your browser.
order: 9
---

# Port exposure

Sometimes an agent runs a service inside its container — a web app it built, a notebook, a preview server — that you want to open in your browser. Port exposure makes that possible without opening any public ports.

The mechanism is simple:

1. You enroll your device into the platform's private network (one time).
2. The agent runs `agyn expose add <port>` inside its container.
3. The platform returns a `http://exposed-<id>.ziti:<port>` URL.
4. You open that URL in a browser running on your enrolled device. The Ziti tunnel routes the request to the agent container.
5. When you're done, the agent runs `agyn expose remove <port>` — or the workload stops, and the exposure is cleaned up automatically.

## Why it works this way

The exposed URL is reachable only over OpenZiti, the platform's private overlay network. Without an enrolled device, the hostname does not resolve and the connection cannot be made. This means:

- No public DNS or load balancer is involved.
- The agent does not need to be on the internet.
- You can preview a service running anywhere — even in an air-gapped cluster — as long as you have an enrolled device.

There is no HTTPS/TLS termination on the exposed URL — exposed services are plain HTTP. The transport between your device and the agent container is encrypted by Ziti's mTLS, end to end.

## What you need

1. **An enrolled device.** See [Devices](./devices.md) to add one.
2. **A Ziti tunnel client** on the device — [Ziti Desktop Edge](https://openziti.io/docs/reference/tunnelers/) on macOS / Windows / Linux, or `ziti-edge-tunnel` on a server. The tunnel client makes `.ziti` hostnames resolvable.

## Use a port exposure URL

1. Make sure the Ziti tunnel client is running and signed in with your enrolled identity.
2. The agent (or you, if you have shell access) runs:
   ```sh
   agyn expose add 3000
   ```
   The platform responds with a URL like `http://exposed-abc123.ziti:3000`.
3. Open the URL in your browser.

The first time, the browser may take a moment as the Ziti tunnel sets up the connection. Subsequent requests are fast.

## Stopping an exposure

The agent removes the exposure with:

```sh
agyn expose remove 3000
```

This deletes the OpenZiti service and the URL stops resolving. Exposures are also auto-cleaned when:

- The agent workload stops (idle timeout, resolved conversation, manual stop).
- The agent is deleted.

You do not need to remove exposures manually — they are best-effort cleaned up.

## Multiple exposures

An agent can expose many ports at once — each gets its own URL. The agent picks which port maps to what.

## Listing exposures

The agent can list its current exposures:

```sh
agyn expose list
```

## Security

- The URL is unguessable (random ID) but is not itself an authentication credential — anyone on the platform's Ziti network can reach it. Treat exposed services as authenticated by your private network membership, not by the URL.
- The service inside the container should still implement its own auth where appropriate (e.g. a notebook should require a token).
- The exposure is HTTP only — do not put real credentials over it.

## Related

- [Devices](./devices.md) — add and manage enrolled devices.
- [Administer → Monitoring → Workloads](../administer/monitoring.md#workloads) — see what's running.
