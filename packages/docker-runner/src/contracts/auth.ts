import crypto from 'node:crypto';
import { canonicalJsonStringify } from './json.js';

export type SignatureHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
};

const HEADER_TIMESTAMP = 'x-dr-timestamp';
const HEADER_NONCE = 'x-dr-nonce';
const HEADER_SIGNATURE = 'x-dr-signature';

export const REQUIRED_HEADERS = [HEADER_TIMESTAMP, HEADER_NONCE, HEADER_SIGNATURE];

export function hashBody(body: string | Buffer): string {
  const data = typeof body === 'string' ? Buffer.from(body) : body;
  return crypto.createHash('sha256').update(data).digest('base64');
}

export function buildSignaturePayload(parts: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}): string {
  return `${parts.method.toUpperCase()}\n${parts.path}\n${parts.timestamp}\n${parts.nonce}\n${parts.bodyHash}`;
}

export function signPayload(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

export function canonicalBodyString(body: unknown): string {
  if (body === undefined || body === null || body === '') return '';
  if (typeof body === 'string') return body;
  return canonicalJsonStringify(body);
}

export type NonceCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
};

export class NonceCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly store = new Map<string, number>();

  constructor(options: NonceCacheOptions = {}) {
    this.ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : 60_000;
    this.maxEntries = typeof options.maxEntries === 'number' ? options.maxEntries : 1000;
  }

  has(nonce: string): boolean {
    this.evictExpired();
    return this.store.has(nonce);
  }

  add(nonce: string): void {
    this.evictExpired();
    if (this.store.size >= this.maxEntries) {
      const [firstKey] = this.store.keys();
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(nonce, Date.now());
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [nonce, ts] of this.store.entries()) {
      if (now - ts > this.ttlMs) this.store.delete(nonce);
    }
  }
}

export type BuildHeadersInput = {
  method: string;
  path: string;
  body?: unknown;
  secret: string;
  timestamp?: number;
  nonce?: string;
};

export function buildAuthHeaders(input: BuildHeadersInput): Record<string, string> {
  const timestamp = (input.timestamp ?? Date.now()).toString();
  const nonce = input.nonce ?? crypto.randomUUID();
  const bodyString = canonicalBodyString(input.body ?? '');
  const bodyHash = hashBody(bodyString);
  const payload = buildSignaturePayload({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    bodyHash,
  });
  const signature = signPayload(input.secret, payload);
  return {
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
}

export type VerifyHeadersInput = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  body?: unknown;
  secret: string;
  clockSkewMs?: number;
  nonceCache: NonceCache;
};

export function extractHeader(headers: VerifyHeadersInput['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function verifyAuthHeaders(input: VerifyHeadersInput): { ok: boolean; code?: string; message?: string } {
  const clockSkewMs = typeof input.clockSkewMs === 'number' ? input.clockSkewMs : 60_000;
  const timestampStr = extractHeader(input.headers, HEADER_TIMESTAMP);
  const nonce = extractHeader(input.headers, HEADER_NONCE);
  const signature = extractHeader(input.headers, HEADER_SIGNATURE);
  if (!timestampStr || !nonce || !signature) {
    return { ok: false, code: 'missing_headers', message: 'Authentication headers missing' };
  }
  const timestampNum = Number(timestampStr);
  if (!Number.isFinite(timestampNum)) {
    return { ok: false, code: 'invalid_timestamp', message: 'Timestamp invalid' };
  }
  const now = Date.now();
  if (Math.abs(now - timestampNum) > clockSkewMs) {
    return { ok: false, code: 'timestamp_out_of_range', message: 'Timestamp outside allowed skew' };
  }
  if (input.nonceCache.has(nonce)) {
    return { ok: false, code: 'replayed_nonce', message: 'Nonce already used' };
  }
  const bodyString = canonicalBodyString(input.body ?? '');
  const bodyHash = hashBody(bodyString);
  const payload = buildSignaturePayload({
    method: input.method,
    path: input.path,
    timestamp: timestampStr,
    nonce,
    bodyHash,
  });
  const expectedSignature = signPayload(input.secret, payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return { ok: false, code: 'invalid_signature', message: 'Signature mismatch' };
  }
  input.nonceCache.add(nonce);
  return { ok: true };
}

export function headerNames() {
  return {
    timestamp: HEADER_TIMESTAMP,
    nonce: HEADER_NONCE,
    signature: HEADER_SIGNATURE,
  };
}
