import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../../src/llm/reducers/callTools.llm.reducer';
import { Signal } from '../../src/signal';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import { createRunEventsStub, createEventsBusStub } from '../helpers/runEvents.stub';
import type { EnvService } from '../../src/env/env.service';
import type { ArchiveService } from '../../src/infra/archive/archive.service';
import type { ContainerHandle } from '../../src/infra/container/container.handle';

class FakeContainer implements ContainerHandle {
  public lastPut?: { data: Buffer; options: { path: string } };

  async exec(
    _cmd: string,
    opts?: {
      onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const chunk = Buffer.from('X'.repeat(200_000));
    opts?.onOutput?.('stdout', chunk);
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  async putArchive(data: Buffer | NodeJS.ReadableStream, options: { path: string }): Promise<void> {
    if (Buffer.isBuffer(data)) {
      this.lastPut = { data, options };
      return;
    }

    const chunks: Buffer[] = [];
    for await (const part of data) {
      chunks.push(typeof part === 'string' ? Buffer.from(part) : Buffer.from(part));
    }
    this.lastPut = { data: Buffer.concat(chunks), options };
  }
}

class FakeProvider {
  public readonly container = new FakeContainer();

  async provide(_threadId: string): Promise<ContainerHandle> {
    return this.container;
  }
}

describe('ShellCommandTool numeric config spillover integration', () => {
  it('streams oversized output with numeric config and truncates via reducer pipeline', async () => {
    const archiveStub = {
      createSingleFileTar: vi.fn(async (_filename: string, content: string, mode: number) => {
        return Buffer.from(`tar-${content.length}-${mode}`);
      }),
    } satisfies Pick<ArchiveService, 'createSingleFileTar'>;

    const finalizeToolOutputTerminal = vi.fn(async (payload: any) => payload);
    const appendToolOutputChunk = vi.fn(async (payload: any) => payload);

    const baseRunEvents = createRunEventsStub();
    const runEvents: RunEventsService = {
      ...baseRunEvents,
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
    const provider = new FakeProvider();
    node.setContainerProvider(provider as any);

    await node.setConfig({
      env: [],
      executionTimeoutMs: 300_000,
      idleTimeoutMs: 60_000,
      workdir: '/workspace',
      outputLimitChars: '50000',
    } as any);

    const tool = node.getTool();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool] });

    const callMessage = new ToolCallMessage({
      type: 'function_call',
      call_id: 'call-oversize',
      name: tool.name,
      arguments: JSON.stringify({ command: 'yes X | head -c 200000' }),
    } as any);

    const response = new ResponseMessage({ output: [callMessage.toPlain() as any] } as any);
    const state = {
      messages: [response],
      context: { messageIds: [], memory: [] },
      meta: { lastLLMEventId: 'evt-shell' },
    } as any;

    const ctx = {
      threadId: 'thread-shell',
      runId: 'run-shell',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-node-id' },
    } as const;

    const result = await reducer.invoke(state, ctx);

    const message = result.messages.at(-1) as ToolCallOutputMessage;
    expect(message).toBeInstanceOf(ToolCallOutputMessage);
    expect(message.text).toContain('Full output saved to /tmp/');
    expect(message.text.length).toBeLessThan(5_000);
    expect(message.text).not.toContain('TOOL_OUTPUT_TOO_LARGE');

    expect(finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const [terminalPayload] = finalizeToolOutputTerminal.mock.calls[0];
    expect(terminalPayload.savedPath).toMatch(/^\/tmp\/[0-9a-f-]{36}\.txt$/i);
    expect(terminalPayload.message).toContain('Full output saved to /tmp/');

    expect(provider.container.lastPut?.options.path).toBe('/tmp');
    expect(provider.container.lastPut?.data).toBeInstanceOf(Buffer);
  });
});
