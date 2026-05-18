---
title: Port Exposure
description: Access development servers running inside agent workloads.
order: 5
---

# Port Exposure

Port exposure lets a user reach a service started by an agent, such as a development server on port `3000`.

The feature uses OpenZiti, so the user's device must be enrolled in the platform network.

## Steps

1. In the Console, add a device from the user menu.
2. Save the one-time enrollment JWT and enroll it with a Ziti tunnel client.
3. Ask the agent to start a service in its workload.
4. The agent exposes a port with a command such as `agyn expose add 3000`.
5. Open the returned link, shaped like `http://exposed-<id>.ziti:3000`.
6. Remove the exposure with `agyn expose remove 3000` or let workload cleanup remove it.

## Expected outcome

Traffic from the user's enrolled device is routed over OpenZiti to the agent pod, where the sidecar forwards to `localhost:<port>`.
