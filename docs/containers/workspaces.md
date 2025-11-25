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
  - Non-interactive execs support a `logToPid1` flag that mirrors stdout/stderr to `/proc/1/fd/{1,2}` so container logging drivers capture docker exec output. The wrapper is bash-only (`/bin/bash -lc 'set -o pipefail; { <CMD> ; } 2> >(tee -a /proc/1/fd/2 >&2) | tee -a /proc/1/fd/1'`) and requires bash to be present in the image; if bash is missing the exec will fail.
- TTL, cleanup, and backoff
  - Containers record `last_used_at` and `kill_after_at` (derived from TTL). A background cleanup job removes expired containers.
  - Termination errors are retried with exponential backoff up to a max delay of 15 minutes; benign 304/404/409 errors on stop/remove are swallowed.

Thread closure cascade cleanup
- Closing a thread (or any ancestor) triggers the thread cleanup coordinator.
  - Descendant threads are closed leaf-first so children finish before their parents.
  - Active runs receive a terminate signal; after a short grace period the cleanup flow forces container shutdown.
  - Registry records for the thread are handed to `sweepSelective`, which removes associated workspace containers and DinD sidecars immediately.
  - DinD sidecars are stopped first and removed with `v=true` so their anonymous `/var/lib/docker` volumes are deleted along with the sidecar.
  - After containers are gone, the coordinator removes the thread workspace volume (`ha_ws_<threadId>`) once no other containers (running or stopped) reference it and no registry entries point at the volume.

DinD and DOCKER_HOST
- Optional sidecar Docker-in-Docker may be used for nested workloads. When enabled, set `DOCKER_HOST=tcp://localhost:2375` inside the workspace container.

Registry mirror on agents_net
- An optional HTTP-only Docker registry mirror can be deployed on the `agents_net` network to speed up pulls. Configure `DOCKER_MIRROR_URL` (e.g., `http://registry-mirror:5000`). This mirror is internal-only and not exposed publicly.

Cross-links
- Environment overlays and security: docs/config/env-overlays.md, docs/security/vault.md
- Graph status streaming: docs/graph/status-updates.md

Related behavior
- Container lifecycle, registry, and cleanup services manage provisioning, reuse, and TTL/backoff policies.

Terminal WebSocket
- Endpoint: `GET /api/containers/:containerId/terminal/ws` upgraded to a WebSocket. Requires `sessionId` and `token` query params issued by the terminal sessions service.
- Message flow:
  - Initial status frames (`{ type: 'status', phase: 'starting' | 'running' }`) indicate session bootstrap and exec readiness.
  - Shell output is streamed as `{ type: 'output', data }` frames; client keystrokes are relayed via `{ type: 'input', data }`.
  - Terminal shutdown emits `{ type: 'status', phase: 'exited', exitCode }` or `{ type: 'status', phase: 'error', reason }` prior to socket close.
- Close semantics:
  - The gateway closes with code `1000` for normal termination (e.g., client request or exec exit) and `1008` when the request is invalid or the session cannot be validated (`container_id_required`, `invalid_query`, `container_mismatch`, etc.).
  - Before issuing close frames the server always sends the corresponding `error` or `status` payload so clients can surface user-facing feedback.
  - Socket shutdown attempts `ws.close(code, reason)` first, then falls back to `ws.terminate()` and finally invokes `ws.end()` to guarantee transport teardown even when Fastify exposes only a `SocketStream` façade.
