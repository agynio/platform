import { ResponseReasoningItem } from 'openai/resources/responses/responses.mjs';

export class ReasoningMessage {
  private _source: ResponseReasoningItem;

  constructor(_source: ResponseReasoningItem) {
    const { status: _status, ...rest } = _source;
    this._source = rest;
  }

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
