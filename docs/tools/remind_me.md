# RemindMe Tool

Behavior
- Supports multiple concurrent reminders for the same thread; each call schedules its own timer and none overwrite others.
- Async-only: returns immediately with `{ status: 'scheduled', etaMs, at }`. The reminder fires later and posts a system message to the caller agent.
- Persistence, cancel-by-id, and durable scheduling are out of scope for now.

Usage
- Tool name: `remindMeTool`
- Input: `{ delayMs: number >= 0, note: string }`
- Effect: schedules a system message `{ kind: 'system', content: note, info: { reason: 'reminded' } }` back to the originating agent/thread.
