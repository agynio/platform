import { AsyncLocalStorage } from 'async_hooks';
import { SpanData } from './types.js';

interface SpanContext {
  traceId: string;
  spanId: string;
  span: SpanData;
}

export class ContextManager {
  private storage = new AsyncLocalStorage<SpanContext>();

  /**
   * Run a function within a span context
   */
  runWithSpan<T>(span: SpanData, fn: () => T): T {
    const context: SpanContext = {
      traceId: span.traceId,
      spanId: span.spanId,
      span,
    };

    return this.storage.run(context, fn);
  }

  /**
   * Get the current active span context
   */
  getCurrentContext(): SpanContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Get the current active span
   */
  getCurrentSpan(): SpanData | undefined {
    const context = this.getCurrentContext();
    return context?.span;
  }

  /**
   * Get the current trace ID
   */
  getCurrentTraceId(): string | undefined {
    const context = this.getCurrentContext();
    return context?.traceId;
  }

  /**
   * Get the current span ID (to use as parent for new spans)
   */
  getCurrentSpanId(): string | undefined {
    const context = this.getCurrentContext();
    return context?.spanId;
  }
}