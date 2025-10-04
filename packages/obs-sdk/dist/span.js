import { generateIdempotencyKey } from './utils.js';
export class Span {
    data;
    httpClient;
    mode;
    rev = 0;
    constructor(data, httpClient, mode) {
        this.data = { ...data };
        this.httpClient = httpClient;
        this.mode = mode;
    }
    /**
     * Update span attributes
     */
    setAttributes(attributes) {
        this.data.attributes = { ...this.data.attributes, ...attributes };
        if (this.mode === 'extended' && this.data.status === 'running') {
            this.sendUpdate();
        }
    }
    /**
     * Set span status
     */
    setStatus(status) {
        this.data.status = status;
        if (this.mode === 'extended' && status === 'running') {
            this.sendUpdate();
        }
    }
    /**
     * Add an event to the span
     */
    addEvent(name, attributes) {
        const event = {
            name,
            timestamp: Date.now(),
            attributes,
        };
        if (!this.data.events) {
            this.data.events = [];
        }
        this.data.events.push(event);
        if (this.mode === 'extended' && this.data.status === 'running') {
            this.sendUpdate();
        }
    }
    /**
     * End the span
     */
    end(status = 'ok') {
        this.data.status = status;
        this.data.endTime = Date.now();
        if (this.mode === 'extended') {
            this.sendCompletion();
        }
        // For OTLP mode, spans are sent in batches when the trace is complete
    }
    /**
     * Get span data (read-only)
     */
    getData() {
        return { ...this.data };
    }
    /**
     * Send span creation notification (extended mode only)
     */
    async sendCreation() {
        if (this.mode !== 'extended')
            return;
        const request = {
            state: 'created',
            traceId: this.data.traceId,
            spanId: this.data.spanId,
            parentSpanId: this.data.parentSpanId,
            label: this.data.label,
            startTime: this.data.startTime,
            status: this.data.status,
            attributes: this.data.attributes,
            idempotencyKey: generateIdempotencyKey(),
            rev: this.rev,
        };
        try {
            await this.httpClient.sendSpan(request);
        }
        catch (error) {
            // Log error but don't throw to avoid breaking user code
            console.error('Failed to send span creation:', error);
        }
    }
    /**
     * Send span update notification (extended mode only)
     */
    async sendUpdate() {
        if (this.mode !== 'extended')
            return;
        this.rev++;
        const request = {
            state: 'updated',
            traceId: this.data.traceId,
            spanId: this.data.spanId,
            status: this.data.status,
            attributes: this.data.attributes,
            events: this.data.events,
            idempotencyKey: generateIdempotencyKey(),
            rev: this.rev,
        };
        try {
            await this.httpClient.sendSpan(request);
        }
        catch (error) {
            // Log error but don't throw to avoid breaking user code
            console.error('Failed to send span update:', error);
        }
    }
    /**
     * Send span completion notification (extended mode only)
     */
    async sendCompletion() {
        if (this.mode !== 'extended')
            return;
        this.rev++;
        const request = {
            state: 'completed',
            traceId: this.data.traceId,
            spanId: this.data.spanId,
            endTime: this.data.endTime,
            status: this.data.status,
            attributes: this.data.attributes,
            events: this.data.events,
            idempotencyKey: generateIdempotencyKey(),
            rev: this.rev,
        };
        try {
            await this.httpClient.sendSpan(request);
        }
        catch (error) {
            // Log error but don't throw to avoid breaking user code
            console.error('Failed to send span completion:', error);
        }
    }
}
//# sourceMappingURL=span.js.map