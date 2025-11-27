import { describe, it, expect, vi } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { EnvService } from '../../src/env/env.service';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';

class FakeContainer {
  public lastExec: { cmd: string; env?: Record<string, string>; workdir?: string } | null = null;
  constructor(private baseEnv: Record<string, string>, private baseWd: string) {}
  async getEnv() { return { ...this.baseEnv }; }
  async exec(command: string, options?: { env?: Record<string, string>; workdir?: string }) {
    this.lastExec = { cmd: command, env: options?.env, workdir: options?.workdir };
    // Simulate env effects for validation
    const overlay = (options?.env || {}) as Record<string, string>;
    const eff: Record<string, string> = { ...this.baseEnv, ...overlay };
    const keys = ['FOO', 'BAR', 'BASE_ONLY'];
    const out = [
      `WD=${options?.workdir || this.baseWd}`,
      ...keys.map((k) => `${k}=${eff[k] ?? ''}`),
    ].join('\n');
    return { stdout: out, stderr: '', exitCode: 0 };
  }
}

class FakeProvider {
  private c = new FakeContainer({ UNSETME: '1', BASE_ONLY: '1' }, '/workspace');
  async provide(_thread: string) { return this.c as any; }
}

describe('ShellTool env/workdir isolation with vault-backed overlay', () => {
  it('applies per-node overlay and sets workdir without leaking; supports vault refs', async () => {
    const provider: any = new FakeProvider();

    const emptyReport = { events: [], counts: { total: 0, resolved: 0, unresolved: 0, cacheHits: 0, errors: 0 } };
    const resolverA = {
      resolve: vi.fn(async (input: unknown) => {
        if (!Array.isArray(input)) return { output: input, report: emptyReport };
        const list = input as Array<{ name: string; value: unknown }>;
        const output = list.map((item) =>
          item.name === 'BAR' ? { ...item, value: 'VAULTED' } : { ...item },
        );
        return { output, report: emptyReport };
      }),
    };
    const envSvc = new EnvService(resolverA as any);

    const archiveStub = { createSingleFileTar: async () => Buffer.from('tar') } as const;
    const moduleRefStub = {};
    const runEventsStub: Pick<RunEventsService, 'appendToolOutputChunk' | 'finalizeToolOutputTerminal'> = {
      appendToolOutputChunk: async (payload: unknown) => payload,
      finalizeToolOutputTerminal: async (payload: unknown) => payload,
    };
    const eventsBusStub: Pick<EventsBusService, 'emitToolOutputChunk' | 'emitToolOutputTerminal'> = {
      emitToolOutputChunk: () => undefined,
      emitToolOutputTerminal: () => undefined,
    };
    const prismaStub: Pick<PrismaService, 'getClient'> = {
      getClient: () => ({
        container: { findUnique: async () => null },
        containerEvent: { findFirst: async () => null },
      }),
    } as any;

    const createNode = (envServiceInstance: EnvService) => {
      const node = new ShellCommandNode(
        envServiceInstance as any,
        moduleRefStub as any,
        archiveStub as any,
        runEventsStub as any,
        eventsBusStub as any,
        prismaStub as any,
      );
      node.setContainerProvider(provider as any);
      return node;
    };

    const a = createNode(envSvc);
    await a.setConfig({
      env: [
        { name: 'FOO', value: 'A' },
        { name: 'BAR', value: { kind: 'vault', path: 'secret/path', key: 'KEY' } },
      ],
      workdir: '/w/a',
    });
    const resolverB = {
      resolve: vi.fn(async (input: unknown) => ({ output: input, report: emptyReport })),
    };
    const b = createNode(new EnvService(resolverB as any) as any);
    await b.setConfig({ env: [ { name: 'FOO', value: 'B' } ], workdir: '/w/b' });

    const at = a.getTool();
    const bt = b.getTool();

    const aRes = String(await at.execute({ command: 'printenv' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any));
    const bRes = String(await bt.execute({ command: 'printenv' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any));

    const parse = (s: string) => Object.fromEntries(s.trim().split('\n').map((l) => l.split('=')));
    const A = parse(aRes), B = parse(bRes);
    expect(A.WD).toBe('/w/a');
    expect(A.FOO).toBe('A');
    expect(A.BAR).toBe('VAULTED');
    expect(A.BASE_ONLY).toBe('1');
    expect(B.WD).toBe('/w/b');
    expect(B.FOO).toBe('B');
    expect(B.BAR).toBe('');
    expect(B.BASE_ONLY).toBe('1');
  });
});
