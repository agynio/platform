import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Collection, Db, Document, Filter, UpdateFilter } from 'mongodb';
import { z } from 'zod';
import { Server as SocketIOServer } from 'socket.io';

export type SpanDoc = {
  _id?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  label: string;
  status: 'running' | 'ok' | 'error' | 'cancelled';
  startTime: string;
  endTime?: string;
  completed: boolean;
  lastUpdate: string;
  attributes: Record<string, unknown>;
  events: Array<{ ts: string; name: string; attrs?: Record<string, unknown> }>;
  rev: number;
  idempotencyKeys: string[];
  createdAt: string;
  updatedAt: string;
  nodeId?: string;
  threadId?: string;
};

// Log document (denormalized span linkage). Keep minimal for Stage 1.
export interface LogDoc {
  _id?: string;
  traceId?: string; // optional if outside span context
  spanId?: string;
  level: 'debug' | 'info' | 'error';
  message: string;
  ts: string; // ISO timestamp
  attributes?: Record<string, unknown>;
  createdAt: string;
}

const UpsertSchema = z.object({
  state: z.enum(['created', 'updated', 'completed']),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  label: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  // Accept 'success' from SDK but we'll normalize it later to 'ok'
  status: z.enum(['running', 'ok', 'error', 'cancelled', 'success']).optional(),
  attributes: z.record(z.any()).optional(),
  events: z.array(z.object({ ts: z.string(), name: z.string(), attrs: z.record(z.any()).optional() })).optional(),
  idempotencyKey: z.string().optional(),
  rev: z.number().int().optional(),
  nodeId: z.string().optional(),
  threadId: z.string().optional(),
});

const QuerySchema = z.object({
  status: z.enum(['running', 'ok', 'error', 'cancelled']).optional(),
  running: z.coerce.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  label: z.string().optional(),
  sort: z.enum(['lastUpdate', 'startTime']).default('lastUpdate'),
  cursor: z.string().optional(),
  // Increased max limit from 100 -> 5000 (large traces / development convenience). Default remains 50 to avoid accidental huge payloads.
  limit: z.coerce.number().int().min(1).max(5000).default(50),
});

export async function createServer(db: Db, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: opts.logger ?? true });
  // CORS (dev only, permissive). TODO: tighten for prod when auth added.
  await fastify.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      if (!origin) return cb(null, true); // allow non-browser / curl
      // Allow all localhost origins and any origin for now (Stage 1 UI)
      cb(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Idempotency-Key'],
  });
  const spans: Collection<SpanDoc> = db.collection('spans');
  const logs: Collection<LogDoc> = db.collection('logs');

  // indexes (idempotent)
  await spans.createIndex({ status: 1, lastUpdate: -1 });
  await spans.createIndex({ startTime: -1 });
  await spans.createIndex({ traceId: 1, spanId: 1 }, { unique: true });
  await spans.createIndex({ completed: 1, lastUpdate: -1 }, { partialFilterExpression: { completed: false } });
  // Log indexes
  await logs.createIndex({ traceId: 1, spanId: 1, ts: -1 });
  await logs.createIndex({ ts: -1 });

  // Heartbeat sweeper configuration (env-driven with defaults)
  const STALE_TTL_MS = (() => {
    const v = Number(process.env.OBS_STALE_TTL_MS);
    return Number.isFinite(v) && v > 0 ? v : 5 * 60 * 1000; // default 5 minutes
  })();
  const SWEEP_INTERVAL_MS = (() => {
    const v = Number(process.env.OBS_SWEEP_INTERVAL_MS);
    return Number.isFinite(v) && v > 0 ? v : 60 * 1000; // default 60s
  })();
  const RECONCILE_ON_START = (() => {
    const env = (process.env.OBS_RECONCILE_ON_START || 'true').toLowerCase();
    return env === '1' || env === 'true' || env === 'yes';
  })();

  // Sweeper function: cancels stale running spans (no heartbeat within TTL)
  const runSweep = async (reason: 'periodic' | 'startup') => {
    const cutoff = new Date(Date.now() - STALE_TTL_MS).toISOString();
    const nowIso = new Date().toISOString();
    const filter: Filter<SpanDoc> = {
      completed: false,
      lastUpdate: { $lt: cutoff },
    };
    // Rely on partial index { completed: 1, lastUpdate: -1 } for efficiency
    const update: UpdateFilter<SpanDoc> = {
      $set: {
        completed: true,
        status: 'cancelled',
        endTime: nowIso,
        updatedAt: nowIso,
        lastUpdate: nowIso,
      },
      $push: { events: { ts: nowIso, name: 'terminated', attrs: { reason: 'stale_no_heartbeat', by: reason } } },
    };
    try {
      // Index-friendly path: identify candidate ids using the indexed predicate,
      // then apply update by _id and emit them.
      const ids = await spans.find(filter, { projection: { _id: 1 } }).map((d) => d._id).toArray();
      if (ids.length === 0) return;
      const res = await spans.updateMany({ _id: { $in: ids }, completed: false }, update);
      if (res.modifiedCount) {
        fastify.log.warn({ modified: res.modifiedCount, since: STALE_TTL_MS }, 'sweeper cancelled stale spans');
        // Emit realtime updates for affected spans by ids (best-effort)
        if (spanIo) {
          try {
            const changed = await spans.find({ _id: { $in: ids } }, { limit: 5000 }).toArray();
            for (const d of changed) spanIo.emit('span_upsert', d);
          } catch {}
        }
      }
    } catch (err) {
      fastify.log.error({ err }, 'sweeper failed');
    }
  };

  // Startup reconciliation (optional)
  if (RECONCILE_ON_START) {
    // Do not await to avoid blocking server start; but log outcome
    runSweep('startup').catch(() => {});
  }

  // Periodic sweeper
  const sweepTimer = setInterval(() => {
    runSweep('periodic').catch(() => {});
  }, SWEEP_INTERVAL_MS);
  fastify.addHook('onClose', async () => {
    clearInterval(sweepTimer);
  });

  fastify.get('/healthz', async () => ({ ok: true }));
  fastify.get('/readyz', async () => {
    await db.command({ ping: 1 });
    return { ok: true };
  });

  fastify.post<{ Body: z.infer<typeof UpsertSchema> }>('/v1/spans/upsert', async (req, reply) => {
    const parsed = UpsertSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = { ...parsed.data };
    if (body.status === 'success') body.status = 'ok';
    const now = new Date().toISOString();
    fastify.log.debug(
      { state: body.state, spanId: body.spanId, traceId: body.traceId, hasAttributes: !!body.attributes },
      'incoming span upsert',
    );
    const key = body.idempotencyKey;
    if (key) {
      const existing = await spans.findOne({ traceId: body.traceId, spanId: body.spanId, idempotencyKeys: key });
      if (existing) return { ok: true, id: existing._id };
    }
    const filter: Filter<SpanDoc> = { traceId: body.traceId, spanId: body.spanId };
    const doc = await spans.findOne(filter);
    const setOnInsert: Partial<SpanDoc> = doc
      ? {}
      : {
          traceId: body.traceId,
          spanId: body.spanId,
          parentSpanId: body.parentSpanId,
          label: body.label || 'span',
          status: 'running',
          startTime: body.startTime || now,
          endTime: undefined,
          completed: false,
          attributes: body.attributes || {},
          events: [],
          idempotencyKeys: key ? [key] : [],
          createdAt: now,
          nodeId: body.nodeId,
          threadId: body.threadId,
        };

    const update: UpdateFilter<SpanDoc> = { $setOnInsert: setOnInsert, $set: { updatedAt: now, lastUpdate: now } };
    if (doc) (update.$inc = { rev: 1 } as any);
    else (update.$set = { ...update.$set, rev: 0 });
    if (key) (update.$addToSet = { idempotencyKeys: key } as any);

    if (body.state === 'created') {
      if (doc) {
        // Existing span transitioning (should be rare) - merge mutable fields
        const createdSet: Partial<SpanDoc> = {
          attributes: { ...(doc?.attributes || {}), ...(body.attributes || {}) },
          label: body.label ?? (doc?.label || 'span'),
          status: 'running',
          startTime: body.startTime || doc?.startTime || now,
          parentSpanId: body.parentSpanId ?? doc?.parentSpanId,
          nodeId: body.nodeId ?? doc?.nodeId,
          threadId: body.threadId ?? doc?.threadId,
        };
        update.$set = { ...update.$set, ...createdSet } as any;
      } else {
        // New doc: attributes & other fields already present in $setOnInsert; avoid duplicating in $set
      }
    } else if (body.state === 'updated') {
      // only set attributes; avoid conflict if inserting (attributes already in $setOnInsert)
      if (doc) {
        update.$set = {
          ...update.$set,
          attributes: { ...(doc?.attributes || {}), ...(body.attributes || {}) },
        } as any;
      }
    } else if (body.state === 'completed') {
      fastify.log.debug({ spanId: body.spanId, traceId: body.traceId }, 'processing completed state');
      if (doc?.completed) {
        return { ok: true, id: doc._id };
      }
      // Normalize client SDK status (which currently uses 'success'/'error') to server enum ('ok'/'error')
      const rawStatus = body.status as string | undefined;
      const normalizedStatus = rawStatus === 'success' ? 'ok' : rawStatus === 'error' ? 'error' : body.status;
      const completedSet: Partial<SpanDoc> = {
        endTime: body.endTime || now,
        completed: true,
        status: (normalizedStatus as SpanDoc['status']) || 'ok',
      };
      // Merge attributes from completed event (including new output / llm.* attributes)
      if (doc) {
        if (body.attributes && Object.keys(body.attributes).length) {
          const merged = mergeCompletedAttributes(doc.attributes || {}, body.attributes);
          (completedSet as any).attributes = merged;
        }
      } else if (body.attributes && Object.keys(body.attributes).length) {
        // Insert path: normalize attributes before setting on insert
        const normalized = mergeCompletedAttributes({}, body.attributes);
        update.$setOnInsert = {
          ...update.$setOnInsert,
          attributes: { ...(update.$setOnInsert?.attributes || {}), ...normalized },
        } as any;
      }
      // If inserting, remove keys that would conflict (completed/status/endTime exist in setOnInsert except endTime which is undefined there)
      if (!doc) {
        // status, completed, endTime all in setOnInsert (endTime as undefined) – let setOnInsert win
        delete (completedSet as any).status;
        delete (completedSet as any).completed;
        delete (completedSet as any).endTime; // initial endTime for completed insert is handled below
        // For a directly completed new span treat as fully completed doc: modify setOnInsert instead
        update.$setOnInsert = {
          ...update.$setOnInsert,
          status: (normalizedStatus as SpanDoc['status']) || 'ok',
          endTime: body.endTime || now,
          completed: true,
        } as any;
      } else {
        fastify.log.debug({ spanId: body.spanId, traceId: body.traceId }, 'applying completedSet to existing doc');
        update.$set = { ...update.$set, ...completedSet } as any;
      }
    }

    fastify.log.debug({ filter, update }, 'span upsert update document');
    try {
      await spans.updateOne(filter, update, { upsert: true });
    } catch (err) {
      fastify.log.error({ err, filter, update }, 'upsert failed');
      const details = (err as Error)?.message;
      return reply.code(500).send({ error: 'upsert_failed', details });
    }
    const final = await spans.findOne(filter);
    // Emit realtime event (best-effort; ignore failures)
    try {
      if (final && spanIo) spanIo.emit('span_upsert', final);
    } catch {}
    return { ok: true, id: final?._id };
  });

  fastify.get<{ Querystring: z.infer<typeof QuerySchema> }>('/v1/spans', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { status, running, from, to, label, sort, cursor, limit } = parsed.data;
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      return reply.code(400).send({ error: 'invalid_range', details: '`from` must be <= `to`' });
    }
    const q: Filter<SpanDoc> = {} as Filter<SpanDoc>;
    if (status) q.status = status;
    if (running !== undefined) (q as any).completed = running ? false : { $in: [true, false] };
    if (label) q.label = label;
    if (from || to) {
      const field = sort === 'startTime' ? 'startTime' : 'lastUpdate';
      (q as any)[field] = {};
      if (from) (q as any)[field].$gte = from;
      if (to) (q as any)[field].$lte = to;
    }
    const sortSpec = sort === 'startTime' ? ({ startTime: -1, _id: -1 } as const) : ({ lastUpdate: -1, _id: -1 } as const);
    if (cursor) {
      try {
        const obj = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        const field = sort === 'startTime' ? 'startTime' : 'lastUpdate';
        (q as any).$or = [{ [field]: { $lt: obj[field] } }, { [field]: obj[field], _id: { $lt: obj._id } }];
      } catch {}
    }
    const docs = await spans.find(q).sort(sortSpec).limit(limit).toArray();
    const tail = docs[docs.length - 1] as SpanDoc | undefined;
    const cursorObj = tail
      ? {
          [sort === 'startTime' ? 'startTime' : 'lastUpdate']: tail[sort === 'startTime' ? 'startTime' : 'lastUpdate'],
          _id: tail._id,
        }
      : undefined;
    const nextCursor = cursorObj ? Buffer.from(JSON.stringify(cursorObj)).toString('base64') : undefined;
    return { items: docs, nextCursor };
  });

  // Metrics: errors grouped by tool label
  const MetricsErrorsByToolQuery = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(50),
    field: z.enum(['lastUpdate', 'startTime']).default('lastUpdate'),
  });

  fastify.get<{ Querystring: z.infer<typeof MetricsErrorsByToolQuery> }>('/v1/metrics/errors-by-tool', async (req, reply) => {
    const parsed = MetricsErrorsByToolQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const from = parsed.data.from ?? defaultFrom;
    const to = parsed.data.to ?? now.toISOString();
    if (new Date(from).getTime() > new Date(to).getTime()) {
      return reply.code(400).send({ error: 'invalid_range', details: '`from` must be <= `to`' });
    }
    const field = parsed.data.field;
    const limit = parsed.data.limit;
    // Build aggregation pipeline
    const match: Document = {
      status: 'error',
      label: { $regex: /^tool:/ },
    };
    (match as any)[field] = { $gte: from, $lte: to };
    const pipeline: Document[] = [
      { $match: match },
      { $group: { _id: '$label', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, label: '$_id', count: 1 } },
    ];
    // Indexing note: ensure indexes exist on:
    // - { status: 1, lastUpdate: -1 }
    // - { startTime: -1 }
    // These make the time-window + status match efficient before grouping by label.
    const items = await spans.aggregate(pipeline).toArray();
    return { items, from, to };
  });

  fastify.get<{ Params: { id: string } }>('/v1/spans/:id', async (req, reply) => {
    const id = req.params.id;
    const { ObjectId } = await import('mongodb');
    const doc = await spans.findOne({ _id: new ObjectId(id) as any });
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });

  fastify.post<{ Body: { spans?: Array<Partial<SpanDoc>> } }>('/v1/traces', async (req, reply) => {
    const body = req.body;
    const now = new Date().toISOString();
    const spansIn = Array.isArray(body?.spans) ? body.spans : [];
    const emitted: SpanDoc[] = [];
    await Promise.all(
      spansIn.map(async (s) => {
        const filter: Filter<SpanDoc> = { traceId: s.traceId as string, spanId: s.spanId as string };
        const doc: Partial<SpanDoc> = {
          traceId: s.traceId as string,
          spanId: s.spanId as string,
          parentSpanId: s.parentSpanId,
          label: (s.label as string) || 'span',
          status: (s.status as SpanDoc['status']) || 'ok',
          startTime: (s.startTime as string) || now,
          endTime: (s.endTime as string) || now,
          completed: true,
          lastUpdate: now,
          attributes: (s.attributes as Record<string, unknown>) || {},
          events: [],
          rev: 1,
          idempotencyKeys: [],
          createdAt: now,
          updatedAt: now,
        };
        await spans.updateOne(filter, { $set: doc }, { upsert: true });
        const final = await spans.findOne(filter);
        if (final) emitted.push(final as SpanDoc);
      }),
    );
    if (spanIo) {
      for (const e of emitted) {
        try {
          spanIo.emit('span_upsert', e);
        } catch {}
      }
    }
    return { ok: true, count: spansIn.length };
  });

  // --- Logs Endpoints ---
  const LogSchema = z.object({
    level: z.enum(['debug', 'info', 'error']),
    message: z.string(),
    ts: z.string().optional(),
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    attributes: z.record(z.any()).optional(),
  });
  const LogsInSchema = z.union([LogSchema, z.array(LogSchema)]);

  fastify.post<{ Body: z.infer<typeof LogsInSchema> }>('/v1/logs', async (req, reply) => {
    const parsed = LogsInSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const nowIso = new Date().toISOString();
    const arr = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    if (arr.length === 0) return { ok: true, count: 0 };
    const docs: LogDoc[] = arr.map((l) => ({
      traceId: l.traceId,
      spanId: l.spanId,
      level: l.level,
      message: l.message,
      ts: l.ts || nowIso,
      attributes: l.attributes || {},
      createdAt: nowIso,
    }));
    try {
      if (docs.length === 1) {
        await logs.insertOne(docs[0]);
      } else {
        await logs.insertMany(docs);
      }
    } catch (err) {
      fastify.log.error({ err }, 'log insert failed');
      return reply.code(500).send({ error: 'insert_failed' });
    }
    // Emit realtime events (best-effort)
    if (spanIo) {
      for (const d of docs) {
        try {
          spanIo.emit('log', d);
        } catch {}
      }
    }
    return { ok: true, count: docs.length };
  });

  fastify.get('/v1/logs', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const traceId = typeof q.traceId === 'string' ? q.traceId : undefined;
    const spanId = typeof q.spanId === 'string' ? q.spanId : undefined;
    const level = typeof q.level === 'string' ? q.level : undefined;
    const limit = q.limit ? Math.min(500, parseInt(String(q.limit), 10) || 200) : 200;
    const find: Filter<LogDoc> = {} as Filter<LogDoc>;
    if (traceId) find.traceId = traceId;
    if (spanId) find.spanId = spanId;
    if (level && ['debug', 'info', 'error'].includes(level)) find.level = level as any;
    const docs = await logs.find(find).sort({ ts: -1 }).limit(limit).toArray();
    return { items: docs };
  });

  return fastify;
}

// ---------------- Attribute merge helpers ----------------
/**
 * Merge incoming completed-event attributes into existing attributes while normalizing
 * dotted keys such as "llm.content" -> attributes.llm.content. Also deep-merges
 * `output` object and preserves existing keys unless explicitly overwritten.
 */
function mergeCompletedAttributes(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    // Consolidate llm.* flattened keys into output.* only (no separate llm object persisted)
    if (key === 'llm.content') {
      out.output = { ...(out.output || {}), content: value };
      continue;
    }
    if (key === 'llm.toolCalls') {
      out.output = { ...(out.output || {}), toolCalls: value };
      continue;
    }
    if (key === 'output' && value && typeof value === 'object' && !Array.isArray(value)) {
      out.output = { ...(out.output || {}), ...value };
      continue;
    }
    if (key.includes('.')) {
      // For other dotted keys, attempt nested normalization
      const parts = key.split('.');
      let cursor: any = out;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) {
          cursor[p] = value;
        } else {
          cursor[p] = cursor[p] && typeof cursor[p] === 'object' ? cursor[p] : {};
          cursor = cursor[p];
        }
      }
      continue;
    }
    out[key] = value;
  }
  // Remove any lingering llm object if previously stored (dedupe)
  if (out.llm && typeof out.llm === 'object') delete out.llm;
  return out;
}

// --- Realtime (socket.io) integration attachment point ---
// We keep socket instance out-of-band so route handlers can emit without
// circular dependency on index.ts. Stage 1: global broadcast (no rooms).
let spanIo: SocketIOServer | undefined;
export function attachSpanSocket(io: SocketIOServer) {
  spanIo = io;
  io.on('connection', (socket) => {
    // Emit initial connected event with server timestamp
    try {
      socket.emit('connected', { ts: Date.now() });
    } catch {}
    // Support client ping (ack form or event form)
    socket.on('ping', (data: any, cb: ((resp: any) => void) | undefined) => {
      const resp = { ts: Date.now() };
      if (typeof cb === 'function') cb(resp);
      else socket.emit('pong', resp);
    });
  });
}
