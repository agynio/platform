import { HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { LLMMessage, LLMState } from '../types';
import type { Prisma } from '@prisma/client';
import type { ResponseInputItem, Response } from 'openai/resources/responses/responses.mjs';

type PlainMessage = {
  kind: 'human' | 'system' | 'response' | 'tool_call_output';
  value: Prisma.InputJsonValue;
} & { [key: string]: Prisma.InputJsonValue | null };

export type PlainLLMState = {
  messages: PlainMessage[];
  summary?: string;
};

function isJsonPrimitive(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isJsonValue(v: unknown): v is Prisma.InputJsonValue {
  if (isJsonPrimitive(v)) return true;
  if (Array.isArray(v)) return v.every(isJsonValue);
  if (isPlainObject(v)) return Object.values(v).every(isJsonValue);
  return false;
}

export function toJsonValue(input: unknown): Prisma.InputJsonValue {
  if (isJsonValue(input)) return input;
  const normalized = JSON.parse(JSON.stringify(input));
  if (isJsonValue(normalized)) return normalized;
  throw new Error('Unable to convert value to JSON');
}

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
    if (m instanceof HumanMessage) return { kind: 'human', value: toJsonValue(m.toPlain()) };
    if (m instanceof SystemMessage) return { kind: 'system', value: toJsonValue(m.toPlain()) };
    if (m instanceof ResponseMessage) return { kind: 'response', value: toJsonValue(m.toPlain()) };
    if (m instanceof ToolCallOutputMessage) return { kind: 'tool_call_output', value: toJsonValue(m.toPlain()) };
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
  return !!v && typeof v === 'object';
}

function isMessageValue(v: unknown): v is ResponseInputItem.Message {
  return isRecord(v) && typeof (v as any).role === 'string' && 'content' in (v as any);
}

function isUserMessage(v: unknown): v is ResponseInputItem.Message & { role: 'user' } {
  return isMessageValue(v) && (v as ResponseInputItem.Message).role === 'user';
}

function isSystemMessage(v: unknown): v is ResponseInputItem.Message & { role: 'system' } {
  return isMessageValue(v) && (v as ResponseInputItem.Message).role === 'system';
}

function isResponseValue(v: unknown): v is { output: Response['output'] } {
  return isRecord(v) && Array.isArray((v as any).output);
}

function isFunctionCallOutput(v: unknown): v is ResponseInputItem.FunctionCallOutput {
  return isRecord(v) && 'type' in (v as any) && 'output' in (v as any);
}
