import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

type DeveloperMessageSource = ResponseInputItem.Message & { role: 'developer' };

function assertValidParts(content: ResponseInputItem.Message['content']): void {
  if (!Array.isArray(content)) {
    throw new Error('DeveloperMessage content must be an array');
  }

  for (const part of content) {
    if (!part || typeof part !== 'object') {
      throw new Error('DeveloperMessage content parts must be objects');
    }
    if (!('type' in part) || part.type !== 'input_text') {
      throw new Error('DeveloperMessage supports only input_text parts');
    }
    if (!('text' in part) || typeof part.text !== 'string') {
      throw new Error('DeveloperMessage input_text parts require text');
    }
  }
}

export class DeveloperMessage {
  private readonly _source: DeveloperMessageSource;

  constructor(source: DeveloperMessageSource) {
    assertValidParts(source.content);
    this._source = {
      ...source,
      role: 'developer',
      type: source.type ?? 'message',
    };
  }

  get type(): 'message' {
    return this._source.type ?? 'message';
  }

  get role(): 'developer' {
    return 'developer';
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'input_text')?.text ?? '';
  }

  static fromText(text: string): DeveloperMessage {
    return new DeveloperMessage({
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): DeveloperMessageSource {
    return this._source;
  }
}
