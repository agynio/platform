---
title: Troubleshooting
description: Check common failures in local and deployed Agyn environments.
order: 1
---

# Troubleshooting

If bootstrap fails, confirm `terraform` and `kubectl` are installed and on `PATH`.

If Kubernetes access fails, inspect `stacks/k8s/.kube/agyn-local-kubeconfig.yaml` and merge kubeconfig again.

If a URL does not load, confirm the `DOMAIN` and `PORT` used during `./apply.sh`.

If platform APIs fail, check the Gateway route and service health.

If an agent does not start, check the agent resource, model name, runner registration, and runner capabilities.

If a tool fails, inspect the MCP image, command, environment, and attached secrets.

If model calls fail, verify the LLM provider endpoint, token, protocol, and model remote name.

If access is denied, inspect organization membership, agent roles, app installation permissions, and OpenFGA tuples.
