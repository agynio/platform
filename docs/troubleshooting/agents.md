---
title: Agents won't start
description: Workload fails, init container errors, image pull issues.
order: 4
---

# Agents won't start

When a user sends a message and the agent never responds, the workload either didn't start or started and failed. Open Console → **Activity → Workloads** for the conversation's organization. The most recent workload's `status` tells you which path you're on.

## `status = failed, reason = start_failed`

The orchestrator couldn't start the workload at all.

Check:

- **No eligible runner.** The agent has `runner_labels` or `capabilities` that no enrolled runner satisfies. Console → Runners. Verify there is an enrolled runner with matching labels/capabilities.
- **Runner unreachable.** The orchestrator timed out dialing the runner. Check the runner's status — it might say `enrolled` but actually be offline (the controller hasn't noticed yet). Restart the runner.
- **Quota exceeded on the runner's cluster.** The runner couldn't create the pod. Look at the workload detail page — the failure message often includes the Kubernetes error.

## `status = failed, reason = image_pull_failed`

Runner couldn't pull one of the workload's images.

- **Init image, runtime image, or an MCP image is wrong or missing.** Check the agent's config in Console → Agents → <agent> → Configuration. Confirm each image tag exists.
- **Private registry — no image pull secret.** Configure an [image pull secret](../administer/image-pull-secrets.md) and attach it to the agent / MCP / hook.
- **Image pull secret wrong.** Test by pulling the image manually with the same credentials.

## `status = failed, reason = config_invalid`

`agynd` rejected the configuration during startup.

The workload detail page shows `agynd`'s stderr. Common issues:

- **Init script failed.** A `git clone` couldn't authenticate, a dependency install failed. Fix the script or make the failing command non-fatal (`|| true`).
- **Missing env var.** An init script or MCP referenced a variable that wasn't set. Check ENVs for the agent and its MCPs.
- **Skills file system permissions.** Rare — usually means the runtime image runs as a non-standard user.

## `status = failed, reason = crashloop`

The main container repeatedly crashed.

- **Agent CLI crashes on startup.** Open the workload's logs — the runtime container's logs include `agynd` and the CLI output. Look for stack traces or panics.
- **LLM endpoint unreachable.** `agynd` exports the LLM endpoint as `OPENAI_API_BASE`. If the agent CLI can't reach it, it might exit cleanly with an error. Confirm LLM Proxy is up and reachable.
- **MCP server fails to start.** An MCP sidecar that's required by the CLI might be crashing, causing the CLI to error. Check each MCP container's logs.

## `status = failed, reason = runtime_lost`

The runner stopped reporting on the workload for longer than the grace period. Usually means the runner pod was restarted or the runner cluster is down.

- Check the runner's pod status.
- If the runner restarted, the workload may have been killed. Trigger a new workload by sending another message.

## Workload is `starting` for a long time

Most agent workloads reach `running` within 30-60 seconds. Longer than that usually means:

- **Image pulls are slow.** First-time pulls can take several minutes on slow networks. Subsequent pulls are cached.
- **Init scripts are slow.** A `git clone` of a large repo, an `npm install`, etc. Inspect the workload's init script logs.

The orchestrator's `START_GRACE_S` (default 60s) determines how long it waits before classifying as `start_failed`. Configurable per agent if your agents have legitimately slow startup.

## Workload is `running` but the agent doesn't respond

The pod is up, but the agent CLI isn't producing output.

- **Open the Run Timeline.** The most recent run should show an LLM call. If it's stuck, the LLM call is hanging or the CLI hasn't issued one.
- **Inspect the runtime container's logs.** `agynd`'s logs show whether the CLI was spawned.
- **Check LLM Proxy logs** for upstream errors that didn't propagate back.

## Multiple workloads for the same conversation

Sometimes you see two workloads for one thread. Reasons:

- **The orchestrator restarted mid-reconciliation.** It may have started a second workload before noticing the first. Both should be cleaned up automatically when the agent is idle.
- **The agent has multiple instances (rare).** Confirm by checking the Agents service — typically each agent ID has one workload at a time.

If multiple workloads stay running, stop the older one from Activity → Workloads.

## "I changed the agent's config and it's still using the old one"

Workloads use the configuration that was current at workload start. Configuration changes take effect on the **next** workload start. To force a refresh:

- Stop the current workload (Activity → Workloads → Stop).
- The orchestrator starts a new workload on the next message, with the new config.

## Related

- [Administer → Agents](../administer/agents.md)
- [Administer → Monitoring](../administer/monitoring.md)
- [Operate → Runners](../operate/runners.md)
- [Use → Run Timeline](../use/run-timeline.md)
