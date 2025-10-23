import { HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { LLMMessage, LLMState } from '../types';
import type { ResponseInputItem, Response } from 'openai/resources/responses/responses.mjs';

type PlainHuman = ResponseInputItem.Message & { role: 'user' };
type PlainSystem = ResponseInputItem.Message & { role: 'system' };
type PlainResponse = { output: Response['output'] };
type PlainToolOutput = ResponseInputItem.FunctionCallOutput;

type PlainMessage =
  | { kind: 'human'; value: PlainHuman }
  | { kind: 'system'; value: PlainSystem }
  | { kind: 'response'; value: PlainResponse }
  | { kind: 'tool_call_output'; value: PlainToolOutput };

export type PlainLLMState = { messages: PlainMessage[]; summary?: string };

export function serializeState(state: LLMState): PlainLLMState {
  const messages: PlainMessage[] = state.messages.map((m) => {
    if (m instanceof HumanMessage) return { kind: 'human', value: m.toPlain() as PlainHuman };
    if (m instanceof SystemMessage) return { kind: 'system', value: m.toPlain() as PlainSystem };
    if (m instanceof ResponseMessage) return { kind: 'response', value: m.toPlain() as PlainResponse };
    if (m instanceof ToolCallOutputMessage) return { kind: 'tool_call_output', value: m.toPlain() as PlainToolOutput };
    throw new Error('Unsupported message type for serialization');
  });
  return { messages, summary: state.summary };
}

export function deserializeState(plain: PlainLLMState): LLMState {
  const messages: LLMMessage[] = plain.messages.map((p) => {
    switch (p.kind) {
      case 'human':
        return new HumanMessage(p.value);
      case 'system':
        return new SystemMessage(p.value);
      case 'response':
        return new ResponseMessage(p.value);
      case 'tool_call_output':
        return new ToolCallOutputMessage(p.value);
      default:
        throw new Error('Unknown message kind');
    }
  });
  return { messages, summary: plain.summary };
}
