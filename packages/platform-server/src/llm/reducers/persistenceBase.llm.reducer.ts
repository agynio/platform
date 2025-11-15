import { Reducer } from '@agyn/llm';
import type { LLMContext, LLMContextState, LLMState } from '../types';
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
  context?: PlainContextState;
};

type PlainContextState = {
  messageIds: string[];
  memory: Array<{ id: string | null; place: 'after_system' | 'last_message' }>;
  summary?: { id: string | null; text: string | null };
  system?: { id: string | null };
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
    const context: PlainContextState = {
      messageIds: [...(state.context?.messageIds ?? [])],
      memory: (state.context?.memory ?? []).map((entry) => ({ id: entry.id ?? null, place: entry.place })),
      summary: state.context?.summary ? { ...state.context.summary } : undefined,
      system: state.context?.system ? { ...state.context.system } : undefined,
    };
    return { messages, summary: state.summary, context };
  }

  protected deserializeState(plain: JsonValue): LLMState {
    if (!this.isPlainLLMState(plain)) {
      return this.emptyState();
    }
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
    return {
      messages,
      summary: p.summary,
      context: this.deserializeContext(p.context),
    };
  }

  protected deserializeContext(context: PlainContextState | undefined): LLMContextState {
    const messageIds = context?.messageIds ? [...context.messageIds] : [];
    const memory = context?.memory ? context.memory.map((entry) => ({ id: entry.id ?? null, place: entry.place })) : [];
    const summary = context?.summary ? { id: context.summary.id ?? null, text: context.summary.text ?? null } : undefined;
    const system = context?.system ? { id: context.system.id ?? null } : undefined;
    return { messageIds, memory, summary, system };
  }

  protected emptyState(): LLMState {
    return {
      messages: [],
      summary: undefined,
      context: { messageIds: [], memory: [] },
    };
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
