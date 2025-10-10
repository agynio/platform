import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServer } from '../mcp/localMcpServer';

class MockLogger { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }

describe('LocalMCPServer env/unset isolation and workdir', () => {
  let server: LocalMCPServer;
  let logger: any;
  let captured: any[] = [];

  beforeEach(() => {
    captured = [];
    logger = new MockLogger();
    const docker: any = {
      modem: { demuxStream: (_s: any, _o: any, _e: any) => {} },
      getContainer: (_: string) => ({
        exec: async (opts: any) => {
          captured.push(opts);
          return {
            start: (_o: any, cb: any) => {
              const { PassThrough } = require('node:stream');
              const stream = new PassThrough();
              setTimeout(() => stream.end(), 1);
              cb(undefined, stream);
            },
            inspect: async () => ({ ExitCode: 0 }),
          };
        },
      }),
    };
    const cs: any = { getDocker: () => docker };
    server = new LocalMCPServer(cs, logger as any);
    (server as any).setContainerProvider({ provide: async (id: string) => ({ id }) });
  });

  it('passes Env, prefixes unset for discovery and per-call, without persistence', async () => {
    await server.setConfig({ namespace: 'x', command: 'mcp start --stdio', env: { A: '1', B: '2' }, unset: ['Z'], workdir: '/w' } as any);
    // Discovery
    try { await server.discoverTools(); } catch {}
    // Simulate discovered tool for call
    (server as any).toolsCache = [{ name: 'echo' }];
    (server as any).toolsDiscovered = true;
    try { await server.callTool('echo', { t: 'hi' }, { threadId: 'th' }); } catch {}

    expect(captured.length).toBeGreaterThanOrEqual(2); // discovery + call
    for (const o of captured) {
      const cmd = (o.Cmd || []).join(' ');
      expect(cmd).toContain('sh -lc');
      expect(cmd).toContain('unset Z;');
      const env: string[] = o.Env || [];
      expect(env).toEqual(expect.arrayContaining(['A=1','B=2']));
      expect(o.WorkingDir).toBe('/w');
    }
  });
});

