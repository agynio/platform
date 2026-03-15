type Chunk = Buffer | string | ArrayBuffer | Uint8Array | null | undefined;

type DockerEvent = Record<string, unknown>;

export type DockerEventsParserOptions = {
  onError?: (payload: string, error: unknown) => void;
};

export type DockerEventsParser = {
  handleChunk: (chunk: Chunk) => void;
  flush: () => void;
};

const chunkToString = (chunk: Chunk): string => {
  if (!chunk) return '';
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8');
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk).toString('utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8');
  return String(chunk);
};

const drainBuffer = (
  buffer: string,
  emit: (event: DockerEvent) => void,
  options?: DockerEventsParserOptions,
  force = false,
): { buffer: string } => {
  let rest = buffer;
  while (true) {
    const newlineIdx = rest.indexOf('\n');
    if (newlineIdx === -1) break;
    const raw = rest.slice(0, newlineIdx).trim();
    rest = rest.slice(newlineIdx + 1);
    if (!raw) continue;
    try {
      emit(JSON.parse(raw));
    } catch (error) {
      options?.onError?.(raw, error);
    }
  }
  if (force) {
    const trailing = rest.trim();
    rest = '';
    if (trailing) {
      try {
        emit(JSON.parse(trailing));
      } catch (error) {
        options?.onError?.(trailing, error);
      }
    }
  }
  return { buffer: rest };
};

export const createDockerEventsParser = (
  emit: (event: DockerEvent) => void,
  options?: DockerEventsParserOptions,
): DockerEventsParser => {
  let buffer = '';
  const handleChunk = (chunk: Chunk) => {
    if (!chunk) return;
    buffer += chunkToString(chunk);
    ({ buffer } = drainBuffer(buffer, emit, options));
  };
  const flush = () => {
    ({ buffer } = drainBuffer(buffer, emit, options, true));
  };
  return { handleChunk, flush };
};
