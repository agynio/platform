import { ResponseReasoningItem } from 'openai/resources/responses/responses.mjs';

export class ReasoningMessage {
  constructor(private _source: ResponseReasoningItem) {}

  get type(): 'reasoning' {
    return this._source.type;
  }

  get text(): string {
    return this._source.summary.map((part) => part.text).join('\n');
  }

  toPlain(): ResponseReasoningItem {
    return this._source;
  }
}
