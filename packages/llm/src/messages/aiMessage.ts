import { ResponseOutputMessage } from 'openai/resources/responses/responses.mjs';
import { v4 as uuidv4 } from 'uuid';

export class AIMessage {
  constructor(private _source: ResponseOutputMessage) {}

  get type(): 'message' {
    return this._source.type;
  }

  get role(): 'assistant' {
    return this._source.role;
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'output_text')?.text ?? '';
  }

  get stopReason(): string | null {
    const source = this._source as unknown as Record<string, unknown>;
    const stopSnake = source['stop_reason'];
    if (typeof stopSnake === 'string' && stopSnake.length > 0) {
      return stopSnake;
    }
    if (stopSnake === null) {
      return null;
    }

    const stopCamel = source['stopReason'];
    if (typeof stopCamel === 'string' && stopCamel.length > 0) {
      return stopCamel;
    }
    if (stopCamel === null) {
      return null;
    }

    const status = source['status'];
    if (typeof status === 'string' && status !== 'completed') {
      return status;
    }

    return null;
  }

  static fromText(text: string): AIMessage {
    const msg: ResponseOutputMessage = {
      id: uuidv4(),
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text,
          annotations: [],
        },
      ],
    };
    return new AIMessage(msg);
  }

  toPlain(): ResponseOutputMessage {
    return this._source;
  }
}
