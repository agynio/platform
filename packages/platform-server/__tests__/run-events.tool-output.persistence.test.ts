import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunEventsService } from '../src/events/run-events.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';

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
  data: 'chunk-1',
  bytes: 7,
};

const baseTerminalArgs = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
  exitCode: 0,
  status: 'success' as const,
  bytesStdout: 10,
  bytesStderr: 0,
  totalChunks: 1,
  droppedChunks: 0,
  savedPath: null as string | null,
  message: 'ok',
};

describe('RunEventsService tool output persistence resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs once and continues streaming when chunk persistence fails', async () => {
    const logger = createLoggerStub();
    const chunkError = new Error('relation "tool_output_chunk" does not exist');
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockRejectedValue(chunkError),
      },
      toolOutputTerminal: {
        upsert: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService, logger);

    const first = await service.appendToolOutputChunk(baseChunkArgs);
    const second = await service.appendToolOutputChunk({ ...baseChunkArgs, seqGlobal: 2, seqStream: 2, data: 'chunk-2' });

    expect(first.data).toBe('chunk-1');
    expect(second.data).toBe('chunk-2');
    expect(prismaClient.toolOutputChunk.create).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool output chunk persistence failed. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      expect.objectContaining({ eventId: 'event-1', runId: 'run-1' }),
    );
  });

  it('logs once and continues terminal signaling when terminal persistence fails', async () => {
    const logger = createLoggerStub();
    const terminalError = new Error('missing tool_output_terminal table');
    const prismaClient = {
      toolOutputChunk: {
        create: vi.fn().mockResolvedValue({ ...baseChunkArgs, ts: new Date() }),
      },
      toolOutputTerminal: {
        upsert: vi.fn().mockRejectedValue(terminalError),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService, logger);

    const first = await service.finalizeToolOutputTerminal(baseTerminalArgs);
    const second = await service.finalizeToolOutputTerminal({ ...baseTerminalArgs, exitCode: 1, status: 'failed' });

    expect(first.status).toBe('success');
    expect(second.status).toBe('failed');
    expect(prismaClient.toolOutputTerminal.upsert).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool output terminal persistence failed. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      expect.objectContaining({ eventId: 'event-1', runId: 'run-1' }),
    );
  });

  it('logs once and rethrows when snapshot retrieval fails', async () => {
    const logger = createLoggerStub();
    const snapshotError = new Error('tool_output_chunk not found');
    const prismaClient = {
      runEvent: {
        findUnique: vi.fn().mockRejectedValue(snapshotError),
      },
      toolOutputChunk: {
        findMany: vi.fn(),
      },
      toolOutputTerminal: {
        findUnique: vi.fn(),
      },
    } as Record<string, unknown>;
    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const service = new RunEventsService(prismaService, logger);

    await expect(
      service.getToolOutputSnapshot({ runId: 'run-1', eventId: 'event-1' }),
    ).rejects.toThrowError(snapshotError);
    await expect(
      service.getToolOutputSnapshot({ runId: 'run-1', eventId: 'event-1' }),
    ).rejects.toThrowError(snapshotError);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool output snapshot retrieval failed. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      expect.objectContaining({ eventId: 'event-1', runId: 'run-1' }),
    );
  });
});
