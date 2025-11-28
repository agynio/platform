import { describe, expect, it } from 'vitest';
import { DeveloperMessage } from '../src/messages/developerMessage';

describe('DeveloperMessage', () => {
  it('creates developer role message from text input', () => {
    const message = DeveloperMessage.fromText('Follow developer instructions');

    expect(message.type).toBe('message');
    expect(message.role).toBe('developer');
    expect(message.text).toBe('Follow developer instructions');
    expect(message.toPlain()).toEqual({
      role: 'developer',
      content: [{ type: 'input_text', text: 'Follow developer instructions' }],
    });
  });
});
