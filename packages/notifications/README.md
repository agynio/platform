# Notifications Service

The notifications service exposes the Socket.IO endpoint consumed by the UI and an internal HTTP
publish API used by the platform server. When Redis is enabled it also consumes the
`notifications.v1` Pub/Sub channel and fans events out to connected clients. Socket validation and
room topology remain identical to the previous in-process implementation.

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | TCP port for the HTTP/WebSocket server | `4000` |
| `HOST` | Bind address | `0.0.0.0` |
| `SOCKET_IO_PATH` | Socket.IO path (must remain `/socket.io` for the UI) | `/socket.io` |
| `NOTIFICATIONS_REDIS_ENABLED` | Explicit Redis enable flag (`true`/`false`) | _derived from URL_ |
| `NOTIFICATIONS_REDIS_URL` | Redis connection string (required when Redis is enabled) | _optional_ |
| `NOTIFICATIONS_CHANNEL` | Pub/Sub channel name | `notifications.v1` |
| `LOG_LEVEL` | Pino log level (`fatal`..`trace`) | `info` |

The gateway automatically loads environment variables from a local `.env` file via `dotenv`,
matching the behavior of other platform services.

## Development

```bash
pnpm --filter @agyn/notifications dev
```

The development command runs the service via `tsx` with hot reload. For production builds, run
`pnpm --filter @agyn/notifications build` and execute `node dist/index.js`.
