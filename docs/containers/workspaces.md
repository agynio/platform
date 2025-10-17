# Workspace Containers

Overview
- Workspace containers are provisioned via the container provider and reused across runs by labels and thread association.
- Labels:
  - `hautech.ai/role=workspace`
  - `hautech.ai/thread_id=<id>`
  - Optional `hautech.ai/platform=linux/amd64|linux/arm64` when platform-aware pulls are used.
- Network: `agents_net` for intra-stack communication (e.g., registry mirror, vault).

Lifecycle
- Provision
  - If a matching container exists (by thread_id and optional platform), reuse.
  - Otherwise, create a new container; if `initialScript` is set, run it immediately after first start via `/bin/sh -lc`. Non-zero exit code fails provisioning.
- Labels and platform-aware pulls
  - When `platform` is set in static config, image pulls and container creation use the requested platform. Non-native platforms may be slower and depend on engine emulation.
- Exec behavior
  - Each exec can set per-call env/workdir and timeouts. See docs/config/env-overlays.md.
- TTL, cleanup, and backoff
  - Containers record `last_used_at` and `kill_after_at` (derived from TTL). A background cleanup job removes expired containers.
  - Termination errors are retried with exponential backoff up to a max delay of 15 minutes; benign 304/404/409 errors on stop/remove are swallowed.

DinD and DOCKER_HOST
- Optional sidecar Docker-in-Docker may be used for nested workloads. When enabled, set `DOCKER_HOST=tcp://localhost:2375` inside the workspace container.

Registry mirror on agents_net
- An optional HTTP-only Docker registry mirror can be deployed on the `agents_net` network to speed up pulls. Configure `DOCKER_MIRROR_URL` (e.g., `http://registry-mirror:5000`). This mirror is internal-only and not exposed publicly.

Cross-links
- Environment overlays and security: docs/config/env-overlays.md, docs/security/vault.md
- Graph status streaming: docs/graph/status-updates.md

Related code
- apps/server/src/entities/container.entity.ts, containerProvider.entity.ts
- apps/server/src/services/container.service.ts, containerRegistry.service.ts, containerCleanup.service.ts

