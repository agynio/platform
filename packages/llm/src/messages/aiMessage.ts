import { ResponseOutputMessage } from 'openai/resources/responses/responses.mjs';

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

  toPlain(): ResponseOutputMessage {
    return this._source;
  }
}
