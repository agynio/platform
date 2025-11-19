import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunEventsService, type ToolOutputChunkPayload, type ToolOutputTerminalPayload } from '../src/events/run-events.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { ConfigService } from '../src/core/services/config.service';

class CapturingPublisher extends NoopGraphEventsPublisher {
  public chunks: Array<Parameters<NoopGraphEventsPublisher['emitToolOutputChunk']>[0]> = [];
  public terminals: Array<Parameters<NoopGraphEventsPublisher['emitToolOutputTerminal']>[0]> = [];

  override emitToolOutputChunk(payload: Parameters<NoopGraphEventsPublisher['emitToolOutputChunk']>[0]): void {
    this.chunks.push(payload);
  }

  override emitToolOutputTerminal(payload: Parameters<NoopGraphEventsPublisher['emitToolOutputTerminal']>[0]): void {
    this.terminals.push(payload);
  }
}

const createLoggerStub = () =>
  ({
    info: () => undefined,
    debug: () => undefined,
    warn: vi.fn(),
    error: () => undefined,
  }) as unknown as LoggerService;

const baseChunkArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  seqGlobal: 1,
  seqStream: 1,
  source: 'stdout' as const,
  data: 'hello',
  bytes: 5,
};

const baseTerminalArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  exitCode: 0,
  status: 'success' as const,
  bytesStdout: 5,
  bytesStderr: 0,
  totalChunks: 1,
  droppedChunks: 0,
  savedPath: null as string | null,
  message: 'done',
};

describe('RunEventsService tool output persistence guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips persistence when disabled via config but still emits socket events', async () => {
    const logger = createLoggerStub();
    const prismaClient = {
      toolOutputChunk: { create: vi.fn() },
      toolOutputTerminal: { upsert: vi.fn() },
    } as const;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const config = { toolOutputPersistenceEnabled: false } as ConfigService;
    const publisher = new CapturingPublisher();
    const service = new RunEventsService(prismaService, logger, config, publisher);

    const chunk = await service.appendToolOutputChunk(baseChunkArgs);
    const terminal = await service.finalizeToolOutputTerminal(baseTerminalArgs);
    const snapshot = await service.getToolOutputSnapshot({ runId: 'run', eventId: 'event' });

    expect(prismaClient.toolOutputChunk.create).not.toHaveBeenCalled();
    expect(prismaClient.toolOutputTerminal.upsert).not.toHaveBeenCalled();
    expect(publisher.chunks).toHaveLength(1);
    expect(publisher.terminals).toHaveLength(1);
    expect(chunk).toMatchObject({ seqGlobal: 1, data: 'hello' });
    expect(terminal).toMatchObject({ status: 'success', message: 'done' });
    expect(snapshot).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool output persistence disabled via config; streaming output will not be stored.',
    );
  });

  it('skips persistence when Prisma client lacks tool output models', async () => {
    const logger = createLoggerStub();
    const prismaClient = {};
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const config = { toolOutputPersistenceEnabled: true } as ConfigService;
    const publisher = new CapturingPublisher();
    const service = new RunEventsService(prismaService, logger, config, publisher);

    const chunk = await service.appendToolOutputChunk(baseChunkArgs);
    const terminal = await service.finalizeToolOutputTerminal(baseTerminalArgs);
    const snapshot = await service.getToolOutputSnapshot({ runId: 'run', eventId: 'event' });

    expect(publisher.chunks).toHaveLength(1);
    expect(publisher.terminals).toHaveLength(1);
    expect(chunk.ts).toBeTypeOf('string');
    expect(terminal.droppedChunks).toBe(0);
    expect(snapshot).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool output persistence unavailable: Prisma client is missing tool output models. Streaming output will not be stored.',
    );
  });

  it('reports persistence availability state', () => {
    const logger = createLoggerStub();
    const prismaClient = {
      toolOutputChunk: { create: vi.fn() },
      toolOutputTerminal: { upsert: vi.fn() },
    } as const;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const publisher = new CapturingPublisher();

    const disabledConfig = { toolOutputPersistenceEnabled: false } as ConfigService;
    const disabledService = new RunEventsService(prismaService, logger, disabledConfig, publisher);
    expect(disabledService.isToolOutputPersistenceAvailable()).toBe(false);

    const enabledConfig = { toolOutputPersistenceEnabled: true } as ConfigService;
    const enabledService = new RunEventsService(prismaService, logger, enabledConfig, publisher);
    expect(enabledService.isToolOutputPersistenceAvailable()).toBe(true);
  });
});
