import { PassThrough, Writable } from 'node:stream';

/**
 * Streaming UTF-8 decoder/collector that properly handles multibyte boundaries.
 */
export function createUtf8Collector() {
  const decoder = new TextDecoder('utf-8');
  let text = '';
  return {
    append(chunk: Buffer | string) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      text += decoder.decode(buf, { stream: true });
    },
    flush() {
      text += decoder.decode();
    },
    getText() {
      return text;
    },
  };
}

/**
 * Writable that forwards chunks to an append function (Buffer guaranteed).
 */
export function createAppendWritable(append: (chunk: Buffer) => void): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      try {
        append(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      } catch (e) {
        cb(e as Error);
      }
    },
  });
}

/**
 * Manual demux of a Docker multiplexed stream (when TTY=false).
 * Uses 8-byte headers to distribute payload to stdout/stderr.
 * Falls back to writing raw data to stdout when header looks invalid.
 */
export function demuxDockerMultiplex(stream: NodeJS.ReadableStream) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let buffer: Buffer | null = null;

  const onData = (chunk: Buffer) => {
    buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk;
    while (buffer && buffer.length >= 8) {
      const type = buffer[0];
      const r1 = buffer[1], r2 = buffer[2], r3 = buffer[3];
      const len = buffer.readUInt32BE(4);
      const saneHeader = (r1 | r2 | r3) === 0 && len >= 0 && len <= 64 * 1024 * 1024;
      if (!saneHeader) {
        // Not a multiplexed stream; treat the remainder as stdout and stop demuxing
        stdout.write(buffer);
        buffer = null;
        return;
      }
      if (buffer.length < 8 + len) return; // incomplete frame
      const payload = buffer.subarray(8, 8 + len);
      if (type === 1) stdout.write(payload);
      else if (type === 2) stderr.write(payload);
      // 0 denotes stdin; ignore
      buffer = buffer.subarray(8 + len);
    }
  };

  stream.on('data', (c: Buffer | string) => onData(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const endBoth = () => {
    if (buffer && buffer.length) stdout.write(buffer);
    stdout.end();
    stderr.end();
  };
  stream.on('end', endBoth);
  stream.on('close', endBoth);
  stream.on('error', (e) => {
    stdout.emit('error', e);
    stderr.emit('error', e);
  });

  return { stdout, stderr };
}

