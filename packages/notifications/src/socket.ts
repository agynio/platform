import { createServer, type Server as HttpServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { Server as SocketIOServer, type ServerOptions, type Socket } from 'socket.io';
import type { Logger } from 'pino';
import { SubscribePayloadSchema } from './validation';
import type { PublishedNotification } from './types';

type SocketBridgeOptions = {
  host: string;
  port: number;
  path: string;
  corsOrigins: string[];
  logger: Logger;
};

export class SocketBridge {
  private readonly httpServer: HttpServer;
  private readonly io: SocketIOServer;
  private readonly logger: Logger;

  constructor(private readonly options: SocketBridgeOptions) {
    this.logger = options.logger.child({ scope: 'socket' });
    this.httpServer = createServer();
    const serverOptions: Partial<ServerOptions> = {
      path: options.path,
      transports: ['websocket'],
      cors: {
        origin: options.corsOrigins.length > 0 ? options.corsOrigins : '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: false,
      },
      allowRequest: (_req, callback) => {
        callback(null, true);
      },
    } satisfies Partial<ServerOptions>;
    this.io = new SocketIOServer(this.httpServer, serverOptions);
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  async start(): Promise<void> {
    const { host, port } = this.options;
    await new Promise<void>((resolve) => {
      this.httpServer.listen(port, host, () => resolve());
    });
    this.logger.info({ host, port, path: this.options.path }, 'socket server listening');
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.io.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  broadcast(notification: PublishedNotification): void {
    for (const room of notification.rooms) {
      try {
        this.io.to(room).emit(notification.event, notification.payload ?? {});
      } catch (error) {
        this.logger.warn(
          {
            room,
            event: notification.event,
            error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
          },
          'socket emit failure',
        );
      }
    }
  }

  private handleConnection(socket: Socket): void {
    this.logger.info(
      {
        id: socket.id,
        headers: this.sanitizeHeaders(socket.request.headers),
        query: this.sanitizeQuery(socket.handshake.query as Record<string, unknown> | undefined),
      },
      'client connected',
    );

    socket.on('subscribe', (payload: unknown, ack?: (response: unknown) => void) => {
      const parsed = SubscribePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        }));
        this.logger.warn({ socketId: socket.id, issues }, 'subscribe rejected');
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'invalid_payload', issues });
        }
        return;
      }

      const rooms = parsed.data.rooms ?? (parsed.data.room ? [parsed.data.room] : []);
      for (const room of rooms) {
        if (room.length > 0) socket.join(room);
      }
      if (typeof ack === 'function') {
        ack({ ok: true, rooms });
      }
    });

    socket.on('error', (error) => {
      this.logger.warn(
        {
          socketId: socket.id,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
        },
        'socket error',
      );
    });

    socket.on('disconnect', (reason) => {
      this.logger.debug({ socketId: socket.id, reason }, 'client disconnected');
    });
  }

  private sanitizeHeaders(headers: IncomingHttpHeaders | undefined): Record<string, unknown> {
    if (!headers) return {};
    const sensitive = new Set(['authorization', 'cookie', 'set-cookie']);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key) continue;
      sanitized[key] = sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  private sanitizeQuery(query: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!query) return {};
    const sensitive = new Set(['token', 'authorization', 'auth', 'api_key', 'access_token']);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
      sanitized[key] = key && sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value;
    }
    return sanitized;
  }
}
