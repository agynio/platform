import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type LoginRecord = {
  codeVerifier: string;
  nonce: string;
  createdAt: number;
};

@Injectable()
export class LoginStateStore {
  private readonly ttlMs = 10 * 60 * 1000;
  private readonly records = new Map<string, LoginRecord>();

  create(entry: { codeVerifier: string; nonce: string }): string {
    this.evictExpired();
    const state = randomUUID();
    this.records.set(state, { ...entry, createdAt: Date.now() });
    return state;
  }

  consume(state: string | undefined | null): LoginRecord | null {
    if (!state) return null;
    const record = this.records.get(state);
    this.records.delete(state);
    if (!record) return null;
    if (Date.now() - record.createdAt > this.ttlMs) {
      return null;
    }
    return record;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [state, record] of this.records) {
      if (now - record.createdAt > this.ttlMs) {
        this.records.delete(state);
      }
    }
  }
}
