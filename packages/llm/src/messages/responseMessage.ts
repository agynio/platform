import { Response } from 'openai/resources/responses/responses.mjs';
import { Message } from './message';
import { AIMessage } from './aiMessage';
import { ToolCallMessage } from './toolCallMessage';
import { ReasoningMessage } from './reasoningMessage';

export class ResponseMessage {
  private _source: { output: Response['output'] };

  constructor(_source: { output: Response['output'] }) {
    this._source = { output: _source.output };
  }

  get type(): 'output' {
    return 'output';
  }

  get output() {
    return this._source.output.map((o) => {
      const message = Message.fromPlain(o);
      if (
        message instanceof AIMessage || //
        message instanceof ToolCallMessage ||
        message instanceof ReasoningMessage
      ) {
        return message;
      }

      throw new Error(`Unsupported response output message type: ${o.type}`);
    });
  }

  get text(): string {
    return this.output.find((o) => o.type === 'message')?.text ?? '';
  }

  toPlain() {
    return this._source;
  }
}
