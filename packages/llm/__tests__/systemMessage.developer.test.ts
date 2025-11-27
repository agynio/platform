import { describe, expect, it } from 'vitest';
import { SystemMessage } from '../src/messages/systemMessage';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

describe('SystemMessage', () => {
  it('preserves system role when constructed from text', () => {
    const message = SystemMessage.fromText('Follow system instructions.');

    expect(message.role).toBe('system');
    expect(message.toPlain().role).toBe('system');
  });

  it('normalizes missing type to message in output', () => {
    const source: ResponseInputItem.Message & { role: 'system' } = {
      role: 'system',
      content: [{ type: 'input_text', text: 'Legacy instruction' }],
    };

    const message = new SystemMessage(source);

    expect(message.role).toBe('system');
    expect(message.type).toBe('message');
    expect(message.toPlain().type).toBe('message');
  });
});
