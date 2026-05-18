---
title: Init scripts
description: Shell scripts run before the agent CLI starts.
order: 11
---

# Init scripts

An init script is a shell snippet that runs during workload startup, after the container is up and before the agent CLI launches. Use init scripts to clone repositories, fetch data, install workspace dependencies, or set up files the agent will need.

## Where init scripts run

`agynd` executes each init script in the runtime container, in order, before launching the agent CLI. The working directory is `WORKSPACE_DIR` if set (typically `/workspace`), otherwise `/tmp`. The container has the standard Linux toolchain available from the runtime image.

Init scripts run with the runtime container's user and have access to all ENVs (plain and secret-backed) configured for the resource.

## Add an init script

### In the Console

1. Open the resource's **Init scripts** tab (agent, MCP, or hook).
2. Click **Add init script**.
3. Set:
   - **Name** — used in logs.
   - **Body** — shell script body. The first line should be a shebang (`#!/bin/sh` or `#!/bin/bash`).
4. Set **Order** if you have multiple scripts — lower numbers run first.
5. Save.

![Agent Init Scripts tab](../_assets/console/agents/init-scripts.png)

### With Terraform

```hcl
resource "agyn_agent_init_script" "clone_repo" {
  agent_id = agyn_agent.support.id

  name  = "clone-knowledge-base"
  order = 10

  body = <<-EOT
    #!/bin/sh
    set -e
    git clone --depth 1 https://github.com/acme/knowledge-base.git "$WORKSPACE_DIR/kb"
  EOT
}
```

## What ENVs are available

All ENVs configured on the resource are available to init scripts as standard environment variables. This includes secret-backed ENVs — useful for git or registry credentials. Use them like:

```sh
echo "$GH_TOKEN" | gh auth login --with-token
```

## Failure handling

If an init script exits non-zero, `agynd` aborts the workload startup. The workload transitions to `failed` with `failure_reason = config_invalid`, and you see the script's stderr in [Activity → Workloads → detail](./monitoring.md).

To make a script's failure non-fatal, end it with `exit 0` or guard the failing command with `|| true`.

## Common patterns

- **Clone a repo for the agent to work on.**
- **Install language toolchains or packages** specific to a task that the runtime image doesn't carry.
- **Pre-populate a volume** mounted on the agent — fetched once at startup, then reused while the volume lives.
- **Configure credentials** for tools the agent will use (`gh auth login`, `aws configure`, etc.).

## Init scripts vs. init image

The **init image** is the container that copies `agynd` and the agent CLI into the shared volume at pod start. You almost never customize this.

**Init scripts** run *inside* the runtime container after that copy, before the agent CLI launches. This is the place to extend startup behavior — it does not require building a new image.

## Related

- [Agents](./agents.md)
- [Skills](./skills.md)
- [Environment variables](./environment-variables.md)
