import { z } from 'zod';

// Database document schema
export const spanDocumentSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  label: z.string(),
  status: z.enum(['running', 'ok', 'error', 'cancelled']),
  startTime: z.number(),
  endTime: z.number().optional(),
  completed: z.boolean(),
  lastUpdate: z.number(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  events: z.array(z.object({
    name: z.string(),
    timestamp: z.number(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })).optional(),
  rev: z.number(),
  idempotencyKeys: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Optional fields (captured but not queried in Stage 1)
  nodeId: z.string().optional(),
  threadId: z.string().optional(),
});

export type SpanDocument = z.infer<typeof spanDocumentSchema>;

// API request schemas
export const extendedSpanRequestSchema = z.object({
  state: z.enum(['created', 'updated', 'completed']),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  label: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  status: z.enum(['running', 'ok', 'error', 'cancelled']).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  events: z.array(z.object({
    name: z.string(),
    timestamp: z.number(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })).optional(),
  idempotencyKey: z.string().optional(),
  rev: z.number().optional(),
  nodeId: z.string().optional(),
  threadId: z.string().optional(),
});

export type ExtendedSpanRequest = z.infer<typeof extendedSpanRequestSchema>;

// Query parameters schema
export const spanQuerySchema = z.object({
  status: z.enum(['running', 'ok', 'error', 'cancelled']).optional(),
  running: z.boolean().optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  label: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  sort: z.enum(['lastUpdate', 'startTime']).default('lastUpdate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type SpanQuery = z.infer<typeof spanQuerySchema>;

// API response schemas
export const spanResponseSchema = spanDocumentSchema.omit({
  idempotencyKeys: true,
  createdAt: true,
  updatedAt: true,
});

export type SpanResponse = z.infer<typeof spanResponseSchema>;

export const spanListResponseSchema = z.object({
  spans: z.array(spanResponseSchema),
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().optional(),
  }),
});

export type SpanListResponse = z.infer<typeof spanListResponseSchema>;