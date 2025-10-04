export interface SpanAttributes {
    [key: string]: string | number | boolean | undefined;
}
export interface SpanEvent {
    name: string;
    timestamp: number;
    attributes?: SpanAttributes;
}
export type SpanStatus = 'running' | 'ok' | 'error' | 'cancelled';
export interface SpanData {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    label: string;
    status: SpanStatus;
    startTime: number;
    endTime?: number;
    attributes?: SpanAttributes;
    events?: SpanEvent[];
    nodeId?: string;
    threadId?: string;
}
export interface ExtendedSpanRequest {
    state: 'created' | 'updated' | 'completed';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    label?: string;
    startTime?: number;
    endTime?: number;
    status?: SpanStatus;
    attributes?: SpanAttributes;
    events?: SpanEvent[];
    idempotencyKey?: string;
    rev?: number;
}
export interface SDKConfig {
    mode: 'extended' | 'otlp';
    endpoint?: string;
    otlpEndpoint?: string;
    batchSize?: number;
    batchTimeout?: number;
    maxRetries?: number;
    retryBackoff?: number;
    defaultAttributes?: SpanAttributes;
}
export interface WithSpanOptions {
    label: string;
    attributes?: SpanAttributes;
    nodeId?: string;
    threadId?: string;
}
