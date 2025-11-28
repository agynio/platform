import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export class DeveloperMessage {
  constructor(private readonly source: ResponseInputItem.Message & { role: 'developer' }) {}

  get type(): 'message' {
    return this.source.type ?? 'message';
  }

  get role(): 'developer' {
    return this.source.role;
  }

  get text(): string {
    const chunk = this.source.content.find((item) => item.type === 'input_text');
    return chunk?.text ?? '';
  }

  static fromText(text: string): DeveloperMessage {
    return new DeveloperMessage({
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): ResponseInputItem.Message {
    return this.source;
  }
}
