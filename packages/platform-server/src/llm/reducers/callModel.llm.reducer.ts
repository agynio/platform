import {
  FunctionTool,
  HumanMessage,
  LLM,
  Reducer,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
} from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMContextState, LLMMessage, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';
import { RunEventsService, ToolCallRecord } from '../../events/run-events.service';
import { RunEventStatus, Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../services/messages.serialization';
import {
  contextItemInputFromMemory,
  contextItemInputFromMessage,
  contextItemInputFromSummary,
  contextItemInputFromSystem,
} from '../services/context-items.utils';
import type { ContextItemInput } from '../services/context-items.utils';

type SequenceEntry =
  | { kind: 'system'; message: SystemMessage }
  | { kind: 'summary'; message: HumanMessage }
  | { kind: 'memory'; message: SystemMessage; place: 'after_system' | 'last_message' }
  | { kind: 'conversation'; message: LLMMessage; index: number };

@Injectable({ scope: Scope.TRANSIENT })
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
  ) {
    super();
  }

  private tools: FunctionTool[] = [];
  private model = '';
  private systemPrompt = '';
  private llm?: LLM;
  private memoryProvider?: (
    ctx: LLMContext,
    state: LLMState,
  ) => Promise<{ msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null>;

  init(params: {
    llm: LLM;
    model: string;
    systemPrompt: string;
    tools: FunctionTool[];
    memoryProvider?: (
      ctx: LLMContext,
      state: LLMState,
    ) => Promise<{ msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null>;
  }) {
    this.llm = params.llm;
    this.model = params.model;
    this.systemPrompt = params.systemPrompt;
    this.tools = params.tools || [];
    this.memoryProvider = params.memoryProvider;
    return this;
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!this.llm || !this.model || !this.systemPrompt) {
      throw new Error('CallModelLLMReducer not initialized');
    }

    const system = SystemMessage.fromText(this.systemPrompt);
    const summaryText = state.summary?.trim() ?? null;
    const summaryMsg = summaryText ? HumanMessage.fromText(summaryText) : null;
    const memoryResult = this.memoryProvider ? await this.memoryProvider(_ctx, state) : null;

    const context = this.cloneContext(state.context);
    if (memoryResult && !memoryResult.msg) {
      context.memory = context.memory.filter((entry) => entry.place !== memoryResult.place);
    }

    const sequence = this.buildSequence(system, summaryMsg, memoryResult, state.messages);
    const { contextItemIds, context: nextContext } = await this.resolveContextIds(context, sequence, summaryText);
    const input = sequence.map((entry) => entry.message);

    const nodeId = _ctx.callerAgent.getAgentNodeId?.() ?? null;
    const llmEvent = await this.runEvents.startLLMCall({
      runId: _ctx.runId,
      threadId: _ctx.threadId,
      nodeId,
      model: this.model,
      contextItemIds,
      metadata: {
        summaryIncluded: Boolean(summaryMsg),
        memoryPlacement: memoryResult?.msg ? memoryResult.place : null,
      },
    });
    await this.runEvents.publishEvent(llmEvent.id, 'append');

    let wrapped: LLMResponse<ResponseMessage> | null = null;
    try {
      const rawMessage = await withLLM({ context: input.slice(-10) }, async () => {
        try {
          const raw = await this.llm!.call({
            model: this.model,
            input,
            tools: this.tools,
          });

          const toolCallMessages = raw.output.filter((m) => m instanceof ToolCallMessage) as ToolCallMessage[];
          const result = new LLMResponse({
            raw,
            content: raw.text,
            toolCalls: toolCallMessages,
          });
          wrapped = result;
          return result;
        } catch (error) {
          this.logger.error('Error occurred while calling LLM', error);
          if (error instanceof Error) throw error;
          throw new Error(String(error));
        }
      });

      const llmResult =
        wrapped ??
        new LLMResponse({
          raw: rawMessage,
          content: rawMessage.text,
          toolCalls: rawMessage.output.filter((m) => m instanceof ToolCallMessage) as ToolCallMessage[],
        });

      const toolCalls = this.serializeToolCalls(llmResult.toolCalls ?? []);
      const rawResponse = this.trySerialize(llmResult.raw);

      const assistantContextItems = await this.runEvents.createContextItems([
        contextItemInputFromMessage(rawMessage),
      ]);
      const assistantContextId = assistantContextItems[0];
      if (!assistantContextId) {
        throw new Error('Failed to persist assistant response context item');
      }

      const contextWithAssistant: LLMContextState = {
        ...nextContext,
        messageIds: [...nextContext.messageIds, assistantContextId],
      };

      await this.runEvents.completeLLMCall({
        eventId: llmEvent.id,
        status: RunEventStatus.success,
        responseText: llmResult.content ?? null,
        stopReason: this.extractStopReason(llmResult.raw),
        rawResponse,
        toolCalls,
      });
      await this.runEvents.publishEvent(llmEvent.id, 'update');

      const updated: LLMState = {
        ...state,
        messages: [...state.messages, rawMessage],
        context: contextWithAssistant,
        meta: { ...state.meta, lastLLMEventId: llmEvent.id },
      };
      return updated;
    } catch (error) {
      await this.runEvents.completeLLMCall({
        eventId: llmEvent.id,
        status: RunEventStatus.error,
        errorMessage: error instanceof Error ? error.message : String(error),
        rawResponse: this.trySerialize(error),
      });
      await this.runEvents.publishEvent(llmEvent.id, 'update');
      if (error instanceof Error) throw error;
      throw new Error(String(error));
    }
  }

  private cloneContext(context?: LLMContextState): LLMContextState {
    if (!context) return { messageIds: [], memory: [] };
    return {
      messageIds: [...context.messageIds],
      memory: context.memory.map((entry) => ({ id: entry.id ?? null, place: entry.place })),
      summary: context.summary ? { id: context.summary.id ?? null, text: context.summary.text ?? null } : undefined,
      system: context.system ? { id: context.system.id ?? null } : undefined,
    };
  }

  private buildSequence(
    system: SystemMessage,
    summaryMsg: HumanMessage | null,
    memoryResult: { msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null,
    conversation: LLMMessage[],
  ): SequenceEntry[] {
    const sequence: SequenceEntry[] = [{ kind: 'system', message: system }];
    if (summaryMsg) sequence.push({ kind: 'summary', message: summaryMsg });

    if (memoryResult?.msg && memoryResult.place === 'after_system') {
      sequence.push({ kind: 'memory', message: memoryResult.msg, place: memoryResult.place });
    }

    conversation.forEach((message, index) => {
      sequence.push({ kind: 'conversation', message, index });
    });

    if (memoryResult?.msg && memoryResult.place === 'last_message') {
      sequence.push({ kind: 'memory', message: memoryResult.msg, place: memoryResult.place });
    }

    return sequence;
  }

  private async resolveContextIds(
    context: LLMContextState,
    sequence: SequenceEntry[],
    summaryText: string | null,
  ): Promise<{ contextItemIds: string[]; context: LLMContextState }> {
    const pending: Array<{ input: ContextItemInput; assign: (id: string) => void }> = [];
    let conversationIndex = 0;

    if (!summaryText) {
      context.summary = undefined;
    }

    for (const entry of sequence) {
      switch (entry.kind) {
        case 'system': {
          const existing = context.system ?? { id: null };
          context.system = existing;
          this.collectContextId({
            existingId: existing.id ?? null,
            pending,
            input: () => contextItemInputFromSystem(entry.message),
            assign: (id) => {
              existing.id = id;
            },
          });
          break;
        }
        case 'summary': {
          if (summaryText) {
            const existing = context.summary;
            const reuseId = existing && existing.text === summaryText ? existing.id ?? null : null;
            this.collectContextId({
              existingId: reuseId,
              pending,
              input: () => contextItemInputFromSummary(summaryText),
              assign: (id) => {
                context.summary = { id, text: summaryText };
              },
            });
          }
          break;
        }
        case 'memory': {
          const place = entry.place;
          let memoryEntry = context.memory.find((m) => m.place === place);
          if (!memoryEntry) {
            memoryEntry = { id: null, place };
            context.memory.push(memoryEntry);
          }
          this.collectContextId({
            existingId: memoryEntry.id ?? null,
            pending,
            input: () => contextItemInputFromMemory(entry.message, place),
            assign: (id) => {
              memoryEntry!.id = id;
            },
          });
          break;
        }
        case 'conversation': {
          const idx = conversationIndex;
          const existingId = context.messageIds[idx] ?? null;
          this.collectContextId({
            existingId,
            pending,
            input: () => contextItemInputFromMessage(entry.message),
            assign: (id) => {
              if (idx < context.messageIds.length) {
                context.messageIds[idx] = id;
              } else {
                context.messageIds.push(id);
              }
            },
          });
          conversationIndex += 1;
          break;
        }
      }
    }

    if (context.messageIds.length > conversationIndex) {
      context.messageIds = context.messageIds.slice(0, conversationIndex);
    }

    if (pending.length > 0) {
      const inputs = pending.map((item) => item.input);
      const created = await this.runEvents.createContextItems(inputs);
      created.forEach((id, index) => pending[index].assign(id));
    }

    const contextItemIds: string[] = [];
    for (const entry of sequence) {
      switch (entry.kind) {
        case 'system': {
          const id = context.system?.id ?? null;
          if (id) contextItemIds.push(id);
          break;
        }
        case 'summary': {
          const id = context.summary?.id ?? null;
          if (id) contextItemIds.push(id);
          break;
        }
        case 'memory': {
          const memoryEntry = context.memory.find((m) => m.place === entry.place);
          if (memoryEntry?.id) contextItemIds.push(memoryEntry.id);
          break;
        }
        case 'conversation': {
          const id = context.messageIds[entry.index] ?? null;
          if (id) contextItemIds.push(id);
          break;
        }
      }
    }

    return { contextItemIds, context };
  }

  private collectContextId(params: {
    existingId: string | null;
    pending: Array<{ input: ContextItemInput; assign: (id: string) => void }>;
    input: () => ContextItemInput;
    assign: (id: string) => void;
  }): void {
    const { existingId, pending, input, assign } = params;
    const normalizedId = existingId && existingId.length > 0 ? existingId : null;
    if (normalizedId) {
      assign(normalizedId);
      return;
    }
    pending.push({
      input: input(),
      assign,
    });
  }

  private serializeToolCalls(calls: ToolCallMessage[]): ToolCallRecord[] {
    return calls.map((call) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(call.args);
      } catch {
        parsed = { raw: call.args };
      }
      return {
        callId: call.callId,
        name: call.name,
        arguments: toPrismaJsonValue(parsed),
      };
    });
  }

  private trySerialize(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;
    try {
      return toPrismaJsonValue(value);
    } catch (err) {
      try {
        return toPrismaJsonValue(JSON.parse(JSON.stringify(value)));
      } catch (nested) {
        this.logger.warn('Failed to serialize LLM payload for run event', err, nested);
        return null;
      }
    }
  }

  private extractStopReason(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const reason = obj.stop_reason ?? obj.finish_reason;
    return typeof reason === 'string' ? reason : null;
  }
}
