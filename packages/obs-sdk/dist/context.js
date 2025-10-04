import { AsyncLocalStorage } from 'async_hooks';
export class ContextManager {
    storage = new AsyncLocalStorage();
    /**
     * Run a function within a span context
     */
    runWithSpan(span, fn) {
        const context = {
            traceId: span.traceId,
            spanId: span.spanId,
            span,
        };
        return this.storage.run(context, fn);
    }
    /**
     * Get the current active span context
     */
    getCurrentContext() {
        return this.storage.getStore();
    }
    /**
     * Get the current active span
     */
    getCurrentSpan() {
        const context = this.getCurrentContext();
        return context?.span;
    }
    /**
     * Get the current trace ID
     */
    getCurrentTraceId() {
        const context = this.getCurrentContext();
        return context?.traceId;
    }
    /**
     * Get the current span ID (to use as parent for new spans)
     */
    getCurrentSpanId() {
        const context = this.getCurrentContext();
        return context?.spanId;
    }
}
//# sourceMappingURL=context.js.map