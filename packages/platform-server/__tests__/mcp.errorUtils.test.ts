import { describe, it, expect } from 'vitest';
import { buildMcpToolError } from '../src/mcp/errorUtils';
import type { McpToolCallResult } from '../src/mcp/types';

const makeRes = (partial: Partial<McpToolCallResult>): McpToolCallResult => ({
  isError: true,
  ...partial,
});

describe('buildMcpToolError', () => {
  it('uses string structuredContent.error as message', () => {
    const res = makeRes({ structuredContent: { error: 'Tool failed to execute' } });
    const { message, cause } = buildMcpToolError(res);
    expect(message).toBe('Tool failed to execute');
    expect(cause).toEqual(res.structuredContent);
  });

  it('uses nested structuredContent.error fields (message/code/retriable)', () => {
    const res = makeRes({
      structuredContent: {
        error: {
          message: 'Upstream service timeout',
          code: 'E_TIMEOUT',
          retriable: true,
        },
      },
    });
    const { message } = buildMcpToolError(res);
    expect(message.startsWith('Upstream service timeout')).toBe(true);
    expect(message).toContain('code=E_TIMEOUT');
    expect(message).toContain('retriable=true');
  });

  it('falls back to top-level message/detail when error missing', () => {
    const resMsg = makeRes({ structuredContent: { message: 'Top-level message only' } });
    const { message: m1 } = buildMcpToolError(resMsg);
    expect(m1).toBe('Top-level message only');

    const resDetail = makeRes({ structuredContent: { detail: 'Only detail available' } });
    const { message: m2 } = buildMcpToolError(resDetail);
    expect(m2).toBe('Only detail available');
  });

  it('falls back to content when no structured content present', () => {
    const res = makeRes({ content: 'Plain content error' });
    const { message, cause } = buildMcpToolError(res);
    expect(message).toBe('Plain content error');
    expect(cause).toBe('Plain content error');
  });

  it('surfaces code when only code present in nested error; message falls back', () => {
    const res1 = makeRes({ structuredContent: { error: { code: 'E_ONLY' } } });
    const { message: m1 } = buildMcpToolError(res1);
    expect(m1.startsWith('MCP tool call failed')).toBe(true);
    expect(m1).toContain('code=E_ONLY');

    const res2 = makeRes({ structuredContent: { detail: 'Just details', error: { code: 500 } } });
    const { message: m2 } = buildMcpToolError(res2);
    expect(m2).toBe('Just details (code=500)');
  });

  it('handles alternate key names and boolean-like retriable', () => {
    const res = makeRes({
      structuredContent: {
        error: {
          message: 'Alternate keys in use',
          errorCode: 429,
          retryable: 'false',
        },
      },
    });
    const { message } = buildMcpToolError(res);
    expect(message.startsWith('Alternate keys in use')).toBe(true);
    expect(message).toContain('code=429');
    expect(message).toContain('retriable=false');
  });

  it('ignores array/number error shapes and falls back cleanly', () => {
    const res1 = makeRes({ structuredContent: { message: 'Top-level ok', error: ['bad', 'shape'] as unknown as any } });
    const { message: m1 } = buildMcpToolError(res1);
    expect(m1).toBe('Top-level ok');

    const res2 = makeRes({ structuredContent: { detail: 'Detail only', error: 42 as unknown as any } });
    const { message: m2 } = buildMcpToolError(res2);
    expect(m2).toBe('Detail only');
  });

  it('truncates raw JSON fallback and appends ellipsis', () => {
    const big = 'x'.repeat(5000);
    const res = makeRes({ raw: { huge: big } });
    const { message } = buildMcpToolError(res);
    const full = JSON.stringify({ huge: big });
    const expected = 'MCP tool call failed: ' + full.slice(0, 2000) + '…';
    expect(message).toBe(expected);
  });
});
