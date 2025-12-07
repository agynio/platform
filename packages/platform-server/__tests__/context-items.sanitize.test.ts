import { describe, expect, it, vi } from 'vitest';
import { ContextItemRole, Prisma } from '@prisma/client';
import {
  normalizeContextItem,
  upsertNormalizedContextItems,
  type NormalizedContextItem,
} from '../src/llm/services/context-items.utils';

describe('context item sanitization', () => {
  it('normalizes content text and json by replacing null characters', () => {
    const normalized = normalizeContextItem({
      role: 'assistant',
      contentText: 'hello\u0000world',
      contentJson: {
        entry: 'value\u0000',
        nested: { text: 'inner\u0000' },
      },
      metadata: {
        note: 'meta\u0000',
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.contentText).toBe('hello\uFFFDworld');
    expect(JSON.stringify(normalized?.contentJson)).not.toContain('\\u0000');
    expect(JSON.stringify(normalized?.metadata)).not.toContain('\\u0000');
  });

  it('sanitizes values again before persistence', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'ctx-1' });
    const client = {
      contextItem: {
        create: createMock,
      },
    } as unknown as { contextItem: { create: typeof createMock } };

    const items: NormalizedContextItem[] = [
      {
        role: ContextItemRole.assistant,
        contentText: 'bad\u0000text',
        contentJson: { payload: 'value\u0000' } as unknown as Prisma.InputJsonValue,
        metadata: { kind: 'ctx', label: 'lab\u0000' } as unknown as Prisma.InputJsonValue,
        sizeBytes: 0,
      },
    ];

    const result = await upsertNormalizedContextItems(client as any, items, undefined);

    expect(result).toEqual({ ids: ['ctx-1'], created: 1 });
    expect(createMock).toHaveBeenCalledTimes(1);

    const payload = createMock.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(payload?.contentText).toBe('bad\uFFFDtext');
    expect(JSON.stringify(payload?.contentJson)).not.toContain('\\u0000');
    expect(JSON.stringify(payload?.metadata)).not.toContain('\\u0000');
  });
});
