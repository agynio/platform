/**
 * Generate a random trace ID (16 bytes = 32 hex chars)
 */
export declare function generateTraceId(): string;
/**
 * Generate a random span ID (8 bytes = 16 hex chars)
 */
export declare function generateSpanId(): string;
/**
 * Generate a unique idempotency key
 */
export declare function generateIdempotencyKey(): string;
