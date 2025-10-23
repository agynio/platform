import { AIMessage, HumanMessage, ResponseMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { LLMMessage, LLMState } from '../types';

// Serializable plain union shapes
type PlainMessage =
  | { kind: 'human'; value: ReturnType<HumanMessage['toPlain']> }
  | { kind: 'system'; value: ReturnType<SystemMessage['toPlain']> }
  | { kind: 'response'; value: ReturnType<ResponseMessage['toPlain']> }
  | { kind: 'tool_call_output'; value: ReturnType<ToolCallOutputMessage['toPlain']> };

export type PlainLLMState = { messages: PlainMessage[]; summary?: string };

export function serializeState(state: LLMState): PlainLLMState {
  const messages: PlainMessage[] = state.messages.map((m) => {
    if (m instanceof HumanMessage) return { kind: 'human', value: m.toPlain() };
    if (m instanceof SystemMessage) return { kind: 'system', value: m.toPlain() };
    if (m instanceof ResponseMessage) return { kind: 'response', value: m.toPlain() };
    if (m instanceof ToolCallOutputMessage) return { kind: 'tool_call_output', value: m.toPlain() };
    // ToolCallMessage should only appear wrapped inside ResponseMessage.output
    throw new Error('Unsupported message type for serialization');
  });
  return { messages, summary: state.summary };
}

export function deserializeState(plain: PlainLLMState): LLMState {
  const messages: LLMMessage[] = plain.messages.map((p) => {
    switch (p.kind) {
      case 'human':
        return new HumanMessage(p.value as any);
      case 'system':
        return new SystemMessage(p.value as any);
      case 'response':
        return new ResponseMessage(p.value as any);
      case 'tool_call_output':
        return new ToolCallOutputMessage(p.value as any);
      default:
        throw new Error('Unknown message kind');
    }
  });
  return { messages, summary: plain.summary };
}

