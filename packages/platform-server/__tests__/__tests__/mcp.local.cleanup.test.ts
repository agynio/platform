import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServer } from '../mcp/localMcpServer.node';
import { LoggerService } from '../core/services/logger.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('LocalMCPServer.discoverTools DinD sidecar cleanup (finally)', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService();
  });

  it('stops/removes DinD sidecars and logs cleaned count', async () => {
    // Arrange: mock ContainerService with findContainersByLabels
    const stopA = vi.fn().mockResolvedValue(undefined);
    const removeA = vi.fn().mockResolvedValue(true);
    const stopB = vi.fn().mockRejectedValue({ statusCode: 304 }); // benign already stopped
    const removeB = vi.fn().mockRejectedValue({ statusCode: 404 }); // benign already removed

    const findContainersByLabels = vi.fn().mockResolvedValue([
      { stop: stopA, remove: removeA },
      { stop: stopB, remove: removeB },
    ]);

    // Minimal ContainerService stub: only methods used in this test
    const containerService: any = {
      getDocker: () => ({ /* not used due to short-circuit below */ }),
      findContainersByLabels,
      touchLastUsed: vi.fn(),
    };

    const server = new LocalMCPServer(containerService, logger);

    // Provide a container provider that returns a well-known temp id
    const tempId = 'temp-discovery-id';
    (server as any).setContainerProvider({
      provide: async (_ns: string) => ({
        id: tempId,
        stop: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await server.setConfig({ namespace: 'test', command: 'ignored' });

    // Short-circuit: fail inside the try-block (client.connect) so finally runs
    const connectSpy = vi.spyOn(Client.prototype, 'connect').mockRejectedValue(new Error('boom'));

    const infoSpy = vi.spyOn(logger, 'info');

    // Act: call discoverTools and ignore the expected error
    try {
      await server.discoverTools();
    } catch {
      // expected due to short-circuit
    }

    // Assert: DinD lookup was made with exact labels and { all: true }
    expect(findContainersByLabels).toHaveBeenCalledWith(
      { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': tempId },
      { all: true },
    );

    // stop/remove invoked on each fake sidecar
    expect(stopA).toHaveBeenCalled();
    expect(removeA).toHaveBeenCalled();
    expect(stopB).toHaveBeenCalled();
    expect(removeB).toHaveBeenCalled();

    // cleaned count should be 1 (only sidecar A removed successfully)
    const infoMsgs = infoSpy.mock.calls.map((c) => String(c[0]));
    const cleanedMsg = infoMsgs.find((m) => m.includes('Cleaned') && m.includes('DinD sidecar'));
    expect(cleanedMsg).toBeTruthy();
    expect(cleanedMsg).toMatch(/Cleaned\s+1\s+DinD sidecar/);

    // Cleanup spies
    connectSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
