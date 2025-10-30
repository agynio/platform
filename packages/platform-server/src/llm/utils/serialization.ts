import { HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { LLMMessage, LLMState } from '../types';
import { Prisma } from '@prisma/client';
import type { ResponseInputItem, Response } from 'openai/resources/responses/responses.mjs';

type PlainMessage = {
  kind: 'human' | 'system' | 'response' | 'tool_call_output';
  value: Prisma.InputJsonValue;
};

export type PlainLLMState = {
  messages: PlainMessage[];
  summary?: string;
};

// JSON normalization helpers were removed per reviewer preference; we rely on
// message.toPlain() producing plain JSON-compatible objects and cast to
// Prisma.InputJsonValue at persistence boundaries.

export function isPlainLLMState(v: unknown): v is PlainLLMState {
  if (!v || typeof v !== 'object') return false;
  const o = v as { messages?: unknown };
  if (!Array.isArray(o.messages)) return false;
  // shallow check of first element
  if (o.messages.length === 0) return true;
  const m: unknown = o.messages[0];
  return isRecord(m) && 'kind' in m && 'value' in m;
}

export function serializeState(state: LLMState): PlainLLMState {
  const messages: PlainMessage[] = state.messages.map((m) => {
    if (m instanceof HumanMessage) return { kind: 'human', value: m.toPlain() as unknown as Prisma.InputJsonValue };
    if (m instanceof SystemMessage) return { kind: 'system', value: m.toPlain() as unknown as Prisma.InputJsonValue };
    if (m instanceof ResponseMessage) return { kind: 'response', value: m.toPlain() as unknown as Prisma.InputJsonValue };
    if (m instanceof ToolCallOutputMessage) return { kind: 'tool_call_output', value: m.toPlain() as unknown as Prisma.InputJsonValue };
    throw new Error('Unsupported message type for serialization');
  });
  return { messages, summary: state.summary };
}

export function deserializeState(plain: PlainLLMState): LLMState {
  const messages: LLMMessage[] = plain.messages.map((p) => {
    const val = p.value as unknown;
    switch (p.kind) {
      case 'human':
        if (isUserMessage(val)) return new HumanMessage(val);
        throw new Error('Invalid human message value');
      case 'system':
        if (isSystemMessage(val)) return new SystemMessage(val);
        throw new Error('Invalid system message value');
      case 'response':
        if (isResponseValue(val)) return new ResponseMessage(val);
        throw new Error('Invalid response message value');
      case 'tool_call_output':
        if (isFunctionCallOutput(val)) return new ToolCallOutputMessage(val);
        throw new Error('Invalid tool_call_output message value');
      default:
        throw new Error('Unknown message kind');
    }
  });
  return { messages, summary: plain.summary };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function hasKey<K extends string>(obj: Record<string, unknown>, key: K): obj is Record<string, unknown> & { [P in K]: unknown } {
  return key in obj;
}

function isMessageLike(v: unknown): v is ResponseInputItem.Message {
  if (!isRecord(v)) return false;
  if (!hasKey(v, 'role') || typeof v.role !== 'string') return false;
  if (!hasKey(v, 'content')) return false;
  return true;
}

function isUserMessage(v: unknown): v is ResponseInputItem.Message & { role: 'user' } {
  return isMessageLike(v) && v.role === 'user';
}

function isSystemMessage(v: unknown): v is ResponseInputItem.Message & { role: 'system' } {
  return isMessageLike(v) && v.role === 'system';
}

function isResponseValue(v: unknown): v is { output: Response['output'] } {
  if (!isRecord(v)) return false;
  if (!hasKey(v, 'output')) return false;
  return Array.isArray(v.output);
}

function isFunctionCallOutput(v: unknown): v is ResponseInputItem.FunctionCallOutput {
  if (!isRecord(v)) return false;
  return hasKey(v, 'type') && hasKey(v, 'output');
}
