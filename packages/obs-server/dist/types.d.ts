import { z } from 'zod';
export declare const spanDocumentSchema: z.ZodObject<{
    traceId: z.ZodString;
    spanId: z.ZodString;
    parentSpanId: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    status: z.ZodEnum<{
        error: "error";
        running: "running";
        ok: "ok";
        cancelled: "cancelled";
    }>;
    startTime: z.ZodNumber;
    endTime: z.ZodOptional<z.ZodNumber>;
    completed: z.ZodBoolean;
    lastUpdate: z.ZodNumber;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    events: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        timestamp: z.ZodNumber;
        attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, z.core.$strip>>>;
    rev: z.ZodNumber;
    idempotencyKeys: z.ZodArray<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    nodeId: z.ZodOptional<z.ZodString>;
    threadId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SpanDocument = z.infer<typeof spanDocumentSchema>;
export declare const extendedSpanRequestSchema: z.ZodObject<{
    state: z.ZodEnum<{
        completed: "completed";
        created: "created";
        updated: "updated";
    }>;
    traceId: z.ZodString;
    spanId: z.ZodString;
    parentSpanId: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    startTime: z.ZodOptional<z.ZodNumber>;
    endTime: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<{
        error: "error";
        running: "running";
        ok: "ok";
        cancelled: "cancelled";
    }>>;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    events: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        timestamp: z.ZodNumber;
        attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, z.core.$strip>>>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
    rev: z.ZodOptional<z.ZodNumber>;
    nodeId: z.ZodOptional<z.ZodString>;
    threadId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ExtendedSpanRequest = z.infer<typeof extendedSpanRequestSchema>;
export declare const spanQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        error: "error";
        running: "running";
        ok: "ok";
        cancelled: "cancelled";
    }>>;
    running: z.ZodOptional<z.ZodBoolean>;
    from: z.ZodOptional<z.ZodNumber>;
    to: z.ZodOptional<z.ZodNumber>;
    label: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
    sort: z.ZodDefault<z.ZodEnum<{
        startTime: "startTime";
        lastUpdate: "lastUpdate";
    }>>;
    order: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
export type SpanQuery = z.infer<typeof spanQuerySchema>;
export declare const spanResponseSchema: z.ZodObject<{
    traceId: z.ZodString;
    spanId: z.ZodString;
    parentSpanId: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    status: z.ZodEnum<{
        error: "error";
        running: "running";
        ok: "ok";
        cancelled: "cancelled";
    }>;
    startTime: z.ZodNumber;
    endTime: z.ZodOptional<z.ZodNumber>;
    completed: z.ZodBoolean;
    lastUpdate: z.ZodNumber;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    events: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        timestamp: z.ZodNumber;
        attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    }, z.core.$strip>>>;
    rev: z.ZodNumber;
    nodeId: z.ZodOptional<z.ZodString>;
    threadId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SpanResponse = z.infer<typeof spanResponseSchema>;
export declare const spanListResponseSchema: z.ZodObject<{
    spans: z.ZodArray<z.ZodObject<{
        traceId: z.ZodString;
        spanId: z.ZodString;
        parentSpanId: z.ZodOptional<z.ZodString>;
        label: z.ZodString;
        status: z.ZodEnum<{
            error: "error";
            running: "running";
            ok: "ok";
            cancelled: "cancelled";
        }>;
        startTime: z.ZodNumber;
        endTime: z.ZodOptional<z.ZodNumber>;
        completed: z.ZodBoolean;
        lastUpdate: z.ZodNumber;
        attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
        events: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            timestamp: z.ZodNumber;
            attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
        }, z.core.$strip>>>;
        rev: z.ZodNumber;
        nodeId: z.ZodOptional<z.ZodString>;
        threadId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    pagination: z.ZodObject<{
        hasMore: z.ZodBoolean;
        nextCursor: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type SpanListResponse = z.infer<typeof spanListResponseSchema>;
