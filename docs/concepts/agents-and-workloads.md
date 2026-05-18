---
title: Agents and Workloads
description: Understand agent resources, sidecars, and runner execution.
order: 3
---

# Agents and Workloads

An agent resource defines desired state: model, image, init image, role, availability, resources, and optional configuration.

Sub-resources add runtime behavior: MCPs, skills, hooks, environment variables, init scripts, volumes, and image pull secret attachments.

MCPs and hooks run as sidecars inside the agent pod and share workload context.

The Agents Orchestrator assembles workload inputs from agent configuration and thread state.

Runners advertise labels and capabilities, then execute eligible workloads.

The Kubernetes runner is the current default runner implementation.

Capabilities are open strings, so runners can implement capabilities such as Docker support differently by environment.

For fields, see [Terraform resources](../reference/terraform-resources.md).
