import { SDKConfig, WithSpanOptions, SpanData } from './types.js';
export declare class ObservabilitySDK {
    private config;
    private httpClient;
    private contextManager;
    private initialized;
    constructor();
    /**
     * Initialize the SDK with configuration
     */
    init(config: SDKConfig): void;
    /**
     * Execute a function within a new span
     */
    withSpan<T>(options: WithSpanOptions, fn: () => T | Promise<T>): Promise<T>;
    /**
     * Get the current active span
     */
    getCurrentSpan(): SpanData | undefined;
    /**
     * Flush any pending data
     */
    flush(): Promise<void>;
    /**
     * Setup graceful shutdown handlers
     */
    private setupShutdownHandlers;
}
export declare const observability: ObservabilitySDK;
