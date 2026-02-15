import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifySchema } from 'fastify';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import type { ContainerCreateOptions, GetEventsOptions } from 'dockerode';
import type { RawData } from 'ws';
import {
  ContainerService,
  NonceCache,
  SUPPORTED_PLATFORMS,
  verifyAuthHeaders,
  type ContainerOpts,
  type ExecOptions,
} from '..';
import { createDockerEventsParser } from './dockerEvents.parser';
import type { RunnerConfig } from './config';
import { closeWebsocket, getWebsocket, type SocketStream } from './websocket.util';

const ensureImageSchema = z.object({
  image: z.string().min(1),
  platform: z.enum(SUPPORTED_PLATFORMS).optional(),
});

const containerOptsSchema: z.ZodType<ContainerOpts> = z
  .object({
    image: z.string().min(1).optional(),
    name: z.string().optional(),
    cmd: z.array(z.string()).optional(),
    entrypoint: z.string().optional(),
    env: z.record(z.string(), z.string()).or(z.array(z.string())).optional(),
    workingDir: z.string().optional(),
    autoRemove: z.boolean().optional(),
    binds: z.array(z.string()).optional(),
    networkMode: z.string().optional(),
    tty: z.boolean().optional(),
    labels: z.record(z.string(), z.string()).optional(),
    platform: z.enum(SUPPORTED_PLATFORMS).optional(),
    privileged: z.boolean().optional(),
    anonymousVolumes: z.array(z.string()).optional(),
    createExtras: z
      .custom<Partial<ContainerCreateOptions>>((val) => (val && typeof val === 'object' ? val : undefined))
      .optional(),
    ttlSeconds: z.number().int().positive().optional(),
  })
  .strict();

const stopContainerSchema = z.object({
  containerId: z.string().min(1),
  timeoutSec: z.number().int().nonnegative().optional(),
});

const removeContainerSchema = z.object({
  containerId: z.string().min(1),
  force: z.boolean().optional(),
  removeVolumes: z.boolean().optional(),
});

const findByLabelsSchema = z.object({
  labels: z
    .record(z.string(), z.string())
    .refine((val) => Object.keys(val).length > 0, 'labels required'),
  all: z.boolean().optional(),
});

const execRunSchema = z.object({
  containerId: z.string().min(1),
  command: z.union([z.string(), z.array(z.string())]),
  options: z
    .object({
      workdir: z.string().optional(),
      env: z.record(z.string(), z.string()).or(z.array(z.string())).optional(),
      timeoutMs: z.number().int().nonnegative().optional(),
      idleTimeoutMs: z.number().int().nonnegative().optional(),
      tty: z.boolean().optional(),
      killOnTimeout: z.boolean().optional(),
      logToPid1: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

const resizeExecSchema = z.object({
  execId: z.string().min(1),
  size: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive() }),
});

const touchSchema = z.object({ containerId: z.string().min(1) });

const putArchiveSchema = z.object({
  containerId: z.string().min(1),
  path: z.string().min(1),
  payloadBase64: z.string().min(1),
});

const logsQuerySchema = z.object({
  containerId: z.string().min(1),
  follow: z.coerce.boolean().default(true),
  since: z.coerce.number().optional(),
  tail: z.coerce.number().optional(),
  stdout: z.coerce.boolean().optional(),
  stderr: z.coerce.boolean().optional(),
  timestamps: z.coerce.boolean().optional(),
});

const listByVolumeSchema = z.object({ volumeName: z.string().min(1) });
const removeVolumeSchema = z.object({ volumeName: z.string().min(1), force: z.boolean().optional() });
const eventsQuerySchema = z.object({
  since: z.coerce.number().optional(),
  filters: z.string().optional(),
});

type RequestHandler<TRequest extends FastifyRequest = FastifyRequest> = (
  request: TRequest,
  reply: FastifyReply,
) => Promise<void> | void;

type WebsocketRouteHandler = (socket: unknown, request: FastifyRequest) => void | Promise<void>;

const authExemptPaths = new Set(['/v1/health', '/v1/ready']);

type ErrorResponseDetails = {
  status: number;
  code: string;
  message: string;
  retryable?: boolean;
  containerId?: string;
};

const getRoutePath = (request: FastifyRequest): string => {
  const typedRequest = request as FastifyRequest & { routerPath?: string };
  return (
    request.routeOptions?.url ??
    typedRequest.routerPath ??
    request.url ??
    request.raw.url ??
    'unknown'
  );
};

const logErrorResponse = (request: FastifyRequest, details: ErrorResponseDetails) => {
  const route = getRoutePath(request);
  request.log.error(
    {
      requestId: request.id,
      method: request.method,
      route,
      status: details.status,
      errorCode: details.code,
      message: details.message,
      containerId: details.containerId,
    },
    'docker-runner request failed',
  );
};

const sendError = (request: FastifyRequest, reply: FastifyReply, details: ErrorResponseDetails) => {
  const retryable = typeof details.retryable === 'boolean' ? details.retryable : details.status >= 500;
  logErrorResponse(request, { ...details, retryable });
  reply.status(details.status).send({ error: { code: details.code, message: details.message, retryable } });
};

const validationError = (request: FastifyRequest, reply: FastifyReply, message: string) =>
  sendError(request, reply, { status: 400, code: 'validation_error', message, retryable: false });

type DockerodeError = Error & {
  statusCode?: number;
  statusMessage?: string;
  reason?: string;
  code?: string;
  json?: { message?: string };
};

const normalizeCode = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  return trimmed.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || undefined;
};

const extractDockerError = (error: unknown): { statusCode: number; code?: string; message?: string } | null => {
  if (!error || typeof error !== 'object') return null;
  const status = (error as DockerodeError).statusCode;
  if (typeof status !== 'number' || !Number.isFinite(status)) return null;
  const dockerError = error as DockerodeError;
  const message =
    dockerError.json?.message?.trim() ||
    dockerError.message?.trim() ||
    dockerError.reason?.trim() ||
    dockerError.statusMessage?.trim();
  const code = dockerError.code || normalizeCode(dockerError.reason || dockerError.statusMessage);
  return {
    statusCode: status,
    code,
    message: message || undefined,
  };
};

const sendDockerError = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  fallbackStatus: number,
  fallbackCode: string,
  options?: { retryable?: boolean; containerId?: string },
) => {
  const details = extractDockerError(error);
  const status = details?.statusCode ?? fallbackStatus;
  const code = details?.code ?? fallbackCode;
  const message =
    details?.message ?? (error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error');
  const retryable = typeof options?.retryable === 'boolean' ? options.retryable : status >= 500;
  sendError(request, reply, { status, code, message, retryable, containerId: options?.containerId });
};

const parse = <T>(schema: z.ZodSchema<T>, value: unknown, request: FastifyRequest, reply: FastifyReply): T | undefined => {
  const result = schema.safeParse(value);
  if (!result.success) {
    validationError(request, reply, result.error.issues[0]?.message ?? 'Invalid payload');
    return undefined;
  }
  return result.data;
};

const setupSse = (reply: FastifyReply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  const send = (payload: unknown) => {
    reply.raw.write(`data:${JSON.stringify(payload)}\n\n`);
  };
  const close = () => {
    try {
      reply.raw.end();
    } catch {
      // ignore
    }
  };
  return { send, close };
};

const decodeFilters = (encoded?: string): GetEventsOptions['filters'] | undefined => {
  if (!encoded) return undefined;
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed as GetEventsOptions['filters'];
  } catch {
    return undefined;
  }
};

const rawDataToString = (raw: RawData): string => {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  return Buffer.from(raw as ArrayBuffer).toString('utf8');
};

export function createRunnerApp(config: RunnerConfig): FastifyInstance {
  process.env.DOCKER_SOCKET = config.dockerSocket;
  const app = Fastify({ logger: { level: config.logLevel } });
  void app.register(websocket);
  const containers = new ContainerService();
  const nonceCache = new NonceCache({ ttlMs: config.signatureTtlMs });

  app.addHook('preHandler', async (request, reply) => {
    const path = (request.raw.url ?? request.url ?? '').split('?')[0];
    if (authExemptPaths.has(path)) return;
    const verification = verifyAuthHeaders({
      headers: request.headers as Record<string, string | string[]>,
      method: request.method,
      path: request.raw.url ?? request.url ?? '',
      body: request.body ?? '',
      secret: config.sharedSecret,
      nonceCache,
    });
    if (!verification.ok) {
      sendError(request, reply, {
        status: 401,
        code: verification.code ?? 'unauthorized',
        message: verification.message ?? 'Unauthorized',
        retryable: false,
      });
    }
  });

  app.get('/v1/health', async (_, reply) => {
    reply.send({ status: 'ok' });
  });

  app.get('/v1/ready', async (request, reply) => {
    try {
      await containers.getDocker().ping();
      reply.send({ status: 'ready' });
    } catch (error) {
      sendError(request, reply, {
        status: 503,
        code: 'docker_unavailable',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    }
  });

  app.post('/v1/images/ensure', (async (request, reply) => {
    const body = parse(ensureImageSchema, request.body, request, reply);
    if (!body) return;
    try {
      await containers.ensureImage(body.image, body.platform);
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'image_ensure_failed', { retryable: true });
    }
  }) as RequestHandler);

  app.post('/v1/containers/start', (async (request, reply) => {
    const body = parse(containerOptsSchema, request.body ?? {}, request, reply);
    if (!body) return;
    try {
      const handle = await containers.start(body);
      reply.send({ containerId: handle.id, name: body.name, status: 'running' });
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'start_failed', { retryable: true });
    }
  }) as RequestHandler);

  app.post('/v1/containers/stop', (async (request, reply) => {
    const body = parse(stopContainerSchema, request.body, request, reply);
    if (!body) return;
    try {
      await containers.stopContainer(body.containerId, body.timeoutSec ?? 10);
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'stop_failed', { containerId: body?.containerId });
    }
  }) as RequestHandler);

  app.post('/v1/containers/remove', (async (request, reply) => {
    const body = parse(removeContainerSchema, request.body, request, reply);
    if (!body) return;
    try {
      await containers.removeContainer(body.containerId, {
        force: body.force,
        removeVolumes: body.removeVolumes,
      });
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'remove_failed', { containerId: body?.containerId });
    }
  }) as RequestHandler);

  app.get('/v1/containers/inspect', async (request, reply) => {
    const query = parse(z.object({ containerId: z.string().min(1) }), request.query, request, reply);
    if (!query) return;
    try {
      const inspect = await containers.inspectContainer(query.containerId);
      reply.send(inspect);
    } catch (error) {
      sendDockerError(request, reply, error, 404, 'inspect_failed', { containerId: query?.containerId });
    }
  });

  app.get('/v1/containers/labels', async (request, reply) => {
    const query = parse(z.object({ containerId: z.string().min(1) }), request.query, request, reply);
    if (!query) return;
    try {
      const labels = await containers.getContainerLabels(query.containerId);
      reply.send({ labels });
    } catch (error) {
      sendDockerError(request, reply, error, 404, 'labels_failed', { containerId: query?.containerId });
    }
  });

  app.get('/v1/containers/networks', async (request, reply) => {
    const query = parse(z.object({ containerId: z.string().min(1) }), request.query, request, reply);
    if (!query) return;
    try {
      const networks = await containers.getContainerNetworks(query.containerId);
      reply.send({ networks });
    } catch (error) {
      sendDockerError(request, reply, error, 404, 'networks_failed', { containerId: query?.containerId });
    }
  });

  app.post('/v1/containers/findByLabels', (async (request, reply) => {
    const body = parse(findByLabelsSchema, request.body, request, reply);
    if (!body) return;
    try {
      const handles = await containers.findContainersByLabels(body.labels, { all: body.all });
      reply.send({ containerIds: handles.map((h) => h.id) });
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'find_failed');
    }
  }) as RequestHandler);

  app.post('/v1/exec/run', (async (request, reply) => {
    const body = parse(execRunSchema, request.body, request, reply);
    if (!body) return;
    try {
      const result = await containers.execContainer(body.containerId, body.command, body.options as ExecOptions);
      reply.send(result);
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'exec_failed', { containerId: body?.containerId });
    }
  }) as RequestHandler);

  app.post('/v1/exec/resize', (async (request, reply) => {
    const body = parse(resizeExecSchema, request.body, request, reply);
    if (!body) return;
    try {
      await containers.resizeExec(body.execId, body.size);
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 404, 'resize_failed');
    }
  }) as RequestHandler);

  app.post('/v1/containers/touch', (async (request, reply) => {
    const body = parse(touchSchema, request.body, request, reply);
    if (!body) return;
    try {
      await containers.touchLastUsed(body.containerId);
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'touch_failed', { containerId: body?.containerId });
    }
  }) as RequestHandler);

  app.get('/v1/containers/listByVolume', async (request, reply) => {
    const query = parse(listByVolumeSchema, request.query, request, reply);
    if (!query) return;
    try {
      const ids = await containers.listContainersByVolume(query.volumeName);
      reply.send({ containerIds: ids });
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'list_volume_failed');
    }
  });

  app.post('/v1/volumes/remove', (async (request, reply) => {
    const body = parse(removeVolumeSchema, request.body, request, reply);
    if (!body) return;
    try {
      await containers.removeVolume(body.volumeName, { force: body.force });
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'volume_remove_failed');
    }
  }) as RequestHandler);

  app.post('/v1/containers/putArchive', (async (request, reply) => {
    const body = parse(putArchiveSchema, request.body, request, reply);
    if (!body) return;
    try {
      const buffer = Buffer.from(body.payloadBase64, 'base64');
      await containers.putArchive(body.containerId, buffer, { path: body.path });
      reply.status(204).send();
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'put_archive_failed', { containerId: body?.containerId });
    }
  }) as RequestHandler);

  app.get('/v1/containers/logs/sse', async (request, reply) => {
    const query = parse(logsQuerySchema, request.query, request, reply);
    if (!query) return;
    try {
      const { stream, close } = await containers.streamContainerLogs(query.containerId, {
        follow: query.follow,
        since: query.since,
        tail: query.tail,
        stdout: query.stdout,
        stderr: query.stderr,
        timestamps: query.timestamps,
      });
      const { send, close: end } = setupSse(reply);
      const onData = (chunk: Buffer) => {
        send({ type: 'chunk', data: chunk.toString('base64') });
      };
      const onError = (error: unknown) => {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        end();
      };
      stream.on('data', onData);
      stream.on('error', onError);
      stream.on('end', () => {
        send({ type: 'end' });
        end();
      });
      request.raw.on('close', async () => {
        stream.off('data', onData);
        stream.off('error', onError);
        await close();
        end();
      });
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'logs_failed', { containerId: query?.containerId });
    }
  });

  app.get('/v1/events/sse', async (request, reply) => {
    const query = parse(eventsQuerySchema, request.query, request, reply);
    if (!query) return;
    try {
      const filters = decodeFilters(query.filters) ?? { type: ['container'] };
      const events = await containers.getEventsStream({ since: query.since, filters });
      const { send, close } = setupSse(reply);
      const parser = createDockerEventsParser((event) => {
        send({ type: 'event', event });
      });

      const handleData = (...args: unknown[]) => {
        if (!args.length) return;
        parser.handleChunk(args[0] as Parameters<typeof parser.handleChunk>[0]);
      };
      const handleEnd = () => {
        parser.flush();
        finish();
      };
      const handleStreamError = (error: unknown) => {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        finish();
      };

      const off = (eventName: 'data' | 'end' | 'close' | 'error', listener: (...args: unknown[]) => void) => {
        if (typeof (events as NodeJS.EventEmitter).off === 'function') {
          (events as NodeJS.EventEmitter).off(eventName, listener);
          return;
        }
        (events as NodeJS.EventEmitter).removeListener?.(eventName, listener);
      };

      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        off('data', handleData);
        off('end', handleEnd);
        off('close', handleEnd);
        off('error', handleStreamError);
        const closable = events as NodeJS.ReadableStream & { destroy?: () => void };
        try {
          closable.destroy?.();
        } catch {
          // ignore
        }
        close();
      };

      events.on('data', handleData);
      events.on('end', handleEnd);
      events.on('close', handleEnd);
      events.on('error', handleStreamError);

      request.raw.on('close', () => {
        parser.flush();
        finish();
      });
    } catch (error) {
      sendDockerError(request, reply, error, 500, 'events_failed');
    }
  });

  const interactiveExecWsHandler = async (connection: SocketStream, request: FastifyRequest): Promise<void> => {
    const socket = getWebsocket(connection);
    const querySchema = z.object({
      containerId: z.string().min(1),
      command: z.string().min(1),
      workdir: z.string().optional(),
      tty: z.string().optional(),
      demux: z.string().optional(),
      env: z.string().optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      closeWebsocket(socket, 4000, 'invalid_query');
      return;
    }
    const params = parsed.data;

    const command = (() => {
      try {
        const parsed = JSON.parse(params.command);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
      } catch {
        // treat as shell command
      }
      return params.command;
    })();

    const env = (() => {
      if (!params.env) return undefined;
      try {
        const parsed = JSON.parse(params.env);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
      } catch {
        return undefined;
      }
      return undefined;
    })();

    try {
      const session = await containers.openInteractiveExec(params.containerId, command, {
        workdir: params.workdir,
        tty: params.tty === 'true',
        demuxStderr: params.demux === 'false' ? false : true,
        env,
      });
      socket.send(JSON.stringify({ type: 'ready', execId: session.execId }));

      session.stdout.on('data', (chunk: Buffer) => {
        socket.send(JSON.stringify({ type: 'stdout', data: chunk.toString('base64') }));
      });
      session.stderr?.on('data', (chunk: Buffer) => {
        socket.send(JSON.stringify({ type: 'stderr', data: chunk.toString('base64') }));
      });

      let exitSent = false;
      const closeSession = async () => {
        if (exitSent) return;
        exitSent = true;
        try {
          const result = await session.close();
          socket.send(
            JSON.stringify({
              type: 'exit',
              execId: session.execId,
              exitCode: result.exitCode,
              stdout: Buffer.from(result.stdout).toString('base64'),
              stderr: Buffer.from(result.stderr).toString('base64'),
            }),
          );
        } catch (error) {
          socket.send(
            JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) }),
          );
        }
      };

      socket.on('message', async (raw: RawData) => {
        try {
          const payload = JSON.parse(rawDataToString(raw)) as { type: string; data?: string };
          if (payload.type === 'stdin' && payload.data) {
            session.stdin.write(Buffer.from(payload.data, 'base64'));
            return;
          }
          if (payload.type === 'close') {
            await closeSession();
            closeWebsocket(socket);
          }
        } catch (error) {
          socket.send(
            JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) }),
          );
        }
      });

      socket.on('close', () => {
        try {
          session.stdin.end();
        } catch {
          // ignore
        }
      });
    } catch (error) {
      socket.send(
        JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) }),
      );
      closeWebsocket(socket, 1011, 'exec_failed');
    }
  };

  app.after((err) => {
    if (err) throw err;
    const hiddenSchema = { hide: true } as FastifySchema & { hide?: boolean };
    app.route({
      method: 'GET',
      url: '/v1/exec/interactive/ws',
      schema: hiddenSchema,
      handler: ((request, reply) => {
        sendError(request, reply, {
          status: 426,
          code: 'upgrade_required',
          message: 'WebSocket upgrade required',
          retryable: false,
        });
      }) as RequestHandler,
      wsHandler: interactiveExecWsHandler as unknown as WebsocketRouteHandler,
    });
  });

  return app;
}
