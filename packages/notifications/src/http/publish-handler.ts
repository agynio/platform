import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { NotificationEnvelope } from '@agyn/shared';
import { RoomSchema } from '../rooms';
import type { Logger } from '../logger';
import { serializeError } from '../errors';

const PublishRequestSchema = z
  .object({
    event: z.string().min(1),
    rooms: z.array(RoomSchema).min(1),
    payload: z.object({}).passthrough(),
    source: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
  })
  .strict();

const NodeStatusEventSchema = z
  .object({
    nodeId: z.string().min(1),
    provisionStatus: z
      .object({
        state: z.enum([
          'not_ready',
          'provisioning',
          'ready',
          'deprovisioning',
          'provisioning_error',
          'deprovisioning_error',
        ]),
        details: z.unknown().optional(),
      })
      .partial()
      .optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .passthrough();

const NodeStateEventSchema = z
  .object({
    nodeId: z.string().min(1),
    state: z.record(z.string(), z.unknown()),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const ReminderCountEventSchema = z
  .object({
    nodeId: z.string().min(1),
    count: z.number().int().min(0),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const ThreadSummarySchema = z
  .object({
    id: z.string().uuid(),
    alias: z.string(),
    summary: z.string().nullable(),
    status: z.enum(['open', 'closed']),
    createdAt: z.string().datetime(),
    parentId: z.string().uuid().nullable().optional(),
    channelNodeId: z.string().uuid().nullable().optional(),
    assignedAgentNodeId: z.string().uuid().nullable().optional(),
  })
  .passthrough();

const ThreadEnvelopeSchema = z
  .object({
    thread: ThreadSummarySchema,
  })
  .passthrough();

const ThreadActivitySchema = z
  .object({
    threadId: z.string().uuid(),
    activity: z.enum(['working', 'waiting', 'idle']),
  })
  .passthrough();

const ThreadRemindersSchema = z
  .object({
    threadId: z.string().uuid(),
    remindersCount: z.number().int().min(0),
  })
  .passthrough();

const MessageSummarySchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['user', 'assistant', 'system', 'tool']),
    text: z.string().nullable(),
    source: z.unknown(),
    createdAt: z.string().datetime(),
    runId: z.string().uuid().optional(),
  })
  .passthrough();

const MessageCreatedSchema = z
  .object({
    threadId: z.string().uuid(),
    message: MessageSummarySchema,
  })
  .passthrough();

const RunSummarySchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid().optional(),
    status: z.enum(['running', 'finished', 'terminated']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const RunStatusChangedSchema = z
  .object({
    threadId: z.string().uuid(),
    run: RunSummarySchema,
  })
  .passthrough();

const RunEventSchema = z
  .object({
    runId: z.string().uuid(),
    mutation: z.enum(['append', 'update']),
    event: z.unknown(),
  })
  .passthrough();

const ToolOutputChunkSchema = z
  .object({
    runId: z.string().uuid(),
    threadId: z.string().uuid(),
    eventId: z.string().uuid(),
    seqGlobal: z.number().int().positive(),
    seqStream: z.number().int().positive(),
    source: z.enum(['stdout', 'stderr']),
    ts: z.string().datetime(),
    data: z.string(),
  })
  .passthrough();

const ToolOutputTerminalSchema = z
  .object({
    runId: z.string().uuid(),
    threadId: z.string().uuid(),
    eventId: z.string().uuid(),
    exitCode: z.number().int().nullable(),
    status: z.enum(['success', 'error', 'timeout', 'idle_timeout', 'cancelled', 'truncated']),
    bytesStdout: z.number().int().min(0),
    bytesStderr: z.number().int().min(0),
    totalChunks: z.number().int().min(0),
    droppedChunks: z.number().int().min(0),
    savedPath: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    ts: z.string().datetime(),
  })
  .passthrough();

const NotificationEventSchemas = {
  node_status: NodeStatusEventSchema,
  node_state: NodeStateEventSchema,
  node_reminder_count: ReminderCountEventSchema,
  thread_created: ThreadEnvelopeSchema,
  thread_updated: ThreadEnvelopeSchema,
  thread_activity_changed: ThreadActivitySchema,
  thread_reminders_count: ThreadRemindersSchema,
  message_created: MessageCreatedSchema,
  run_status_changed: RunStatusChangedSchema,
  run_event_appended: RunEventSchema,
  run_event_updated: RunEventSchema,
  tool_output_chunk: ToolOutputChunkSchema,
  tool_output_terminal: ToolOutputTerminalSchema,
} as const;

type KnownEvent = keyof typeof NotificationEventSchemas;

type PublishRequest = z.infer<typeof PublishRequestSchema>;

export type PublishHandlerDependencies = {
  logger: Logger;
  dispatch: (envelope: NotificationEnvelope) => void;
};

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const PUBLISH_PATH = '/internal/notifications/publish';

const parseJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new InvalidRequestError('invalid_json', 'Request body must be valid JSON');
  }
};

class InvalidRequestError extends Error {
  constructor(public readonly code: 'invalid_json' | 'validation_failed', message: string) {
    super(message);
    this.name = 'InvalidRequestError';
  }
}

class UnprocessableEntityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnprocessableEntityError';
  }
}

const getPathname = (url: string | undefined): string => {
  if (!url) return '/';
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return '/';
  }
};

const validateRequest = (body: unknown): PublishRequest => {
  const parsed = PublishRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new InvalidRequestError('validation_failed', parsed.error.message);
  }
  return parsed.data;
};

const validatePayloadForEvent = (event: string, payload: unknown): void => {
  const schema = NotificationEventSchemas[event as KnownEvent];
  if (!schema) {
    throw new UnprocessableEntityError(`unknown event: ${event}`);
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new UnprocessableEntityError(`payload validation failed for event: ${event}`);
  }
};

const writeJson = (res: ServerResponse, status: number, data: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', JSON_CONTENT_TYPE);
  res.end(JSON.stringify(data));
};

export const createPublishHandler = ({ logger, dispatch }: PublishHandlerDependencies) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = getPathname(req.url);
    if (pathname !== PUBLISH_PATH) {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.end();
      return;
    }

    try {
      const rawBody = await parseJsonBody(req);
      const request = validateRequest(rawBody);
      validatePayloadForEvent(request.event, request.payload);

      const id = randomUUID();
      const ts = new Date().toISOString();

      const envelope: NotificationEnvelope = {
        id,
        ts,
        source: (request.source ?? 'platform-server') as NotificationEnvelope['source'],
        rooms: request.rooms,
        event: request.event,
        payload: request.payload,
      };

      const logContext: Record<string, unknown> = {
        id,
        ts,
        event: request.event,
        roomsCount: request.rooms.length,
      };
      if (request.source) logContext.source = request.source;
      if (request.traceId) logContext.traceId = request.traceId;

      logger.info(logContext, 'notification published via http');

      try {
        dispatch(envelope);
      } catch (error) {
        logger.error({ error: serializeError(error) }, 'dispatch failed');
        writeJson(res, 500, { ok: false, error: 'internal_error' });
        return;
      }

      writeJson(res, 200, { ok: true, id, ts });
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        writeJson(res, 400, { ok: false, error: error.code });
        return;
      }
      if (error instanceof UnprocessableEntityError) {
        writeJson(res, 422, { ok: false, error: 'unprocessable_entity' });
        return;
      }
      logger.error({ error: serializeError(error) }, 'unexpected publish handler error');
      writeJson(res, 500, { ok: false, error: 'internal_error' });
    }
  };

export type PublishHandler = ReturnType<typeof createPublishHandler>;
