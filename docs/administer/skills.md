---
title: Skills
description: Reusable prompt fragments placed on the agent's filesystem at startup.
order: 8
---

# Skills

A skill is a named text fragment — typically a prompt snippet or a domain guide — that gets placed on the agent's filesystem when `agynd` boots the agent CLI. Skills give you a way to share consistent context across agents without baking it into the agent image.

## Where skills live in the pod

`agynd` writes each skill to a file under `/skills/<name>.md` before starting the agent CLI. The agent CLI is configured to read these files at startup, and many agent CLIs include their content in the system prompt or surface them to the model as references.

## Add a skill

### In the Console

1. Console → **Agents → <agent>** → **Skills** tab.
2. Click **New skill**.
3. Set:
   - **Name** — used as the filename.
   - **Body** — the skill content. Markdown is preserved as-is.
4. Save.

![Agent Skills tab](../_assets/console/agents/skills.png)

### With Terraform

```hcl
resource "agyn_agent_skill" "tone_guide" {
  agent_id = agyn_agent.support.id
  name     = "tone-guide"

  body = <<-EOT
    # Tone

    - Be concise.
    - Match the customer's tone — formal if they are, friendly if they are.
    - Never apologize unnecessarily.
  EOT
}
```

## When to use skills versus other tools

- **Skill** — text that the agent should reliably see in every run. Tone guides, domain glossaries, policy reminders.
- **Init script** — actions that must happen before the agent starts (clone a repo, fetch data, set up the workspace). See [Init scripts](./init-scripts.md).
- **MCP server** — capabilities the agent calls during a run. See [MCP servers](./mcp-servers.md).
- **Hook** — code that responds to platform events outside the agent's main loop. See [Hooks](./hooks.md).

## Edit and delete

Same pattern as other agent sub-resources — edit on the same tab, or update/destroy the Terraform resource.

## Related

- [Agents](./agents.md)
- [Init scripts](./init-scripts.md)
- [Hooks](./hooks.md)
