import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';

import { CallToolsLLMReducer } from '../../src/llm/reducers/callTools.llm.reducer';
import { Signal } from '../../src/signal';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import type { EnvService } from '../../src/env/env.service';
import type { ArchiveService } from '../../src/infra/archive/archive.service';
import type { ContainerHandle } from '@agyn/docker-runner';
import { createRunEventsStub, createEventsBusStub } from '../helpers/runEvents.stub';

class StreamingFallbackContainer implements ContainerHandle {
  async exec(
    _command: string,
    options?: {
      onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const chunk = Buffer.from('Y'.repeat(200_000));
    options?.onOutput?.('stdout', chunk);
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  async putArchive(_data: Buffer | NodeJS.ReadableStream, _options: { path: string }): Promise<void> {
    /* noop for test */
  }
}

class StreamingFallbackProvider {
  public readonly container = new StreamingFallbackContainer();

  async provide(_threadId: string): Promise<ContainerHandle> {
    return this.container;
  }
}

describe('ShellCommandTool streaming fallback when startToolExecution fails', () => {
  it('keeps streaming and records diagnostics when event start is unavailable', async () => {
    const archiveStub = {
      createSingleFileTar: vi.fn(async (_filename: string, content: string, mode: number) => {
        return Buffer.from(`tar-${content.length}-${mode}`);
      }),
    } satisfies Pick<ArchiveService, 'createSingleFileTar'>;

    const baseRunEvents = createRunEventsStub();
    const startToolExecution = vi.fn(async () => {
      throw new Error('run-events unavailable');
    });
    const appendToolOutputChunk = vi.fn(async () => {
      throw new Error('appendToolOutputChunk should not be called without event');
    });
    const finalizeToolOutputTerminal = vi.fn(async () => {
      throw new Error('finalizeToolOutputTerminal should not be called without event');
    });

    const runEvents: RunEventsService = {
      ...baseRunEvents,
      startToolExecution,
      appendToolOutputChunk,
      finalizeToolOutputTerminal,
    } as unknown as RunEventsService;

    const eventsBus = createEventsBusStub();

    const prismaStub = {
      getClient: () => ({
        container: { findUnique: vi.fn(async () => null) },
        containerEvent: { findFirst: vi.fn(async () => null) },
      }),
    } as unknown as PrismaService;

    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: ModuleRef, useValue: { create: (Cls: new (...args: any[]) => any) => new Cls() } },
        { provide: 'EnvService', useValue: { resolveProviderEnv: async () => ({}) } as Pick<EnvService, 'resolveProviderEnv'> },
        { provide: 'ArchiveService', useValue: archiveStub },
        { provide: RunEventsService, useValue: runEvents },
        { provide: EventsBusService, useValue: eventsBus },
        { provide: PrismaService, useValue: prismaStub },
        {
          provide: ShellCommandNode,
          useFactory: (
            env: EnvService,
            moduleRef: ModuleRef,
            archive: ArchiveService,
            runEventsService: RunEventsService,
            eventsBusService: EventsBusService,
            prisma: PrismaService,
          ) => new ShellCommandNode(env, moduleRef, archive, runEventsService, eventsBusService, prisma),
          inject: ['EnvService', ModuleRef, 'ArchiveService', RunEventsService, EventsBusService, PrismaService],
        },
      ],
    }).compile();

    const node = await testingModule.resolve(ShellCommandNode);
    const provider = new StreamingFallbackProvider();
    node.setContainerProvider(provider as any);

    await node.setConfig({
      env: [],
      executionTimeoutMs: 300_000,
      idleTimeoutMs: 60_000,
      workdir: '/workspace',
      outputLimitChars: 50_000,
    } as any);

    const tool = node.getTool();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool] });

    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    const streamingSpy = vi.spyOn(tool, 'executeStreaming');

    const callMessage = new ToolCallMessage({
      type: 'function_call',
      call_id: 'call-streaming-fallback',
      name: tool.name,
      arguments: JSON.stringify({ command: 'yes Y | head -c 200000' }),
    } as any);

    const response = new ResponseMessage({ output: [callMessage.toPlain() as any] } as any);
    const state = {
      messages: [response],
      context: { messageIds: [], memory: [] },
      meta: { lastLLMEventId: 'evt-shell' },
    } as any;

    const ctx = {
      threadId: 'thread-fallback',
      runId: 'run-fallback',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-shell' },
    } as const;

    try {
      const result = await reducer.invoke(state, ctx);
      const message = result.messages.at(-1) as ToolCallOutputMessage;

      expect(message).toBeInstanceOf(ToolCallOutputMessage);
      expect(message.text).toContain('Output truncated after 50000 characters.');
      expect(message.text).toContain('Full output saved to /tmp/');
      expect(message.text).not.toContain('TOOL_OUTPUT_TOO_LARGE');

      expect(startToolExecution).toHaveBeenCalledTimes(1);
      expect(streamingSpy).toHaveBeenCalledTimes(1);
      const streamingArgs = streamingSpy.mock.calls[0] ?? [];
      expect(streamingArgs[2]?.eventId).toBeUndefined();

      expect(appendToolOutputChunk).not.toHaveBeenCalled();
      expect(finalizeToolOutputTerminal).not.toHaveBeenCalled();

      const warnMessages = warnSpy.mock.calls.map(([msg]) => String(msg));
      expect(warnMessages.some((msg) => msg.includes('streaming fallback without persisted event'))).toBe(true);
    } finally {
      streamingSpy.mockRestore();
      warnSpy.mockRestore();
      await testingModule.close();
    }
  });
});
