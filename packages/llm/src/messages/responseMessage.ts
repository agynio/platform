import { Response } from 'openai/resources/responses/responses.mjs';
import { Message } from './message';
import { AIMessage } from './aiMessage';
import { ToolCallMessage } from './toolCallMessage';
import { ReasoningMessage } from './reasoningMessage';

type ResponseUsageSnapshot = {
  input_tokens: number;
  input_tokens_details?: { cached_tokens: number };
  output_tokens: number;
  output_tokens_details?: { reasoning_tokens: number };
  total_tokens: number;
};

type ResponseMessageSource = {
  output: Response['output'];
  usage?: ResponseUsageSnapshot;
};

export class ResponseMessage {
  private _source: ResponseMessageSource;

  constructor(source: { output: Response['output']; usage?: Response['usage'] | ResponseUsageSnapshot | null }) {
    const usage = ResponseMessage.normalizeUsage(source.usage);
    this._source = usage ? { output: source.output, usage } : { output: source.output };
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

  get usage(): ResponseUsageSnapshot | undefined {
    return ResponseMessage.normalizeUsage(this._source.usage);
  }

  static fromText(text: string): ResponseMessage {
    const aiMessage = AIMessage.fromText(text);
    return new ResponseMessage({ output: [aiMessage.toPlain()] });
  }

  toPlain() {
    const usage = this.usage;
    return usage ? { output: this._source.output, usage } : { output: this._source.output };
  }

  private static normalizeUsage(
    usage: Response['usage'] | ResponseUsageSnapshot | null | undefined,
  ): ResponseUsageSnapshot | undefined {
    if (!usage || typeof usage !== 'object') return undefined;

    const candidate = usage as Record<string, unknown>;
    const inputTokens = candidate.input_tokens;
    const outputTokens = candidate.output_tokens;
    const totalTokens = candidate.total_tokens;

    if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number' || typeof totalTokens !== 'number') {
      return undefined;
    }

    const snapshot: ResponseUsageSnapshot = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    };

    const inputDetails = candidate.input_tokens_details;
    if (inputDetails && typeof inputDetails === 'object') {
      const cached = (inputDetails as Record<string, unknown>).cached_tokens;
      if (typeof cached === 'number') {
        snapshot.input_tokens_details = { cached_tokens: cached };
      }
    }

    const outputDetails = candidate.output_tokens_details;
    if (outputDetails && typeof outputDetails === 'object') {
      const reasoning = (outputDetails as Record<string, unknown>).reasoning_tokens;
      if (typeof reasoning === 'number') {
        snapshot.output_tokens_details = { reasoning_tokens: reasoning };
      }
    }

    return snapshot;
  }
}
