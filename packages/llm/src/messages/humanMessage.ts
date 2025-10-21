import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export class HumanMessage {
  constructor(private _source: ResponseInputItem.Message & { role: 'user' }) {}

  get type(): 'message' {
    return this._source.type ?? 'message';
  }

  get role(): 'user' {
    return this._source.role;
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'input_text')?.text ?? '';
  }

  static fromText(text: string): HumanMessage {
    return new HumanMessage({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): ResponseInputItem.Message {
    return this._source;
  }
}
