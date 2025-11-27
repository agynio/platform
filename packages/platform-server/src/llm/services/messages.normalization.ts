import { DeveloperMessage, SystemMessage } from '@agyn/llm';

export function normalizeInstructionMessage(message: DeveloperMessage | SystemMessage): DeveloperMessage {
  if (message instanceof DeveloperMessage) {
    return message;
  }

  const plain = message.toPlain();
  return new DeveloperMessage({ ...plain, role: 'developer' as const });
}
