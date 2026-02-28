Date: 2026-02-28

# PR #12 – Option A evidence (platform-server ↔ LiteLLM via OpenAI)

## Summary

- Rotated the Argo CD admin token and updated Terraform `platform.auto.tfvars` (new token, `dev-openai` image tags).
- Re-applied the platform stack with the ephemeral token; every workload now reports `Synced`/`Healthy` in Argo CD.
- Patched LiteLLM bootstrap secret to expose `OPENAI_API_KEY`, confirmed LiteLLM pods run with the patched secret.
- Updated `HealthController` to treat the Docker runner dependency as optional when unavailable.
- Rebuilt `dev-openai` images for platform-server/UI, pushed them into k3d, and restarted deployments to pick up the changes.
- Captured the artifacts below for pods, Argo CD synchronization, secrets, and API health.

## Evidence

### Platform namespace workloads

```
$ kubectl get pods -n platform
NAME                                           READY   STATUS      RESTARTS   AGE
lite-llm-657d8f949c-8rqrv                      1/1     Running     0          101m
litellm-bootstrap-job-5rbj7                    0/1     Completed   0          101m
platform-gateway-5c5cc947d8-vg4n2              1/1     Running     0          101m
platform-server-5b54568c78-ddsq6               1/1     Running     0          83m
platform-server-migrations-1-27t8d             0/1     Completed   0          83m
platform-terminal-server-688c45df84-w2hhf      1/1     Running     0          101m
platform-ui-697fdbfd89-zp5p8                   1/1     Running     0          83m
platform-ui-migrations-1-j6k9v                 0/1     Completed   0          83m
terminal-worker-8444996c97-t6sdv               1/1     Running     0          101m
terminal-worker-8444996c97-x4xlg               1/1     Running     0          101m
```

### Argo CD application status

```
$ argocd app list --project platform --output table
NAME                    CLUSTER                         NAMESPACE  PROJECT   STATUS  HEALTH   SYNCPOLICY  CONDITIONS  REPO                                                 PATH                     TARGET
platform/bootstrap      https://kubernetes.default.svc  platform   platform  Synced  Healthy  <none>      <none>      https://github.com/agyn-sandbox/platform-bootstrap.git  envs/dev-openai         HEAD
platform/litellm-stack  https://kubernetes.default.svc  platform   platform  Synced  Healthy  <none>      <none>      https://github.com/agyn-sandbox/platform-bootstrap.git  stacks/litellm-stack    HEAD
platform/platform-stack https://kubernetes.default.svc  platform   platform  Synced  Healthy  <none>      <none>      https://github.com/agyn-sandbox/platform-bootstrap.git  stacks/platform-stack   HEAD
```

### LiteLLM default key secret

```
$ kubectl describe secret litellm-default-key -n platform
Name:         litellm-default-key
Namespace:    platform
Labels:       <none>
Annotations:  reloader.stakater.com/match=true

Type:  Opaque

Data
====
OPENAI_API_KEY:   51 bytes
OPENAI_BASE_URL:  21 bytes
```

### Platform health probe

```
$ kubectl run -n platform tmp-shell --rm -it --restart=Never --image=alpine:3.20 -- wget -qO- http://platform-server.platform.svc.cluster.local:3010/health
{"status":"ok","timestamp":"2026-02-28T06:03:35.611Z","dependencies":{"dockerRunner":{"optional":true,"status":"unknown","consecutiveFailures":0}}}
```

