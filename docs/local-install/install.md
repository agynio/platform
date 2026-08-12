---
title: Install
description: Starting the local platform VM and signing in.
order: 2
---

# Install

## Start

```sh
agyn local start
```

The first run downloads the platform image, so expect it to take a few minutes; later starts boot from the image already on disk. When it finishes you have a running platform, a profile pointing at it, and a CLI authenticated against it — `agyn local start` gives the Gateway a bootstrap token generated for this install and records the endpoint, organization, and CA as a profile.

Useful flags:

| Flag | Effect |
|---|---|
| `--version` | Pin the image version instead of `latest` |
| `--port` | Ingress host port (default `2496`) |
| `--cpus`, `--memory` | Override the VM size for this start |
| `--install-ca` | Also install the CA into the system trust store (asks for sudo) |
| `--no-ca` | Skip certificate handling entirely |
| `--download-only` | Fetch and verify the image without booting |

## Trust the CA

The VM issues its own certificates, so browsers reject them until its CA is trusted:

```sh
agyn local ca install     # asks for sudo
```

Inspect or remove it at any time:

```sh
agyn local ca show
agyn local ca export ca.pem      # or - for stdout
agyn local ca uninstall
```

If you would rather not touch the system trust store, start with `--no-ca` and accept the browser warning instead.

## Sign in

Open `https://console.agyn.dev:2496/` (or your configured port) and sign in.

Cluster admin is declared, not claimed — see [Production installation → Cluster administrators](../production-install/first-admin.md). On a local VM the bundled account is already declared, so it holds the role from the first sign-in.

## Configure

Settings persist and apply on the next start:

```sh
agyn local config list
agyn local config get port
agyn local config set port 8443
agyn local config set cpus 6
agyn local config set memory 12GiB
agyn local config set version v1.2.3
```

## Use it from other tools

```sh
agyn local credentials    # configure a CLI profile from the running VM
agyn local kubeconfig     # add the VM's cluster to your kubeconfig
```

`kubeconfig` is what you want when inspecting the platform with `kubectl` — the VM runs a full Kubernetes cluster inside.

## Verify

1. `agyn local status` reports the VM running and its endpoints healthy.
2. The Console loads and you can sign in.
3. Send a message in a conversation — the agent should start, reply, and idle out.

## Related

- [Prerequisites](./prerequisites.md)
- [Manage](./manage.md)
- [Build & extend → Agyn CLI](../build-extend/agyn-cli.md)
