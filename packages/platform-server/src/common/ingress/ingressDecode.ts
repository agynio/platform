import iconv from 'iconv-lite';
import type { Decoder } from 'iconv-lite';

export type IngressDecoderEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

export type IngressDecodeStreamState = {
  encoding: IngressDecoderEncoding;
  decoder: Decoder;
  inspected: boolean;
  pending: Buffer | null;
};

type DecodeOptions = {
  onEncodingChange?: (encoding: IngressDecoderEncoding) => void;
};

const MIN_SAMPLE_BYTES = 4;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

export function createIngressDecodeStreamState(): IngressDecodeStreamState {
  return {
    encoding: 'utf-8',
    decoder: createDecoder('utf-8'),
    inspected: false,
    pending: null,
  };
}

export function decodeIngressChunk(
  state: IngressDecodeStreamState,
  chunk: Buffer,
  options?: DecodeOptions,
): string {
  if (!chunk || chunk.length === 0) return '';

  let buffer = chunk;
  if (!state.inspected) {
    buffer = state.pending ? Buffer.concat([state.pending, chunk]) : chunk;
    const detection = detectEncoding(buffer);
    if (!detection && buffer.length < MIN_SAMPLE_BYTES) {
      state.pending = buffer;
      return '';
    }
    state.pending = null;
    state.inspected = true;
    if (detection) {
      if (detection.encoding !== state.encoding) {
        state.encoding = detection.encoding;
        state.decoder = createDecoder(detection.encoding);
        options?.onEncodingChange?.(detection.encoding);
      }
      if (detection.bomBytes > 0) {
        buffer = buffer.subarray(detection.bomBytes);
      }
    }
  }

  if (!buffer.length) return '';
  return state.decoder.write(buffer);
}

export function flushIngressDecoder(state: IngressDecodeStreamState): string {
  let output = '';
  if (!state.inspected && state.pending) {
    output += state.decoder.write(state.pending);
    state.pending = null;
    state.inspected = true;
  }
  output += state.decoder.end();
  return output;
}

function createDecoder(encoding: IngressDecoderEncoding): Decoder {
  return iconv.getDecoder(encoding, { stripBOM: false });
}

function detectEncoding(buffer: Buffer): { encoding: IngressDecoderEncoding; bomBytes: number } | null {
  if (buffer.length >= UTF8_BOM.length && buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    return { encoding: 'utf-8', bomBytes: UTF8_BOM.length };
  }
  if (buffer.length >= UTF16LE_BOM.length && buffer.subarray(0, UTF16LE_BOM.length).equals(UTF16LE_BOM)) {
    return { encoding: 'utf-16le', bomBytes: UTF16LE_BOM.length };
  }
  if (buffer.length >= UTF16BE_BOM.length && buffer.subarray(0, UTF16BE_BOM.length).equals(UTF16BE_BOM)) {
    return { encoding: 'utf-16be', bomBytes: UTF16BE_BOM.length };
  }

  const heuristic = detectBomlessUtf16(buffer);
  if (heuristic) {
    return { encoding: heuristic, bomBytes: 0 };
  }

  return null;
}

function detectBomlessUtf16(buffer: Buffer): IngressDecoderEncoding | null {
  const sampleLength = Math.min(buffer.length, 64);
  if (sampleLength < MIN_SAMPLE_BYTES) return null;

  let evenNulls = 0;
  let oddNulls = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] !== 0) continue;
    if (i % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  const threshold = Math.max(1, Math.floor(sampleLength / 4));
  const noiseCeiling = Math.max(0, Math.floor(sampleLength / 32));

  if (oddNulls >= threshold && evenNulls <= noiseCeiling) {
    return 'utf-16le';
  }
  if (evenNulls >= threshold && oddNulls <= noiseCeiling) {
    return 'utf-16be';
  }
  return null;
}
