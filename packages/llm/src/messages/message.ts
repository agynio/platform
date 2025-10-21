import { EasyInputMessage, ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import { AIMessage } from './aiMessage';
import { HumanMessage } from './humanMessage';
import { SystemMessage } from './systemMessage';
import { ToolCallMessage } from './toolCallMessage';
import { ToolCallOutputMessage } from './toolCallOutputMessage';
import { ReasoningMessage } from './reasoningMessage';

// Exclude EasyInputMessage because it overlaps with ResponseInputItem.Message and ResponseOutputMessage
// Add ResponseInputItem.Message back because exclusion removes it
type SupportedMessage = Exclude<ResponseInputItem, EasyInputMessage> | ResponseInputItem.Message;

export class Message {
  static fromPlain(obj: SupportedMessage) {
    if (obj.type === 'message') {
      if (obj.role === 'user') {
        return new HumanMessage(obj as ResponseInputItem.Message & { role: 'user' });
      }
      if (obj.role === 'system') {
        return new SystemMessage(obj as ResponseInputItem.Message & { role: 'system' });
      }
      if (obj.role === 'assistant') {
        return new AIMessage(obj);
      }
    }

    if (obj.type === 'function_call') {
      return new ToolCallMessage(obj);
    }

    if (obj.type === 'function_call_output') {
      return new ToolCallOutputMessage(obj);
    }

    if (obj.type === 'reasoning') {
      return new ReasoningMessage(obj);
    }

    throw new Error(`Unsupported message type: ${obj}`);
  }
}
