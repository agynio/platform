const DEFAULT_STABLE_FRAMES = 3;
const DEFAULT_TIMEOUT_MS = 1500;

type WaitOptions = {
  stableFrames?: number;
  timeoutMs?: number;
};

type FrameHandle = number | ReturnType<typeof setTimeout>;

function scheduleFrame(cb: FrameRequestCallback): FrameHandle {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(cb);
  }

  return setTimeout(() => {
    const now = typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
    cb(now);
  }, 16);
}

function cancelFrame(handle: FrameHandle) {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle as number);
    return;
  }

  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

async function waitForImages(container: HTMLElement, timeoutMs: number): Promise<void> {
  const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  const pending = images.filter((img) => !img.complete);
  if (pending.length === 0) return;

  const imagePromises = pending.map((img) => {
    if (typeof img.decode === 'function') {
      return img.decode().catch(() => undefined);
    }

    return new Promise<void>((resolve) => {
      const settle = () => resolve();
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
    });
  });

  await new Promise<void>((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      resolve();
    };

    Promise.allSettled(imagePromises).then(() => finish());
    timeoutId = setTimeout(finish, timeoutMs);
  });
}

export async function waitForStableScrollHeight(container: HTMLElement | null, options?: WaitOptions): Promise<void> {
  if (!container) return;

  const stableFrames = Math.max(1, options?.stableFrames ?? DEFAULT_STABLE_FRAMES);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await waitForImages(container, timeoutMs);

  await new Promise<void>((resolve) => {
    let frameHandle: FrameHandle | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let lastHeight = container.scrollHeight;
    let stableCount = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      if (frameHandle !== null) cancelFrame(frameHandle);
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      resolve();
    };

    const check = () => {
      if (!container.isConnected) {
        finish();
        return;
      }

      const currentHeight = container.scrollHeight;
      if (currentHeight === lastHeight) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }

      if (stableCount >= stableFrames) {
        finish();
      } else {
        frameHandle = scheduleFrame(check);
      }
    };

    frameHandle = scheduleFrame(check);
    timeoutHandle = setTimeout(finish, timeoutMs);
  });
}

export const waitForStableScrollDefaults = {
  stableFrames: DEFAULT_STABLE_FRAMES,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};
