import { SpanData, SpanStatus, SpanAttributes } from './types.js';
import { HttpClient } from './http-client.js';
export declare class Span {
    private data;
    private httpClient;
    private mode;
    private rev;
    constructor(data: SpanData, httpClient: HttpClient, mode: 'extended' | 'otlp');
    /**
     * Update span attributes
     */
    setAttributes(attributes: SpanAttributes): void;
    /**
     * Set span status
     */
    setStatus(status: SpanStatus): void;
    /**
     * Add an event to the span
     */
    addEvent(name: string, attributes?: SpanAttributes): void;
    /**
     * End the span
     */
    end(status?: SpanStatus): void;
    /**
     * Get span data (read-only)
     */
    getData(): Readonly<SpanData>;
    /**
     * Send span creation notification (extended mode only)
     */
    sendCreation(): Promise<void>;
    /**
     * Send span update notification (extended mode only)
     */
    private sendUpdate;
    /**
     * Send span completion notification (extended mode only)
     */
    private sendCompletion;
}
