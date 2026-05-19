---
title: Devices
description: Enroll devices to access port-exposed services.
order: 10
---

# Devices

A device is a personal endpoint — a laptop, a workstation, a CI runner — enrolled into the platform's OpenZiti overlay network. Enrolled devices can reach services exposed by agent containers (see [Port exposure](./port-exposure.md)).

You enroll devices once. After that, running the Ziti tunnel client on the device gives you access to any `.ziti` URL the platform issues.

## Add a device

### In the Console

1. Click your avatar (top-right) → **Devices** (`/devices`).
2. Click **Add device**.
3. Enter a device name (e.g. `mac-laptop`, `gh-actions-runner`).
4. Save. The Console returns a one-time enrollment **JWT**. Copy it now — it cannot be retrieved later.


The device shows as **Pending** until you enroll it. After enrollment, it flips to **Enrolled**.

## Enroll on the device

Install a Ziti tunnel client and use the JWT:

### macOS / Windows / Linux desktop

1. Install [Ziti Desktop Edge](https://openziti.io/docs/reference/tunnelers/).
2. Open it and click **Add Identity** → paste the JWT or import the JWT file.
3. The identity enrolls. The Console flips the device to `enrolled`.

### Server / headless

```sh
sudo ziti-edge-tunnel enroll --jwt /path/to/device.jwt --identity /var/lib/ziti/me.json
sudo systemctl start ziti-edge-tunnel
```

After this, `.ziti` hostnames resolve on the device.

## Verify

With the tunnel running, try resolving a known service:

```sh
dig +short gateway.ziti
```

A non-empty response means enrollment worked. Without the tunnel running, the hostname will not resolve.

## Manage devices

The Devices page lists every device you have enrolled:

- **Status** — `pending` (JWT generated, not enrolled) or `enrolled`.
- **Created** — when the JWT was generated.

You can **revoke** a device — removes its OpenZiti identity. The device loses access to `.ziti` services immediately. Useful for laptops you no longer use or for lost machines.

## Lost the JWT?

The JWT is shown exactly once at creation. If you lose it:

1. Delete the device entry.
2. Add a new device. Use the new JWT.

There is no way to regenerate a JWT for an existing device.

## How many devices

There is no hard limit on devices per user. Each one is its own OpenZiti identity, so revoking one does not affect the others.

## Related

- [Port exposure](./port-exposure.md) — the main use case for devices.
- [Operate → Networking](../operate/networking.md) — what OpenZiti is and how it fits into the platform.
