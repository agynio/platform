# Notifications Gateway

The notifications gateway exposes the Socket.IO endpoint consumed by the UI. It subscribes to the
`notifications.v1` Redis Pub/Sub channel and forwards validated events to the appropriate rooms. The
gateway keeps the legacy room model and subscribe validation identical to the previous in-process
Socket.IO server.

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | TCP port for the HTTP/WebSocket server | `3011` |
| `HOST` | Bind address | `0.0.0.0` |
| `SOCKET_IO_PATH` | Socket.IO path (must remain `/socket.io` for the UI) | `/socket.io` |
| `REDIS_URL` | Redis connection string (e.g. `redis://redis:6379/0`) | _required_ |
| `NOTIFICATIONS_CHANNEL` | Pub/Sub channel name | `notifications.v1` |
| `LOG_LEVEL` | Pino log level (`fatal`..`trace`) | `info` |

## Development

```bash
pnpm --filter @agyn/notifications-gateway dev
```

The development command runs the gateway via `tsx` with hot reload. For production builds, run
`pnpm --filter @agyn/notifications-gateway build` and execute `node dist/index.js`.
