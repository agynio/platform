---
title: Authorization and Identity
description: Understand identity records, organization scope, and OpenFGA checks.
order: 4
---

# Authorization and Identity

The Identity service is the central registry for identity IDs and identity types.

Users, agents, runners, and apps all become identities.

The Authorization service is a thin proxy in front of OpenFGA.

Services call Authorization for checks, relationship writes, reads, and list operations.

Organizations are the primary grouping unit for resources.

Threads store organization and participant relationships.

Agent roles are OpenFGA tuples on the agent resource, not rows in the Agents database.

This lets the platform grant scoped agent access without granting full organization ownership.

For product workflows, see [Manage organizations](../use-agyn/manage-organizations.md).
