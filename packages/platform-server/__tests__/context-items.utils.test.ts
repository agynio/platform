import { describe, expect, it, vi } from 'vitest';
import { ContextItemRole, Prisma } from '@prisma/client';

import { ToolCallOutputMessage } from '@agyn/llm';

import {
  ContextItemNullByteGuardError,
  contextItemInputFromMessage,
  deepSanitizeCreateData,
  normalizeContextItem,
  sanitizeContextItemPayload,
} from '../src/llm/services/context-items.utils';
import { upsertNormalizedContextItems } from '../src/llm/services/context-items.repository';

const NULL_CHAR = String.fromCharCode(0);

function withNullGuardDisabled<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const original = process.env.CONTEXT_ITEM_NULL_GUARD;
  const legacy = process.env.CONTEXT_ITEM_NUL_GUARD;
  delete process.env.CONTEXT_ITEM_NULL_GUARD;
  delete process.env.CONTEXT_ITEM_NUL_GUARD;

  const restore = () => {
    if (original === undefined) delete process.env.CONTEXT_ITEM_NULL_GUARD;
    else process.env.CONTEXT_ITEM_NULL_GUARD = original;
    if (legacy === undefined) delete process.env.CONTEXT_ITEM_NUL_GUARD;
    else process.env.CONTEXT_ITEM_NUL_GUARD = legacy;
  };

  try {
    const result = fn();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<T>).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

describe('normalizeContextItem', () => {
  it('strips null bytes from content text', () =>
    withNullGuardDisabled(() => {
      const logger = { warn: vi.fn() };
      const result = normalizeContextItem(
        { role: ContextItemRole.tool, contentText: `pre${NULL_CHAR}post` },
        logger,
      );

      expect(result).not.toBeNull();
      expect(result?.contentText).toBe('prepost');
      expect(result?.sizeBytes).toBe(Buffer.byteLength('prepost', 'utf8'));
      expect(logger.warn).toHaveBeenCalledWith(
        'context_items.null_bytes_stripped',
        expect.objectContaining({ removedLength: 1, field: 'contentText' }),
      );
    }));

  it('leaves clean text untouched and avoids warning', () => {
    const logger = { warn: vi.fn() };
    const result = normalizeContextItem(
      { role: ContextItemRole.assistant, contentText: 'clean output' },
      logger,
    );

    expect(result).not.toBeNull();
    expect(result?.contentText).toBe('clean output');
    expect(result?.sizeBytes).toBe(Buffer.byteLength('clean output', 'utf8'));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('strips null bytes from metadata items field', () =>
    withNullGuardDisabled(() => {
      const logger = { warn: vi.fn() };
      const result = normalizeContextItem(
        {
          role: ContextItemRole.assistant,
          contentText: 'clean',
          metadata: {
            items: [`pre${NULL_CHAR}post`],
          },
        },
        logger,
      );

      expect(result).not.toBeNull();
      expect(JSON.parse(JSON.stringify(result?.metadata))).toEqual({ items: ['prepost'] });
      expect(logger.warn).toHaveBeenCalledWith(
        'context_items.null_bytes_stripped',
        expect.objectContaining({ removedLength: 1, path: 'metadata.items.0', field: 'metadata' }),
      );
    }));

  it('strips null bytes embedded in contentJson payloads', () =>
    withNullGuardDisabled(() => {
      const logger = { warn: vi.fn() };
      const result = normalizeContextItem(
        {
          role: ContextItemRole.assistant,
          contentJson: {
            items: [
              {
                type: 'input_text',
                text: `hello${NULL_CHAR}world`,
              },
            ],
          },
        },
        logger,
      );

      expect(result).not.toBeNull();
      expect(JSON.parse(JSON.stringify(result?.contentJson))).toEqual({
        items: [
          {
            type: 'input_text',
            text: 'helloworld',
          },
        ],
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'context_items.null_bytes_stripped',
        expect.objectContaining({ removedLength: 1, path: 'contentJson.items.0.text', field: 'contentJson' }),
      );
    }));
});

describe('upsertNormalizedContextItems', () => {
  it('persists sanitized metadata without null bytes', () =>
    withNullGuardDisabled(async () => {
      const logger = { warn: vi.fn() };
      const normalized = normalizeContextItem(
        {
          role: ContextItemRole.assistant,
          contentText: 'ack',
          metadata: {
            items: [`abc${NULL_CHAR}def`],
          },
        },
        logger,
      );

      expect(normalized).not.toBeNull();

      const create = vi.fn(async (args: unknown) => {
        const payload = args as { data: { metadata: unknown } };
        expect(JSON.parse(JSON.stringify(payload.data.metadata))).toEqual({ items: ['abcdef'] });
        return { id: 'ctx-1' };
      });

      const fakeClient = { contextItem: { create } } as unknown;

      const result = await upsertNormalizedContextItems(fakeClient as never, [normalized!], logger);
      expect(result).toEqual({ ids: ['ctx-1'], created: 1 });
      expect(create).toHaveBeenCalledTimes(1);
    }));
});

describe('sanitizeContextItemPayload', () => {
  it('strips null bytes from nested payloads and remains JSON stringifiable', () =>
    withNullGuardDisabled(() => {
      const logger = { warn: vi.fn() };
      const payload = {
        contentText: `hello${NULL_CHAR}world`,
        contentJson: {
          raw_preview: `preview${NULL_CHAR}value`,
          blocks: [
            {
              kind: 'text',
              text: `block${NULL_CHAR}text`,
              children: [{ note: `child${NULL_CHAR}note` }],
            },
          ],
        },
        metadata: {
          debugLabel: `label${NULL_CHAR}value`,
          nested: [{ tag: `inner${NULL_CHAR}tag` }],
        },
        extra: [{ misc: `array${NULL_CHAR}entry` }],
      };

      const sanitized = sanitizeContextItemPayload(payload, logger);

      expect(sanitized).not.toBe(payload);
      expect(sanitized.contentText).toBe('helloworld');
      expect(JSON.parse(JSON.stringify(sanitized.contentJson))).toEqual({
        raw_preview: 'previewvalue',
        blocks: [
          {
            kind: 'text',
            text: 'blocktext',
            children: [{ note: 'childnote' }],
          },
        ],
      });
      expect(JSON.parse(JSON.stringify(sanitized.metadata))).toEqual({
        debugLabel: 'labelvalue',
        nested: [{ tag: 'innertag' }],
      });
      expect(() => JSON.stringify(sanitized)).not.toThrow();
      expect(logger.warn).toHaveBeenCalled();
    }));

  it('throws when guard flag is enabled and null bytes are present', () => {
    expect(() =>
      sanitizeContextItemPayload(
        { contentText: `guard${NULL_CHAR}trip` },
        undefined,
        { guard: true },
      ),
    ).toThrow(ContextItemNullByteGuardError);
  });

  it('honors CONTEXT_ITEM_NULL_GUARD environment flag', () => {
    const original = process.env.CONTEXT_ITEM_NULL_GUARD;
    process.env.CONTEXT_ITEM_NULL_GUARD = '1';
    try {
      expect(() => sanitizeContextItemPayload({ contentText: `env${NULL_CHAR}trip` })).toThrow(
        ContextItemNullByteGuardError,
      );
    } finally {
      if (original === undefined) delete process.env.CONTEXT_ITEM_NULL_GUARD;
      else process.env.CONTEXT_ITEM_NULL_GUARD = original;
    }
  });
});

describe('contextItemInputFromMessage', () => {
  it('encodes binary tool output into base64 contentJson', () => {
    const binary = `bin${NULL_CHAR}ary`;
    const message = ToolCallOutputMessage.fromResponse('call-bin', binary);

    const result = contextItemInputFromMessage(message);

    expect(result.role).toBe('tool');
    expect(result.contentText).toBeNull();
    expect(result.metadata).toEqual({
      type: 'function_call_output',
      callId: 'call-bin',
      outputEncoding: 'base64',
      outputBytes: Buffer.byteLength(binary, 'utf8'),
    });
    expect(result.contentJson).toEqual({
      type: 'function_call_output',
      call_id: 'call-bin',
      output: {
        encoding: 'base64',
        data: Buffer.from(binary, 'utf8').toString('base64'),
        bytes: Buffer.byteLength(binary, 'utf8'),
      },
    });
  });

  it('preserves textual tool output in contentText', () => {
    const message = ToolCallOutputMessage.fromResponse('call-text', 'plain output');
    const result = contextItemInputFromMessage(message);

    expect(result.role).toBe('tool');
    expect(result.contentText).toBe('plain output');
    expect(result.metadata).toEqual({ type: 'function_call_output', callId: 'call-text' });
    expect(result.contentJson).toEqual({
      type: 'function_call_output',
      call_id: 'call-text',
      output: 'plain output',
    });
  });
});

describe('deepSanitizeCreateData', () => {
  it('strips null bytes across all create payload fields', () =>
    withNullGuardDisabled(() => {
      const logger = { warn: vi.fn() };
      const payload = {
        role: ContextItemRole.assistant,
        contentText: `text${NULL_CHAR}suffix`,
        contentJson: { foo: `bar${NULL_CHAR}baz`, nested: [{ value: `arr${NULL_CHAR}entry` }] } as Prisma.InputJsonValue,
        metadata: { info: `meta${NULL_CHAR}data` } as Prisma.InputJsonValue,
        sizeBytes: 42,
      } satisfies Prisma.ContextItemCreateInput;

      const sanitized = deepSanitizeCreateData(payload, logger);

      expect(sanitized.contentText).toBe('textsuffix');
      expect(JSON.parse(JSON.stringify(sanitized.contentJson))).toEqual({ foo: 'barbaz', nested: [{ value: 'arrentry' }] });
      expect(JSON.parse(JSON.stringify(sanitized.metadata))).toEqual({ info: 'metadata' });
      expect(logger.warn).toHaveBeenCalledWith(
        'context_items.null_bytes_stripped',
        expect.objectContaining({ field: 'contentText', path: 'contentText', removedLength: 1 }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'context_items.null_bytes_stripped',
        expect.objectContaining({ field: 'contentJson', path: 'contentJson.foo', removedLength: 1 }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'context_items.null_bytes_stripped',
        expect.objectContaining({ field: 'metadata', path: 'metadata.info', removedLength: 1 }),
      );
    }));
});
