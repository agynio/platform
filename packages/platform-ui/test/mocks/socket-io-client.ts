// Typed no-op socket.io-client stub for tests
export type Handler = (...args: unknown[]) => void;
export type FakeSocket = {
  on: (event: string, cb: Handler) => FakeSocket;
  off: (event: string, cb?: Handler) => FakeSocket;
  emit: (event: string, ...args: unknown[]) => boolean;
  connect: () => FakeSocket;
  disconnect: () => void;
  close: () => void;
};

export function io(_url?: string, _opts?: unknown): FakeSocket {
  const sock: FakeSocket = {
    on: (_event, _cb) => sock,
    off: (_event, _cb) => sock,
    emit: (_event, ..._args) => true,
    connect: () => sock,
    disconnect: () => {},
    close: () => {},
  };
  return sock;
}
