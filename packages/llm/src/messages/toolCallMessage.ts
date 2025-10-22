import { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';

export class ToolCallMessage {
  private _source: ResponseFunctionToolCall;

  constructor(_source: ResponseFunctionToolCall) {
    const { status: _status, ...rest } = _source;
    this._source = rest;
  }

  get type(): 'function_call' {
    return this._source.type;
  }

  get callId(): string {
    return this._source.call_id;
  }

  get name(): string {
    return this._source.name;
  }

  get args(): string {
    return this._source.arguments;
  }

  toPlain(): ResponseFunctionToolCall {
    return this._source;
  }
}
