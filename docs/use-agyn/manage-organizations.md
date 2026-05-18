---
title: Manage Organizations
description: Understand organization scope, membership, and access control.
order: 2
---

# Manage Organizations

Organizations group Agyn resources and provide the primary access boundary.

Agents, models, LLM providers, secrets, runners, threads, and apps are scoped to an organization.

Authorization is relationship-based and evaluated through OpenFGA.

Organization owners can manage membership and have broad administrative access inside the organization.

Agent roles provide additional per-agent delegation without granting full organization ownership.

Apps can receive installation permissions such as thread creation or participant management.

The Authorization service is the only service that talks directly to OpenFGA.

For the underlying model, read [Authorization and identity](../concepts/authorization-and-identity.md).
