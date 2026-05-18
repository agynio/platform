---
title: Troubleshooting
description: Diagnose common Agyn deployment and runtime issues.
order: 1
---

# Troubleshooting

Work from infrastructure toward the agent.

## Install checks

1. For bootstrap, confirm `terraform` and `kubectl` are installed.
2. Confirm kubeconfig was merged from `stacks/k8s/.kube/agyn-local-kubeconfig.yaml`.
3. Confirm the expected domain and port match your `DOMAIN` and `PORT` values.
4. For Helm, confirm Istio, OpenZiti, OpenFGA, OIDC, DBs, S3, and Secrets exist first.
5. Render charts with `helm template` before applying production values.

## Runtime checks

1. Confirm the organization, model provider, model, and agent exist.
2. Confirm a runner is registered and advertises required capabilities.
3. Confirm agent image and init image can be pulled.
4. Check traces for LLM or tool errors.
5. Check MCP command, environment, volumes, and secrets.
6. Check OpenFGA relationships when access is denied.

## Expected outcome

The failing layer should be clear enough to decide whether to adjust infrastructure, Helm values, platform configuration, or agent/tool setup.
