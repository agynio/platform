import { SpanData } from './types.js';
interface SpanContext {
    traceId: string;
    spanId: string;
    span: SpanData;
}
export declare class ContextManager {
    private storage;
    /**
     * Run a function within a span context
     */
    runWithSpan<T>(span: SpanData, fn: () => T): T;
    /**
     * Get the current active span context
     */
    getCurrentContext(): SpanContext | undefined;
    /**
     * Get the current active span
     */
    getCurrentSpan(): SpanData | undefined;
    /**
     * Get the current trace ID
     */
    getCurrentTraceId(): string | undefined;
    /**
     * Get the current span ID (to use as parent for new spans)
     */
    getCurrentSpanId(): string | undefined;
}
export {};
