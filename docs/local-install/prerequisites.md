---
title: Prerequisites
description: What the local platform VM needs from your machine.
order: 1
---

# Prerequisites

## Tools

`agyn local` runs the platform in a [Lima](https://lima-vm.io/) VM and needs three host tools:

| Tool | Install |
|---|---|
| `limactl` | `brew install lima` |
| `xz` | `brew install xz` |
| `qemu` | `brew install qemu` |

Check them at any time — this reports what is missing and how to install it:

```sh
agyn local doctor
```

## Operating system

macOS and Linux. Windows is not supported; use WSL2.

## Resources

The VM defaults to **4 CPUs and 8 GiB of memory**, and needs room for the image and the platform's data on top. Give it a machine with headroom — a cramped VM is the most common cause of a partial bring-up.

Both are configurable before the first start:

```sh
agyn local config set cpus 6
agyn local config set memory 12GiB
```

## Ports

One host port is published, **2496** by default, serving every platform hostname over HTTPS. Change it if it clashes:

```sh
agyn local config set port 8443
```

## DNS

`agyn.dev` and its subdomains resolve to `127.0.0.1` publicly, so nothing is written to your hosts file and no DNS setup is required.

## TLS

The VM generates its own CA and issues certificates for the platform hostnames. Browsers reject them until that CA is trusted — see [Install → Trust the CA](./install.md#trust-the-ca). Nothing else on your machine is affected, and the CA can be removed again at any time.

## Related

- [Install](./install.md)
- [Manage](./manage.md)
