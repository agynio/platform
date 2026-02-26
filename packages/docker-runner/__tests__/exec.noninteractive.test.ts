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

describe('ContainerService execContainer (non-interactive)', () => {
  it(
    'runs echo commands without tty involvement',
    async () => {
      await withBaseContainer(async ({ service, handle }) => {
        const result = await service.execContainer(handle.id, 'echo integration-echo');
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout.trim()).toBe('integration-echo');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'preserves NOINPUT parity when stdin is empty',
    async () => {
      await withBaseContainer(async ({ service, handle }) => {
        const script = "if IFS= read -r line; then printf '%s' \"$line\"; else printf 'NOINPUT'; fi";
        const result = await service.execContainer(handle.id, script);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout.trim()).toBe('NOINPUT');
      });
    },
    TEST_TIMEOUT_MS,
  );
});
