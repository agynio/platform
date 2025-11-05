import { Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../types';
import { HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { JsonValue, InputJsonValue } from '../services/messages.serialization';
import type { ResponseInputItem, Response } from 'openai/resources/responses/responses.mjs';
import { toPrismaJsonValue } from '../services/messages.serialization';

type PlainMessage = {
  kind: 'human' | 'system' | 'response' | 'tool_call_output';
  value: InputJsonValue | null;
};

type PlainLLMState = {
  messages: PlainMessage[];
  summary?: string;
};

export abstract class PersistenceBaseLLMReducer extends Reducer<LLMState, LLMContext> {
  // Use shared serializer for persistence typing

  protected serializeState(state: LLMState): PlainLLMState {
    const messages: PlainMessage[] = state.messages.map((m) => {
      if (m instanceof HumanMessage) return { kind: 'human', value: toPrismaJsonValue(m.toPlain()) };
      if (m instanceof SystemMessage) return { kind: 'system', value: toPrismaJsonValue(m.toPlain()) };
      if (m instanceof ResponseMessage) return { kind: 'response', value: toPrismaJsonValue(m.toPlain()) };
      if (m instanceof ToolCallOutputMessage) return { kind: 'tool_call_output', value: toPrismaJsonValue(m.toPlain()) };
      throw new Error('Unsupported message type for serialization');
    });
    return { messages, summary: state.summary };
  }

  protected deserializeState(plain: JsonValue): LLMState {
    if (!this.isPlainLLMState(plain)) return { messages: [], summary: undefined };
    const p: PlainLLMState = plain;
    const messages = p.messages.map((msg) => {
      const val: unknown = msg.value;
      switch (msg.kind) {
        case 'human':
          if (this.isUserMessage(val)) return new HumanMessage(val);
          break;
        case 'system':
          if (this.isSystemMessage(val)) return new SystemMessage(val);
          break;
        case 'response':
          if (this.isResponseValue(val)) return new ResponseMessage(val);
          break;
        case 'tool_call_output':
          if (this.isFunctionCallOutput(val)) return new ToolCallOutputMessage(val);
          break;
      }
      throw new Error('Invalid persisted message value');
    });
    return { messages, summary: p.summary };
  }

  // Guards and helpers
  protected isPlainLLMState(v: unknown): v is PlainLLMState {
    if (!v || typeof v !== 'object') return false;
    const o = v as { messages?: unknown };
    if (!Array.isArray(o.messages)) return false;
    if (o.messages.length === 0) return true;
    const m: unknown = o.messages[0];
    return this.isRecord(m) && 'kind' in m && 'value' in m;
  }

  // isInputJsonValue and isPlainObject moved to shared service where needed for conversion

  protected isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object';
  }

  protected hasKey<K extends string>(
    obj: Record<string, unknown>,
    key: K,
  ): obj is Record<string, unknown> & { [P in K]: unknown } {
    return key in obj;
  }

  protected isMessageLike(v: unknown): v is ResponseInputItem.Message {
    if (!this.isRecord(v)) return false;
    if (!this.hasKey(v, 'role') || typeof v.role !== 'string') return false;
    if (!this.hasKey(v, 'content')) return false;
    return true;
  }

  protected isUserMessage(v: unknown): v is ResponseInputItem.Message & { role: 'user' } {
    return this.isMessageLike(v) && v.role === 'user';
  }

  protected isSystemMessage(v: unknown): v is ResponseInputItem.Message & { role: 'system' } {
    return this.isMessageLike(v) && v.role === 'system';
  }

  protected isResponseValue(v: unknown): v is { output: Response['output'] } {
    if (!this.isRecord(v)) return false;
    if (!this.hasKey(v, 'output')) return false;
    return Array.isArray(v.output);
  }

  protected isFunctionCallOutput(v: unknown): v is ResponseInputItem.FunctionCallOutput {
    if (!this.isRecord(v)) return false;
    return this.hasKey(v, 'type') && this.hasKey(v, 'output');
  }
}
