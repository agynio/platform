import { randomBytes } from 'crypto';
/**
 * Generate a random trace ID (16 bytes = 32 hex chars)
 */
export function generateTraceId() {
    return randomBytes(16).toString('hex');
}
/**
 * Generate a random span ID (8 bytes = 16 hex chars)
 */
export function generateSpanId() {
    return randomBytes(8).toString('hex');
}
/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey() {
    return `${Date.now()}-${randomBytes(4).toString('hex')}`;
}
//# sourceMappingURL=utils.js.map