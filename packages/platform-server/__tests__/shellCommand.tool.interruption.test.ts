import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ShellCommandTool } from '../src/nodes/tools/shell_command/shell_command.tool';
import type { ArchiveService } from '../src/infra/archive/archive.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { RunEventsService } from '../src/events/run-events.service';
import type { EventsBusService } from '../src/events/events-bus.service';
import type { LoggerService } from '../src/core/services/logger.service';

class StubArchiveService {
  async createSingleFileTar(): Promise<never> {
    throw new Error('not implemented');
  }
}

class FakePrismaClient {
  constructor(private readonly data: { container?: unknown; event?: unknown }) {}

  container = {
    findUnique: async () => {
      return this.data.container ?? null;
    },
  };

  containerEvent = {
    findFirst: async () => {
      return this.data.event ?? null;
    },
  };
}

class FakePrismaService {
  constructor(private readonly client: FakePrismaClient) {}
  getClient(): PrismaClient {
    return this.client as unknown as PrismaClient;
  }
}

const makeTool = (data: { container?: unknown; event?: unknown }) => {
  const prismaService = new FakePrismaService(new FakePrismaClient(data));
  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as unknown as LoggerService;
  return new ShellCommandTool(
    new StubArchiveService() as unknown as ArchiveService,
    {} as unknown as RunEventsService,
    {} as unknown as EventsBusService,
    logger,
    prismaService as unknown as PrismaService,
  );
};

describe('ShellCommandTool interruption messaging', () => {
  it('builds detailed interruption message when event is available', async () => {
    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    const tool = makeTool({
      container: { id: 7, dockerContainerId: 'docker-1234567890', threadId: '00000000-0000-0000-0000-000000000001' },
      event: {
        createdAt,
        reason: 'SIGKILL',
        exitCode: 137,
        signal: 'SIGKILL',
        message: 'die',
      },
    });

    const message = await (tool as unknown as { buildInterruptionMessage(id: string): Promise<string> }).buildInterruptionMessage('cid');
    expect(message).toContain('workspace container reported SIGKILL');
    expect(message).toContain(createdAt.toISOString());
    expect(message).toContain('exitCode=137');
    expect(message).toContain('signal=SIGKILL');
    expect(message).toContain('dockerId=docker-12345');
    expect(message).toContain('threadId=00000000-0000-0000-0000-000000000001');
    expect(message).toContain('Docker message: die');
  });

  it('falls back to generic message when no event found', async () => {
    const tool = makeTool({ container: { id: 7, dockerContainerId: 'docker-1234567890', threadId: null }, event: null });
    const message = await (tool as unknown as { buildInterruptionMessage(id: string): Promise<string> }).buildInterruptionMessage('cid');
    expect(message).toContain('No Docker termination event was recorded');
  });

  it('detects interruption error codes and messages', () => {
    const tool = makeTool({});
    const isInterruption = (tool as unknown as { isConnectionInterruption(err: unknown): boolean }).isConnectionInterruption({ code: 'ECONNRESET' });
    expect(isInterruption).toBe(true);

    const isChannelClosed = (tool as unknown as { isConnectionInterruption(err: unknown): boolean }).isConnectionInterruption(new Error('Channel closed unexpectedly'));
    expect(isChannelClosed).toBe(true);

    const isOther = (tool as unknown as { isConnectionInterruption(err: unknown): boolean }).isConnectionInterruption(new Error('timeout'));
    expect(isOther).toBe(false);
  });
});
