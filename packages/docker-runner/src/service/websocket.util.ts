import type { RawData } from 'ws';

export type SocketOnFn = {
  (event: 'message', listener: (raw: RawData) => void | Promise<void>): void;
  (event: 'close', listener: () => void | Promise<void>): void;
  (event: string, listener: (...args: unknown[]) => void | Promise<void>): void;
};

export type WebsocketLike = {
  send: (data: string) => void;
  on: SocketOnFn;
  close?: (code?: number, reason?: string) => void;
  terminate?: () => void;
};

export type SocketStream = {
  socket: WebsocketLike;
};

const hasSocketProperty = (candidate: unknown): candidate is SocketStream => {
  return Boolean(candidate && typeof candidate === 'object' && 'socket' in (candidate as Record<string, unknown>));
};

export const getWebsocket = (stream: SocketStream | WebsocketLike): WebsocketLike => {
  if (hasSocketProperty(stream) && stream.socket) {
    return stream.socket;
  }
  return stream as WebsocketLike;
};

export const closeWebsocket = (
  stream: SocketStream | WebsocketLike | undefined,
  code?: number,
  reason?: string,
): void => {
  if (!stream) return;
  const socket = getWebsocket(stream);
  if (!socket) return;

  if (typeof socket.close === 'function') {
    try {
      socket.close(code, reason);
      return;
    } catch {
      // fall through to terminate
    }
  }

  if (typeof socket.terminate === 'function') {
    try {
      socket.terminate();
    } catch {
      // ignore terminate failures
    }
  }
};
