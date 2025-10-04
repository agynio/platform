import { SpanData, SpanStatus, SpanAttributes, SpanEvent, ExtendedSpanRequest } from './types.js';
import { generateIdempotencyKey } from './utils.js';
import { HttpClient } from './http-client.js';

export class Span {
  private data: SpanData;
  private httpClient: HttpClient;
  private mode: 'extended' | 'otlp';
  private rev = 0;

  constructor(
    data: SpanData,
    httpClient: HttpClient,
    mode: 'extended' | 'otlp'
  ) {
    this.data = { ...data };
    this.httpClient = httpClient;
    this.mode = mode;
  }

  /**
   * Update span attributes
   */
  setAttributes(attributes: SpanAttributes): void {
    this.data.attributes = { ...this.data.attributes, ...attributes };
    
    if (this.mode === 'extended' && this.data.status === 'running') {
      this.sendUpdate();
    }
  }

  /**
   * Set span status
   */
  setStatus(status: SpanStatus): void {
    this.data.status = status;
    
    if (this.mode === 'extended' && status === 'running') {
      this.sendUpdate();
    }
  }

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: SpanAttributes): void {
    const event: SpanEvent = {
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
  end(status: SpanStatus = 'ok'): void {
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
  getData(): Readonly<SpanData> {
    return { ...this.data };
  }

  /**
   * Send span creation notification (extended mode only)
   */
  async sendCreation(): Promise<void> {
    if (this.mode !== 'extended') return;

    const request: ExtendedSpanRequest = {
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
    } catch (error) {
      // Log error but don't throw to avoid breaking user code
      console.error('Failed to send span creation:', error);
    }
  }

  /**
   * Send span update notification (extended mode only)
   */
  private async sendUpdate(): Promise<void> {
    if (this.mode !== 'extended') return;

    this.rev++;
    const request: ExtendedSpanRequest = {
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
    } catch (error) {
      // Log error but don't throw to avoid breaking user code
      console.error('Failed to send span update:', error);
    }
  }

  /**
   * Send span completion notification (extended mode only)
   */
  private async sendCompletion(): Promise<void> {
    if (this.mode !== 'extended') return;

    this.rev++;
    const request: ExtendedSpanRequest = {
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
    } catch (error) {
      // Log error but don't throw to avoid breaking user code
      console.error('Failed to send span completion:', error);
    }
  }
}