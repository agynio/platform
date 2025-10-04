import { ExtendedSpanRequest } from './types.js';
export interface HttpClientConfig {
    endpoint: string;
    maxRetries: number;
    retryBackoff: number;
}
export declare class HttpClient {
    private config;
    constructor(config: HttpClientConfig);
    sendSpan(request: ExtendedSpanRequest): Promise<void>;
    flush(): Promise<void>;
}
