import { describe, expect, it } from 'vitest';
import { DeveloperMessage } from '../src/messages/developerMessage';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

describe('DeveloperMessage', () => {
  it('emits developer role when constructed from text', () => {
    const message = DeveloperMessage.fromText('Follow developer instructions.');

    expect(message.role).toBe('developer');
    expect(message.toPlain().role).toBe('developer');
    expect(message.text).toBe('Follow developer instructions.');
  });

  it('retains provided parts when valid', () => {
    const source: ResponseInputItem.Message & { role: 'developer' } = {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: 'Keep format' }],
    };

    const message = new DeveloperMessage(source);

    expect(message.toPlain()).toEqual(source);
  });

  it('throws when part type is unsupported', () => {
    const source = {
      role: 'developer',
      content: [{ type: 'input_image', image_base64: 'xxx' }],
    } as unknown as ResponseInputItem.Message & { role: 'developer' };

    expect(() => new DeveloperMessage(source)).toThrow('DeveloperMessage supports only input_text parts');
  });
});
