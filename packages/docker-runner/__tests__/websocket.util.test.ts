import { describe, expect, it, vi } from 'vitest';

import { closeWebsocket, getWebsocket } from '../src/service/websocket.util';

describe('websocket utilities', () => {
  it('prefers native close when available', () => {
    const close = vi.fn();
    const socket = { send: vi.fn(), on: vi.fn(), close };

    closeWebsocket(socket, 4000, 'invalid_query');

    expect(close).toHaveBeenCalledWith(4000, 'invalid_query');
  });

  it('falls back to terminate when close is missing or throws', () => {
    const terminate = vi.fn();
    const throwingClose = vi.fn(() => {
      throw new Error('boom');
    });
    const socket = { send: vi.fn(), on: vi.fn(), close: throwingClose, terminate };

    closeWebsocket(socket);

    expect(throwingClose).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('unwraps socket streams before closing', () => {
    const close = vi.fn();
    const stream = { socket: { send: vi.fn(), on: vi.fn(), close } };

    const unwrapped = getWebsocket(stream);
    expect(unwrapped).toBe(stream.socket);

    closeWebsocket(stream);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('silently ignores sockets without close/terminate', () => {
    const socket = { send: vi.fn(), on: vi.fn() } as const;

    expect(() => closeWebsocket(socket)).not.toThrow();
  });
});
