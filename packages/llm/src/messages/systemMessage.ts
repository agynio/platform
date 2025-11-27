import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

type SystemMessageSource = ResponseInputItem.Message & { role: 'system' };

export class SystemMessage {
  private readonly _source: SystemMessageSource;

  constructor(source: SystemMessageSource) {
    this._source = {
      ...source,
      role: 'system',
      type: source.type ?? 'message',
    };
  }

  get type(): 'message' {
    return this._source.type ?? 'message';
  }

  get role(): 'system' {
    return 'system';
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'input_text')?.text ?? '';
  }

  static fromText(text: string): SystemMessage {
    return new SystemMessage({
      type: 'message',
      role: 'system',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): SystemMessageSource {
    return this._source;
  }
}
