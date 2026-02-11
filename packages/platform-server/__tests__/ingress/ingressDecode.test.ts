import { describe, expect, it } from 'vitest';

import {
  createIngressDecodeStreamState,
  decodeIngressChunk,
  flushIngressDecoder,
} from '../../src/common/ingress/ingressDecode';

describe('ingressDecode', () => {
  it('detects UTF-16LE with BOM across partial chunks', () => {
    const state = createIngressDecodeStreamState();

    const first = decodeIngressChunk(state, Buffer.from([0xff]));
    expect(first).toBe('');

    const second = decodeIngressChunk(state, Buffer.from([0xfe, 0x61, 0x00]));
    expect(second).toBe('a');

    const third = decodeIngressChunk(state, Buffer.from([0x62, 0x00]));
    expect(third).toBe('b');

    const tail = flushIngressDecoder(state);
    expect(tail).toBe('');
  });

  it('falls back to UTF-16BE heuristics when no BOM is present', () => {
    const state = createIngressDecodeStreamState();
    const buffer = Buffer.from([0x00, 0x61, 0x00, 0x62, 0x00, 0x63]);

    const decoded = decodeIngressChunk(state, buffer);
    expect(decoded).toBe('abc');

    const tail = flushIngressDecoder(state);
    expect(tail).toBe('');
  });

  it('emits buffered UTF-8 data on flush', () => {
    const state = createIngressDecodeStreamState();

    const first = decodeIngressChunk(state, Buffer.from('hel', 'utf8'));
    expect(first).toBe('hel');

    const tail = flushIngressDecoder(state);
    expect(tail).toBe('');
  });
});
