import { describe, it, expect } from 'vitest';
import { buildMcpToolError } from '../src/mcp/errorUtils';

describe('buildMcpToolError', () => {
  it('uses string structuredContent.error as message', () => {
    const res: any = {
      isError: true,
      structuredContent: { error: 'Tool failed to execute' },
    };
    const { message, cause } = buildMcpToolError(res);
    expect(message).toBe('Tool failed to execute');
    expect(cause).toEqual(res.structuredContent);
  });

  it('uses nested structuredContent.error fields (message/code/retriable)', () => {
    const res: any = {
      isError: true,
      structuredContent: {
        error: {
          message: 'Upstream service timeout',
          code: 'E_TIMEOUT',
          retriable: true,
        },
      },
    };
    const { message } = buildMcpToolError(res);
    expect(message.startsWith('Upstream service timeout')).toBe(true);
    expect(message).toContain('code=E_TIMEOUT');
    expect(message).toContain('retriable=true');
  });

  it('falls back to top-level message/detail when error missing', () => {
    const resMsg: any = { isError: true, structuredContent: { message: 'Top-level message only' } };
    const { message: m1 } = buildMcpToolError(resMsg);
    expect(m1).toBe('Top-level message only');

    const resDetail: any = { isError: true, structuredContent: { detail: 'Only detail available' } };
    const { message: m2 } = buildMcpToolError(resDetail);
    expect(m2).toBe('Only detail available');
  });

  it('falls back to content when no structured content present', () => {
    const res: any = { isError: true, content: 'Plain content error' };
    const { message, cause } = buildMcpToolError(res);
    expect(message).toBe('Plain content error');
    expect(cause).toBe('Plain content error');
  });
});

