import { PassThrough } from 'node:stream';

/**
 * Streaming UTF-8 decoder/collector that properly handles multibyte boundaries.
 * Optionally caps retained output to avoid unbounded memory usage.
 */
export function createUtf8Collector(limitChars?: number) {
  const decoder = new TextDecoder('utf-8');
  let text = '';
  let truncated = false;
  const cap = limitChars ?? Number.POSITIVE_INFINITY;

  const appendDecoded = (decoded: string) => {
    if (!decoded || truncated) return;
    if (text.length + decoded.length <= cap) {
      text += decoded;
      return;
    }
    const remaining = Math.max(0, cap - text.length);
    if (remaining > 0) {
      text += decoded.slice(0, remaining);
    }
    truncated = true;
  };

  return {
    append(chunk: Buffer | string) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      const decoded = decoder.decode(buf, { stream: true });
      appendDecoded(decoded);
    },
    flush() {
      const decoded = decoder.decode();
      appendDecoded(decoded);
    },
    getText() {
      return text;
    },
    isTruncated() {
      return truncated;
    },
  };
}

/**
 * Manual demux of a Docker multiplexed stream (when TTY=false).
 * Uses 8-byte headers to distribute payload to stdout/stderr.
 * Falls back to writing raw data to stdout when header looks invalid, and switches to passthrough for the remainder.
 */
export function demuxDockerMultiplex(stream: NodeJS.ReadableStream) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let buffer: Buffer | null = null;
  let passthrough = false;
  const MAX_FRAME_LEN = 64 * 1024 * 1024; // 64 MiB sanity cap

  const onData = (chunk: Buffer) => {
    if (passthrough) {
      stdout.write(chunk);
      return;
    }
    buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk;
    while (buffer && buffer.length >= 8) {
      const type = buffer[0];
      const r1 = buffer[1], r2 = buffer[2], r3 = buffer[3];
      const len = buffer.readUInt32BE(4);
      const saneHeader = (r1 | r2 | r3) === 0 && len >= 0 && len <= MAX_FRAME_LEN;
      if (!saneHeader) {
        // Not a multiplexed stream; treat the remainder as stdout and stop demuxing
        if (buffer && buffer.length) stdout.write(buffer);
        buffer = null;
        passthrough = true;
        return;
      }
      if (buffer.length < 8 + len) return; // incomplete frame
      const payload = buffer.subarray(8, 8 + len);
      if (type === 1) stdout.write(payload);
      else if (type === 2) stderr.write(payload);
      else if (type === 0) {
        // stdin frame; ignore per Docker multiplexing spec
      } else {
        // Unknown type: do not break framing; forward to stdout explicitly
        stdout.write(payload);
      }
      buffer = buffer.subarray(8 + len);
    }
  };

  stream.on('data', (c: Buffer | string) => onData(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const endBoth = () => {
    // If we have buffered bytes (partial frame/header), emit them as raw stdout
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
