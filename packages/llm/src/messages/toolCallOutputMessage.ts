import { ResponseFunctionCallOutputItemList, ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export class ToolCallOutputMessage {
  constructor(private _source: ResponseInputItem.FunctionCallOutput) {}

  get type(): 'function_call_output' {
    return this._source.type;
  }

  get callId(): string {
    return this._source.call_id;
  }

  get text(): string {
    if (typeof this._source.output === 'string') {
      return this._source.output;
    }
    return JSON.stringify(this._source.output);
  }

  static fromResponse(callId: string, response: string | ResponseFunctionCallOutputItemList) {
    return new ToolCallOutputMessage({
      type: 'function_call_output',
      call_id: callId,
      output: response,
    });
  }

  toPlain(): ResponseInputItem.FunctionCallOutput {
    return this._source;
  }
}
