import { describe, expect, it } from 'vitest';
import { ToolCallOutputMessage } from '../src/messages/toolCallOutputMessage';

describe('ToolCallOutputMessage', () => {
  it('includes role "tool" when serialized', () => {
    const message = ToolCallOutputMessage.fromResponse('call-123', 'output value');

    expect(message.toPlain()).toEqual({
      type: 'function_call_output',
      call_id: 'call-123',
      output: 'output value',
      role: 'tool',
    });
  });
});
