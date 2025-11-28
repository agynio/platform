import { DeveloperMessage, SystemMessage } from '@agyn/llm';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export function coerceRole(message: ResponseInputItem.Message, role: 'system' | 'developer'): ResponseInputItem.Message {
  return { ...message, role };
}

export function normalizeInstructionMessage(message: DeveloperMessage | SystemMessage): DeveloperMessage {
  if (message instanceof DeveloperMessage) {
    return message;
  }

  const plain = message.toPlain();
  const coerced = coerceRole(plain, 'developer') as ResponseInputItem.Message & { role: 'developer' };
  return new DeveloperMessage(coerced);
}
