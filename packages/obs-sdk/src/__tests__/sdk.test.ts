import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservabilitySDK } from '../sdk.js';
import { generateTraceId, generateSpanId } from '../utils.js';

// Mock fetch
global.fetch = vi.fn();

describe('ObservabilitySDK', () => {
  let sdk: ObservabilitySDK;
  
  beforeEach(() => {
    sdk = new ObservabilitySDK();
    vi.clearAllMocks();
  });

  it('should throw error if not initialized', async () => {
    await expect(sdk.withSpan({ label: 'test' }, () => 'result')).rejects.toThrow('SDK not initialized');
  });

  it('should initialize with extended mode config', () => {
    expect(() => {
      sdk.init({
        mode: 'extended',
        endpoint: 'http://localhost:3001',
      });
    }).not.toThrow();
  });

  it('should throw error if endpoint not provided', () => {
    expect(() => {
      sdk.init({
        mode: 'extended',
      });
    }).toThrow('Endpoint required for extended mode');
  });

  it('should execute function within span context', async () => {
    sdk.init({
      mode: 'extended',
      endpoint: 'http://localhost:3001',
    });

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await sdk.withSpan({ label: 'test-span' }, () => {
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/v1/spans/upsert',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('should handle function errors and mark span as error', async () => {
    sdk.init({
      mode: 'extended',
      endpoint: 'http://localhost:3001',
    });

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(sdk.withSpan({ label: 'test-span' }, () => {
      throw new Error('Test error');
    })).rejects.toThrow('Test error');

    // Should still call the endpoint for span creation and completion
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should not send spans in OTLP mode immediately', async () => {
    sdk.init({
      mode: 'otlp',
      otlpEndpoint: 'http://localhost:3001',
    });

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await sdk.withSpan({ label: 'test-span' }, () => {
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('Utils', () => {
  it('should generate trace IDs of correct length', () => {
    const traceId = generateTraceId();
    expect(traceId).toHaveLength(32);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate span IDs of correct length', () => {
    const spanId = generateSpanId();
    expect(spanId).toHaveLength(16);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTraceId());
      ids.add(generateSpanId());
    }
    expect(ids.size).toBe(200);
  });
});