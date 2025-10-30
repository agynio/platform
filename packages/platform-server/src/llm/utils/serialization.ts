import { HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { LLMMessage, LLMState } from '../types';
import type { Prisma } from '@prisma/client';
import type { ResponseInputItem, Response } from 'openai/resources/responses/responses.mjs';

type PlainMessage = {
  kind: 'human' | 'system' | 'response' | 'tool_call_output';
  value: Prisma.InputJsonValue;
} & { [key: string]: Prisma.InputJsonValue | null };

// Ensure compatibility with Prisma InputJsonObject by adding an index signature
export type PlainLLMState = {
  messages: PlainMessage[];
  summary?: string;
} & { [key: string]: Prisma.InputJsonValue | null | undefined };

export function isPlainLLMState(v: unknown): v is PlainLLMState {
  if (!v || typeof v !== 'object') return false;
  const o = v as { messages?: unknown };
  if (!Array.isArray(o.messages)) return false;
  // shallow check of first element
  if (o.messages.length === 0) return true;
  const m = o.messages[0] as any;
  return m && typeof m === 'object' && 'kind' in m && 'value' in m;
}

export function serializeState(state: LLMState): PlainLLMState {
  const messages: PlainMessage[] = state.messages.map((m) => {
    if (m instanceof HumanMessage) return { kind: 'human', value: m.toPlain() };
    if (m instanceof SystemMessage) return { kind: 'system', value: m.toPlain() };
    if (m instanceof ResponseMessage) return { kind: 'response', value: m.toPlain() };
    if (m instanceof ToolCallOutputMessage) return { kind: 'tool_call_output', value: m.toPlain() };
    throw new Error('Unsupported message type for serialization');
  });
  return { messages, summary: state.summary };
}

export function deserializeState(plain: PlainLLMState): LLMState {
  const messages: LLMMessage[] = plain.messages.map((p) => {
    switch (p.kind) {
      case 'human':
        return new HumanMessage(p.value as ResponseInputItem.Message & { role: 'user' });
      case 'system':
        return new SystemMessage(p.value as ResponseInputItem.Message & { role: 'system' });
      case 'response':
        return new ResponseMessage(p.value as { output: Response['output'] });
      case 'tool_call_output':
        return new ToolCallOutputMessage(p.value as ResponseInputItem.FunctionCallOutput);
      default:
        throw new Error('Unknown message kind');
    }
  });
  return { messages, summary: plain.summary };
}
