import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export class SystemMessage {
  constructor(private _source: ResponseInputItem.Message & { role: 'system' }) {}

  get type(): 'message' {
    return this._source.type ?? 'message';
  }

  get role(): 'system' {
    return this._source.role;
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'input_text')?.text ?? '';
  }

  static fromText(text: string): SystemMessage {
    return new SystemMessage({
      role: 'system',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): ResponseInputItem.Message {
    return this._source;
  }
}
