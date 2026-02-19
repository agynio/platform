import { z } from 'zod';

export const NodeStatusEventSchema = z
  .object({
    nodeId: z.string(),
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
      .partial(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type NodeStatusEvent = z.infer<typeof NodeStatusEventSchema>;

export const NodeStateEventSchema = z
  .object({
    nodeId: z.string(),
    state: z.record(z.string(), z.unknown()),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type NodeStateEvent = z.infer<typeof NodeStateEventSchema>;

export const ReminderCountSocketEventSchema = z
  .object({
    nodeId: z.string(),
    count: z.number().int().min(0),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ReminderCountSocketEvent = z.infer<typeof ReminderCountSocketEventSchema>;

export const ToolOutputChunkEventSchema = z
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
  .strict();
export type ToolOutputChunkEvent = z.infer<typeof ToolOutputChunkEventSchema>;

export const ToolOutputTerminalEventSchema = z
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
    savedPath: z.string().optional().nullable(),
    message: z.string().optional().nullable(),
    ts: z.string().datetime(),
  })
  .strict();
export type ToolOutputTerminalEvent = z.infer<typeof ToolOutputTerminalEventSchema>;
