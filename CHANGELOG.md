Changelog

Unreleased

- Breaking: Rename all OBS_* environment variables to TRACING_* across server, SDK, UI, examples, and docs. See Migration below. Related to issue #352.

Migration

- Server (@agyn/tracing-server):
  - OBS_STALE_TTL_MS -> TRACING_STALE_TTL_MS
  - OBS_SWEEP_INTERVAL_MS -> TRACING_SWEEP_INTERVAL_MS
  - OBS_RECONCILE_ON_START -> TRACING_RECONCILE_ON_START
- SDK (@agyn/tracing):
  - OBS_HEARTBEAT_MS -> TRACING_HEARTBEAT_MS
  - OBS_SDK_DEBUG -> TRACING_SDK_DEBUG
- Platform Server:
  - OBS_ENDPOINT_EXTENDED -> TRACING_SERVER_URL
- Examples:
  - OBS_EXTENDED_ENDPOINT -> TRACING_SERVER_URL
- UI:
  - VITE_OBS_SERVER_URL -> VITE_TRACING_SERVER_URL
  - VITE_OBS_UI_BASE -> VITE_TRACING_UI_BASE

Notes
- No legacy aliases are preserved per the Interface Evolution Policy. Update your deployments and local environments accordingly.
