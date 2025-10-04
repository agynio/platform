import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildServer } from '../index.js';
import type { FastifyInstance } from 'fastify';

describe('Observability Server E2E', () => {
  let mongod: MongoMemoryServer;
  let server: FastifyInstance;
  let mongoUrl: string;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongod = await MongoMemoryServer.create();
    mongoUrl = mongod.getUri();

    // Set environment for server
    process.env.MONGO_URL = mongoUrl;
    process.env.PORT = '0'; // Use random available port
    process.env.LOG_LEVEL = 'silent';

    // Build and start server
    const { fastify } = await buildServer();
    server = fastify;
    await server.ready();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('should respond to health checks', async () => {
    const healthResponse = await server.inject({
      method: 'GET',
      url: '/healthz',
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(JSON.parse(healthResponse.payload)).toEqual({ status: 'ok' });

    const readyResponse = await server.inject({
      method: 'GET',
      url: '/readyz',
    });
    expect(readyResponse.statusCode).toBe(200);
    expect(JSON.parse(readyResponse.payload)).toEqual({ status: 'ready' });
  });

  it('should create and retrieve spans via extended API', async () => {
    const traceId = 'trace-123';
    const spanId = 'span-456';
    
    // Create span
    const createResponse = await server.inject({
      method: 'POST',
      url: '/v1/spans/upsert',
      payload: {
        state: 'created',
        traceId,
        spanId,
        label: 'Test Span',
        status: 'running',
        startTime: Date.now(),
        attributes: {
          testAttribute: 'value',
          number: 42,
          boolean: true,
        },
        idempotencyKey: 'create-123',
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const createResult = JSON.parse(createResponse.payload);
    expect(createResult).toEqual({ success: true, spanId });

    // Update span
    const updateResponse = await server.inject({
      method: 'POST',
      url: '/v1/spans/upsert',
      payload: {
        state: 'updated',
        traceId,
        spanId,
        status: 'running',
        attributes: {
          updatedAttribute: 'newValue',
        },
        events: [
          {
            name: 'test-event',
            timestamp: Date.now(),
            attributes: { eventData: 'test' },
          },
        ],
        idempotencyKey: 'update-123',
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    // Complete span
    const completeResponse = await server.inject({
      method: 'POST',
      url: '/v1/spans/upsert',
      payload: {
        state: 'completed',
        traceId,
        spanId,
        status: 'ok',
        endTime: Date.now(),
        idempotencyKey: 'complete-123',
      },
    });

    expect(completeResponse.statusCode).toBe(200);

    // Retrieve span
    const getResponse = await server.inject({
      method: 'GET',
      url: `/v1/spans/${traceId}/${spanId}`,
    });

    expect(getResponse.statusCode).toBe(200);
    const span = JSON.parse(getResponse.payload);
    expect(span).toMatchObject({
      traceId,
      spanId,
      label: 'Test Span',
      status: 'ok',
      completed: true,
      attributes: {
        testAttribute: 'value',
        number: 42,
        boolean: true,
        updatedAttribute: 'newValue',
      },
    });
    expect(span.events).toHaveLength(1);
    expect(span.events[0]).toMatchObject({
      name: 'test-event',
      attributes: { eventData: 'test' },
    });
  });

  it('should query spans with filters', async () => {
    const baseTime = Date.now();
    
    // Create multiple spans
    const spans = [
      { traceId: 'trace-1', spanId: 'span-1', status: 'running', label: 'Running Span' },
      { traceId: 'trace-2', spanId: 'span-2', status: 'ok', label: 'Completed Span' },
      { traceId: 'trace-3', spanId: 'span-3', status: 'error', label: 'Failed Span' },
    ];

    for (const span of spans) {
      await server.inject({
        method: 'POST',
        url: '/v1/spans/upsert',
        payload: {
          state: 'created',
          ...span,
          startTime: baseTime,
        },
      });

      if (span.status !== 'running') {
        await server.inject({
          method: 'POST',
          url: '/v1/spans/upsert',
          payload: {
            state: 'completed',
            traceId: span.traceId,
            spanId: span.spanId,
            status: span.status,
            endTime: baseTime + 1000,
          },
        });
      }
    }

    // Query all spans
    const allResponse = await server.inject({
      method: 'GET',
      url: '/v1/spans',
    });
    expect(allResponse.statusCode).toBe(200);
    const allResult = JSON.parse(allResponse.payload);
    expect(allResult.spans).toHaveLength(4); // 3 new + 1 from previous test

    // Query running spans only
    const runningResponse = await server.inject({
      method: 'GET',
      url: '/v1/spans?running=true',
    });
    expect(runningResponse.statusCode).toBe(200);
    const runningResult = JSON.parse(runningResponse.payload);
    expect(runningResult.spans).toHaveLength(1);
    expect(runningResult.spans[0].status).toBe('running');

    // Query by status
    const errorResponse = await server.inject({
      method: 'GET',
      url: '/v1/spans?status=error',
    });
    expect(errorResponse.statusCode).toBe(200);
    const errorResult = JSON.parse(errorResponse.payload);
    expect(errorResult.spans).toHaveLength(1);
    expect(errorResult.spans[0].status).toBe('error');

    // Query by label pattern
    const labelResponse = await server.inject({
      method: 'GET',
      url: '/v1/spans?label=Failed',
    });
    expect(labelResponse.statusCode).toBe(200);
    const labelResult = JSON.parse(labelResponse.payload);
    expect(labelResult.spans).toHaveLength(1);
    expect(labelResult.spans[0].label).toBe('Failed Span');
  });

  it('should handle OTLP endpoint', async () => {
    const otlpResponse = await server.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: Buffer.from('mock-protobuf-data'),
      headers: {
        'content-type': 'application/x-protobuf',
      },
    });

    expect(otlpResponse.statusCode).toBe(200);
    expect(JSON.parse(otlpResponse.payload)).toEqual({ success: true });
  });

  it('should handle errors gracefully', async () => {
    // Missing required fields
    const invalidResponse = await server.inject({
      method: 'POST',
      url: '/v1/spans/upsert',
      payload: {
        state: 'created',
        traceId: 'trace-bad',
        // spanId missing
      },
    });
    expect(invalidResponse.statusCode).toBe(400);

    // Span not found
    const notFoundResponse = await server.inject({
      method: 'GET',
      url: '/v1/spans/nonexistent/span',
    });
    expect(notFoundResponse.statusCode).toBe(404);
  });

  it('should handle idempotency', async () => {
    const traceId = 'trace-idempotent';
    const spanId = 'span-idempotent';
    const idempotencyKey = 'same-key-123';

    // First request
    const firstResponse = await server.inject({
      method: 'POST',
      url: '/v1/spans/upsert',
      payload: {
        state: 'created',
        traceId,
        spanId,
        label: 'Idempotent Span',
        status: 'running',
        startTime: Date.now(),
        idempotencyKey,
      },
    });
    expect(firstResponse.statusCode).toBe(200);

    // Duplicate request with same idempotency key
    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/v1/spans/upsert',
      payload: {
        state: 'created',
        traceId,
        spanId,
        label: 'Idempotent Span',
        status: 'running',
        startTime: Date.now(),
        idempotencyKey,
      },
    });
    expect(duplicateResponse.statusCode).toBe(200);

    // Should still only have one span
    const getResponse = await server.inject({
      method: 'GET',
      url: `/v1/spans/${traceId}/${spanId}`,
    });
    expect(getResponse.statusCode).toBe(200);
  });
});