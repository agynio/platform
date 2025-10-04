import { ExtendedSpanRequest } from './types.js';

export interface HttpClientConfig {
  endpoint: string;
  maxRetries: number;
  retryBackoff: number;
}

export class HttpClient {
  private config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  async sendSpan(request: ExtendedSpanRequest): Promise<void> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.endpoint}/v1/spans/upsert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryBackoff * Math.pow(2, attempt) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  async flush(): Promise<void> {
    // For simple HTTP client, flush is a no-op since we send immediately
    // In a more sophisticated implementation, this would flush any pending batches
  }
}