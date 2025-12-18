import {
  AIMessage,
  FunctionTool,
  HumanMessage,
  LLM,
  Reducer,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
} from '@agyn/llm';
import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { LLMContext, LLMContextState, LLMMessage, LLMState } from '../types';
import type { LLMCallUsageMetrics, ToolCallRecord } from '../../events/run-events.service';
import { RunEventsService } from '../../events/run-events.service';
import { EventsBusService } from '../../events/events-bus.service';
import { RunEventStatus, Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../services/messages.serialization';
import {
  contextItemInputFromMemory,
  contextItemInputFromMessage,
  contextItemInputFromSummary,
  contextItemInputFromSystem,
} from '../services/context-items.utils';
import { persistContextItems } from '../services/context-items.append';
import type { ContextItemInput } from '../services/context-items.utils';

type SequenceEntry =
  | { kind: 'system'; message: SystemMessage }
  | { kind: 'summary'; message: HumanMessage }
  | { kind: 'memory'; message: SystemMessage; place: 'after_system' | 'last_message' }
  | { kind: 'conversation'; message: LLMMessage; index: number };

@Injectable({ scope: Scope.TRANSIENT })
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  private readonly logger = new Logger(CallModelLLMReducer.name);
  private readonly runEvents: RunEventsService;
  private readonly eventsBus: EventsBusService;

  constructor(
    @Inject(RunEventsService) runEvents: RunEventsService,
    @Inject(EventsBusService) eventsBus: EventsBusService,
  ) {
    super();
    this.runEvents = runEvents;
    this.eventsBus = eventsBus;
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
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

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    if (!this.llm || !this.model || !this.systemPrompt) {
      throw new Error('CallModelLLMReducer not initialized');
    }

    const system = SystemMessage.fromText(this.systemPrompt);
    const summaryText = state.summary?.trim() ?? null;
    const summaryMsg = summaryText ? HumanMessage.fromText(summaryText) : null;
    const memoryResult = this.memoryProvider ? await this.memoryProvider(ctx, state) : null;

    const context = this.cloneContext(state.context);
    if (memoryResult && !memoryResult.msg) {
      context.memory = context.memory.filter((entry) => entry.place !== memoryResult.place);
    }

    const sequence = this.buildSequence(system, summaryMsg, memoryResult, state.messages);
    const { contextItemIds, newContextItemIds, context: nextContext } = await this.resolveContextIds(
      context,
      sequence,
      summaryText,
    );
    const input = sequence.map((entry) => entry.message);

    const nodeId = ctx.callerAgent.getAgentNodeId?.() ?? null;
    const llmEvent = await this.runEvents.startLLMCall({
      runId: ctx.runId,
      threadId: ctx.threadId,
      nodeId,
      model: this.model,
      contextItemIds,
      newContextItemIds,
      metadata: {
        summaryIncluded: Boolean(summaryMsg),
        memoryPlacement: memoryResult?.msg ? memoryResult.place : null,
      },
    });
    await this.eventsBus.publishEvent(llmEvent.id, 'append');

    const cancelAndReturn = async (params?: {
      rawResponse?: Prisma.InputJsonValue | null;
      errorMessage?: string | null;
      usage?: LLMCallUsageMetrics;
    }) => {
      await this.runEvents.completeLLMCall({
        eventId: llmEvent.id,
        status: RunEventStatus.cancelled,
        rawResponse: params?.rawResponse ?? null,
        errorMessage: params?.errorMessage ?? null,
        usage: params?.usage,
      });
      await this.eventsBus.publishEvent(llmEvent.id, 'update');
      return state;
    };

    if (ctx.terminateSignal?.isActive) {
      return cancelAndReturn();
    }

    try {
      const rawMessage = await this.callModel(input);
      const usageMetrics = this.extractUsage(rawMessage);

      if (ctx.terminateSignal?.isActive) {
        return cancelAndReturn({ rawResponse: this.trySerialize(rawMessage), usage: usageMetrics });
      }

      const toolCalls = this.serializeToolCalls(
        rawMessage.output.filter((m) => m instanceof ToolCallMessage) as ToolCallMessage[],
      );
      const rawResponse = this.trySerialize(rawMessage);

      let assistantContextId: string | null = null;
      await persistContextItems({
        runEvents: this.runEvents,
        entries: [
          {
            input: contextItemInputFromMessage(rawMessage),
            assign: (id) => {
              assistantContextId = id;
            },
            countable: true,
          },
        ],
      });

      if (!assistantContextId) {
        throw new Error('Failed to persist assistant response context item');
      }

      this.appendPendingContextItems(nextContext, [assistantContextId]);

      const contextWithAssistant: LLMContextState = {
        ...nextContext,
        messageIds: [...nextContext.messageIds, assistantContextId],
      };

      await this.runEvents.completeLLMCall({
        eventId: llmEvent.id,
        status: RunEventStatus.success,
        responseText: rawMessage.text ?? null,
        stopReason: this.extractStopReason(rawMessage),
        rawResponse,
        toolCalls,
        usage: usageMetrics,
      });
      await this.eventsBus.publishEvent(llmEvent.id, 'update');

      const updated: LLMState = {
        ...state,
        messages: [...state.messages, rawMessage],
        context: contextWithAssistant,
        meta: {
          ...state.meta,
          lastLLMEventId: llmEvent.id,
        },
      };
      return updated;
    } catch (error) {
      if (ctx.terminateSignal?.isActive) {
        return cancelAndReturn({
          rawResponse: this.trySerialize(error),
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error && error.name ? error.name : 'LLM_ERROR';
      await this.runEvents.completeLLMCall({
        eventId: llmEvent.id,
        status: RunEventStatus.error,
        errorMessage,
        errorCode,
        rawResponse: this.trySerialize(error),
      });
      await this.eventsBus.publishEvent(llmEvent.id, 'update');
      if (error instanceof Error) throw error;
      throw new Error(String(error));
    }
  }

  private async callModel(input: LLMMessage[]): Promise<ResponseMessage> {
    try {
      return await this.llm!.call({
        model: this.model,
        input,
        tools: this.tools,
      });
    } catch (error) {
      this.logger.error(
        `Error occurred while calling LLM${this.format({ model: this.model, error: this.errorInfo(error) })}`,
      );
      if (error instanceof Error) throw error;
      throw new Error(String(error));
    }
  }

  private cloneContext(context?: LLMContextState): LLMContextState {
    if (!context) return { messageIds: [], memory: [], pendingNewContextItemIds: [] };
    return {
      messageIds: [...context.messageIds],
      memory: context.memory.map((entry) => ({ id: entry.id ?? null, place: entry.place })),
      summary: context.summary ? { id: context.summary.id ?? null, text: context.summary.text ?? null } : undefined,
      system: context.system ? { id: context.system.id ?? null } : undefined,
      pendingNewContextItemIds: context.pendingNewContextItemIds
        ? [...context.pendingNewContextItemIds]
        : undefined,
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
  ): Promise<{ contextItemIds: string[]; newContextItemIds: string[]; context: LLMContextState }> {
    const pending: Array<{ input: ContextItemInput; assign: (id: string) => void; countable?: boolean }> = [];
    let conversationIndex = 0;
    const initialConversationCount = context.messageIds.length;
    const pendingNewIds = new Set(context.pendingNewContextItemIds ?? []);

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
          const isNewConversation = existingId === null || idx >= initialConversationCount;
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
            countable: isNewConversation && this.isCountableConversationMessage(entry.message),
            onNewAssigned: isNewConversation
              ? (id) => {
                  pendingNewIds.add(id);
                }
              : undefined,
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
      await persistContextItems({
        runEvents: this.runEvents,
        entries: pending,
      });
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

    const newContextItemIds: string[] = [];
    for (const id of contextItemIds) {
      if (pendingNewIds.has(id)) {
        newContextItemIds.push(id);
      }
    }
    context.pendingNewContextItemIds = [];
    return { contextItemIds, newContextItemIds, context };
  }

  private collectContextId(params: {
    existingId: string | null;
    pending: Array<{ input: ContextItemInput; assign: (id: string) => void; countable?: boolean }>;
    input: () => ContextItemInput;
    assign: (id: string) => void;
    countable?: boolean;
    onNewAssigned?: (id: string) => void;
  }): void {
    const { existingId, pending, input, assign, countable, onNewAssigned } = params;
    const normalizedId = existingId && existingId.length > 0 ? existingId : null;
    if (normalizedId) {
      assign(normalizedId);
      return;
    }
    pending.push({
      input: input(),
      assign: (id: string) => {
        assign(id);
        onNewAssigned?.(id);
      },
      countable,
    });
  }

  private appendPendingContextItems(context: LLMContextState, ids: string[]): void {
    if (!ids.length) return;
    const existing = new Set(context.pendingNewContextItemIds ?? []);
    let mutated = false;
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0) continue;
      if (existing.has(id)) continue;
      existing.add(id);
      mutated = true;
    }
    if (mutated) {
      context.pendingNewContextItemIds = Array.from(existing);
    }
  }

  private isCountableConversationMessage(message: LLMMessage): boolean {
    return message instanceof HumanMessage;
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
    if (value instanceof Error) {
      return toPrismaJsonValue({
        name: value.name,
        message: value.message,
        stack: value.stack ?? null,
      });
    }
    try {
      return toPrismaJsonValue(value);
    } catch (err) {
      try {
        return toPrismaJsonValue(JSON.parse(JSON.stringify(value)));
      } catch (nested) {
        this.logger.warn(
          `Failed to serialize LLM payload for run event${this.format({
            error: this.errorInfo(err),
            nested: this.errorInfo(nested),
          })}`,
        );
        return null;
      }
    }
  }

  private extractUsage(message: ResponseMessage): LLMCallUsageMetrics | undefined {
    const usage = message.usage;
    if (!usage) return undefined;

    return {
      inputTokens: usage.input_tokens ?? null,
      cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
    };
  }

  private extractStopReason(message: ResponseMessage): string | null {
    const output = (message as { output?: unknown }).output;
    if (!Array.isArray(output) || output.length === 0) return null;

    const first = output[0] as unknown;
    if (!first) return null;

    if (first instanceof AIMessage) {
      return first.stopReason ?? null;
    }

    if (typeof first === 'object') {
      const candidate = first as Record<string, unknown>;
      const stopSnake = candidate['stop_reason'];
      if (typeof stopSnake === 'string' && stopSnake.length > 0) return stopSnake;
      if (stopSnake === null) return null;

      const stopCamel = candidate['stopReason'];
      if (typeof stopCamel === 'string' && stopCamel.length > 0) return stopCamel;
      if (stopCamel === null) return null;

      const status = candidate['status'];
      if (typeof status === 'string' && status !== 'completed') return status;
    }

    return null;
  }
}
