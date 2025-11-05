# RemindMe Tool

Behavior
- Supports multiple concurrent reminders for the same thread; each call schedules its own timer and none overwrite others.
- Async-only: returns immediately with `{ status: 'scheduled', etaMs, at }`. The reminder fires later and posts a system message to the caller agent.
- Persistence, cancel-by-id, and durable scheduling are out of scope for now.

New in vNext
- In-memory registry of scheduled reminders per RemindMe node instance.
- Server endpoint: `GET /api/graph/nodes/:nodeId/reminders` returns `{ items: [{ id, threadId, note, at }] }` for active (pending) reminders.
- Socket event: `node_reminder_count` broadcast with payload `{ nodeId, count, updatedAt }` whenever the registry size changes.
- UI shows:
  - Numeric badge on the Remind Me node with active reminder count, updated via socket events (no polling).
  - An “Active Reminders” section in the Activity sidebar listing note, scheduled time, and threadId. One-shot fetch on open; may refresh on reconnect.

Usage
- Tool name: `remindMeTool`
- Input: `{ delayMs: number >= 0, note: string }`
- Effect: schedules a system message `{ kind: 'system', content: note, info: { reason: 'reminded' } }` back to the originating agent/thread.

Notes
- In-memory timers drive delivery; persistence to Postgres records scheduled reminders.
- Persisted Reminder fields: `id` (UUID, DB PK), `threadId`, `note`, `at`, `createdAt`, `completedAt?`.
- When a reminder fires, the DB row is updated with `completedAt` (completion is required) instead of being deleted.
- The reminder id is the DB UUID; the active reminders registry aligns with the persisted entity shape.
- On node disposal, all timers are cleared and registry is emptied.
- Soft cap: a maximum of 1000 active reminders per RemindMe node is enforced. When exceeded, the tool call errors with message "Too many active reminders (max 1000)." and no timer is scheduled.
- Error shapes for reminders endpoint:
  - 404 `{ error: 'node_not_found' }` when node does not exist.
  - 404 `{ error: 'not_remindme_node' }` when the node exists but is not a RemindMe tool.

Migrations
- Ensure `AGENTS_DATABASE_URL` is set to a Postgres connection string.
- Run: `pnpm -w --filter @agyn/platform-server prisma:migrate`
