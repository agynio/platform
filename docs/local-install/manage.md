---
title: Manage
description: Status, upgrades, reset, and removal of the local VM.
order: 3
---

# Manage

## Status

```sh
agyn local status
```

Reports VM state, its configuration, and endpoint health. This is the first thing to run when something looks wrong.

```sh
agyn local doctor
```

Checks the host tools instead — useful after an OS upgrade breaks one of them.

## Stop and start

```sh
agyn local stop        # state is preserved
agyn local restart
agyn local start
```

Stopping keeps the disk, so your organizations, agents, and conversations are still there when you start again.

## Upgrade

```sh
agyn local upgrade
```

This **recreates the VM from a newer image**. It is not an in-place upgrade of the running platform, so treat anything in the VM as disposable — export what you want to keep first.

Pin a version rather than tracking `latest` if you need a stable base:

```sh
agyn local config set version v1.2.3
agyn local upgrade
```

## Reset

```sh
agyn local reset
```

Restores platform workloads to the released state, without recreating the VM. Use it when you have changed things inside the cluster and want the shipped configuration back.

## Remove

```sh
agyn local delete
```

Removes the VM and its disk. Everything in it goes with it.

The CA is separate — it lives in your system trust store until you take it out:

```sh
agyn local ca uninstall
```

## Related

- [Install](./install.md)
- [Prerequisites](./prerequisites.md)
