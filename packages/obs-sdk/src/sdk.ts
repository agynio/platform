import { SDKConfig, WithSpanOptions, SpanData } from './types.js';
import { generateTraceId, generateSpanId } from './utils.js';
import { HttpClient } from './http-client.js';
import { ContextManager } from './context.js';
import { Span } from './span.js';

export class ObservabilitySDK {
  private config: SDKConfig;
  private httpClient: HttpClient;
  private contextManager: ContextManager;
  private initialized = false;

  constructor() {
    this.contextManager = new ContextManager();
    this.httpClient = new HttpClient({
      endpoint: '',
      maxRetries: 3,
      retryBackoff: 1000,
    });
    this.config = {
      mode: 'extended',
      maxRetries: 3,
      retryBackoff: 1000,
    };
  }

  /**
   * Initialize the SDK with configuration
   */
  init(config: SDKConfig): void {
    this.config = { ...this.config, ...config };
    
    const endpoint = config.mode === 'otlp' ? config.otlpEndpoint : config.endpoint;
    if (!endpoint) {
      throw new Error(`Endpoint required for ${config.mode} mode`);
    }

    this.httpClient = new HttpClient({
      endpoint,
      maxRetries: config.maxRetries ?? 3,
      retryBackoff: config.retryBackoff ?? 1000,
    });

    this.initialized = true;

    // Set up graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Execute a function within a new span
   */
  async withSpan<T>(
    options: WithSpanOptions,
    fn: () => T | Promise<T>
  ): Promise<T> {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    const parentContext = this.contextManager.getCurrentContext();
    const traceId = parentContext?.traceId ?? generateTraceId();
    const spanId = generateSpanId();
    const parentSpanId = parentContext?.spanId;

    const spanData: SpanData = {
      traceId,
      spanId,
      parentSpanId,
      label: options.label,
      status: 'running',
      startTime: Date.now(),
      attributes: {
        ...this.config.defaultAttributes,
        ...options.attributes,
      },
      nodeId: options.nodeId,
      threadId: options.threadId,
    };

    const span = new Span(spanData, this.httpClient, this.config.mode);

    // Send creation notification for extended mode
    if (this.config.mode === 'extended') {
      await span.sendCreation();
    }

    try {
      const result = await this.contextManager.runWithSpan(spanData, async () => {
        return await fn();
      });

      span.end('ok');
      return result;
    } catch (error) {
      span.end('error');
      throw error;
    }
  }

  /**
   * Get the current active span
   */
  getCurrentSpan(): SpanData | undefined {
    return this.contextManager.getCurrentSpan();
  }

  /**
   * Flush any pending data
   */
  async flush(): Promise<void> {
    await this.httpClient.flush();
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const cleanup = async () => {
      try {
        await this.flush();
      } catch (error) {
        console.error('Error during SDK cleanup:', error);
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }
}

// Export singleton instance
export const observability = new ObservabilitySDK();