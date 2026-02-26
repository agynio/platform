import { describe, expect, it } from 'vitest';

import { ContainerService } from '../src/lib/container.service';
import { ContainerHandle } from '../src/lib/container.handle';

const TEST_IMAGE = 'ghcr.io/agynio/devcontainer:latest';
const TEST_TIMEOUT_MS = 30_000;
const CONTAINER_IDLE_CMD = ['sleep', '600'];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withBaseContainer(
  run: (ctx: { service: ContainerService; handle: ContainerHandle }) => Promise<void>,
): Promise<void> {
  const service = new ContainerService();
  const handle = await service.start({ image: TEST_IMAGE, cmd: CONTAINER_IDLE_CMD, autoRemove: true });

  try {
    await run({ service, handle });
  } finally {
    await wait(100);
    await handle.stop().catch(() => undefined);
    await handle.remove({ force: true, removeVolumes: true }).catch(() => undefined);
  }
}

describe('ContainerService openInteractiveExec (tty)', () => {
  it(
    'streams data and allows cancel via ctrl-c',
    async () => {
      await withBaseContainer(async ({ service, handle }) => {
        const session = await service.openInteractiveExec(handle.id, 'cat', { tty: true, demuxStderr: false });

        session.stdout.setEncoding('utf8');
        session.stdout.resume();

        const outputPromise = new Promise<string>((resolve) => {
          let buffer = '';
          session.stdout.on('data', (chunk: string) => {
            buffer += chunk;
            if (buffer.includes('hello from interactive')) {
              resolve(buffer);
            }
          });
        });

        session.stdin.write('hello from interactive\n');
        const echoed = await outputPromise;

        await wait(200);
        session.stdin.write('\u0003');
        await wait(300);

        const result = await session.close();
        expect(result.exitCode).toBe(130);
        expect(result.stdout).toContain('hello from interactive');
        expect(echoed).toContain('hello from interactive');
      });
    },
    TEST_TIMEOUT_MS,
  );
});
