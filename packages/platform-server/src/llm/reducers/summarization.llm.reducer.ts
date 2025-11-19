import { LLMContext, LLMContextState, LLMMessage, LLMState } from '../types';

import {
  HumanMessage,
  LLM,
  Reducer,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { stringify } from 'yaml';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMProvisioner } from '../provisioners/llm.provisioner';
import { LoggerService } from '../../core/services/logger.service';
import { RunEventsService } from '../../events/run-events.service';
import { toPrismaJsonValue } from '../services/messages.serialization';
import { Prisma } from '@prisma/client';
import { contextItemInputFromSummary } from '../services/context-items.utils';

@Injectable({ scope: Scope.TRANSIENT })
export class SummarizationLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    @Inject(LLMProvisioner) private readonly provisioner: LLMProvisioner,
    @Inject(LoggerService) protected readonly logger: LoggerService,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
  ) {
    super();
  }

  private params: { model: string; keepTokens: number; maxTokens: number; systemPrompt: string } = {
    model: '',
    keepTokens: 0,
    maxTokens: 0,
    systemPrompt: '',
  };
  private _llm?: LLM;

  get llm(): LLM {
    if (!this._llm) throw new Error('Reducer not initialized: call init() first');
    return this._llm;
  }

  async init(params: { model: string; keepTokens: number; maxTokens: number; systemPrompt: string }) {
    this.params = {
      model: params.model,
      keepTokens: params.keepTokens,
      maxTokens: params.maxTokens,
      systemPrompt: params.systemPrompt,
    };
    this._llm = await this.provisioner.getLLM();
    return this;
  }

  // Token counting for raw string summary text.
  private countTokensFromString(text: string): number {
    return text.length / 4;
  }

  // Token counting for arrays of LLMMessage objects.
  private async countTokensFromMessages(messages: LLMMessage[]): Promise<number> {
    const contents = messages.map((m) => {
      return stringify(m);
    });
    return contents.reduce((acc, cur) => acc + cur.length / 4, 0);
  }

  private async shouldSummarize(state: LLMState): Promise<boolean> {
    const { maxTokens } = this.params;

    const messagesTokens = await this.countTokensFromMessages(state.messages);
    const summaryTokens = state.summary ? this.countTokensFromString(state.summary) : 0;

    return messagesTokens + summaryTokens > maxTokens;
  }

  private async summarize(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    if (ctx.terminateSignal.isActive) return state;
    const { keepTokens, model, systemPrompt } = this.params;
    const messages = state.messages;
    if (!messages.length) return state;

    const context = this.cloneContext(state.context);

    // 1. Split messages into head (latest, minimal to reach keepTokens) and tail (older)
    let [tail, head] = await this.splitHeadTailByTokens(messages, keepTokens);

    // 2. Move all tool outputs without tool calls from head to tail
    [head, tail] = this.moveOrphanToolOutputsToTail(head, tail);

    // 3. Summarize tail
    if (!tail.length) {
      return { ...state, messages: head, context };
    }

    if (tail.length >= context.messageIds.length) {
      context.messageIds = [];
    } else {
      context.messageIds = context.messageIds.slice(tail.length);
    }

    const foldLines = stringify(tail);
    const userPrompt = `Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages (grouped tool responses kept together):\n${foldLines}\n\nReturn only the updated summary.`;

    const previousTokens = await this.countTokensFromMessages(state.messages);

    let newSummary = '';
    let rawPayload: { summary: string; newContext: unknown[] } | null = null;
    try {
      const response = await this.llm.call({
        model,
        input: [
          SystemMessage.fromText(systemPrompt),
          HumanMessage.fromText(userPrompt),
        ],
      });
      newSummary = response.text.trim();
      rawPayload = {
        summary: newSummary,
        newContext: head.map((m) => this.toPlainMessage(m)),
      };
    } catch (error) {
      this.logger.error('Error during summarization LLM call', error);
      if (error instanceof Error) throw error;
      throw new Error(String(error));
    }

    if (!rawPayload) {
      rawPayload = {
        summary: newSummary,
        newContext: head.map((m) => this.toPlainMessage(m)),
      };
    }

    const event = await this.runEvents.recordSummarization({
      runId: ctx.runId,
      threadId: ctx.threadId,
      nodeId: ctx.callerAgent.getAgentNodeId?.() ?? null,
      summaryText: newSummary ?? '',
      oldContextTokens: Math.round(previousTokens),
      newContextCount: head.length,
      raw: this.toJson(rawPayload),
    });
    await this.runEvents.publishEvent(event.id, 'append');

    const summaryText = newSummary ?? '';
    let summaryId = summaryText && context.summary?.text === summaryText ? context.summary.id ?? null : null;
    if (summaryText && !summaryId) {
      const created = await this.runEvents.createContextItems([contextItemInputFromSummary(summaryText)]);
      summaryId = created[0] ?? null;
    }
    context.summary = summaryText ? { id: summaryId, text: summaryText } : undefined;

    return { summary: newSummary, messages: head, context };
  }

  /**
   * Splits messages into [tail, head] where head is the minimal suffix of messages such that
   * the total token count of head >= keepTokens. Tail is the rest (older messages).
   */
  private async splitHeadTailByTokens(
    messages: LLMMessage[],
    keepTokens: number,
  ): Promise<[LLMMessage[], LLMMessage[]]> {
    const tokenCounts = await Promise.all(messages.map((m) => this.countTokensFromMessages([m])));
    let total = 0;
    let splitIdx = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      total += tokenCounts[i];
      if (total >= keepTokens) {
        splitIdx = i;
        break;
      }
    }
    const head = messages.slice(splitIdx);
    const tail = messages.slice(0, splitIdx);
    return [tail, head];
  }

  /**
   * Moves orphan ToolCallOutputMessages (those without a matching ToolCallMessage in head) from head to tail.
   * Returns [newHead, newTail].
   */
  private moveOrphanToolOutputsToTail(head: LLMMessage[], tail: LLMMessage[]): [LLMMessage[], LLMMessage[]] {
    const callIds = new Set<string>();
    for (const m of head) {
      if (m instanceof ResponseMessage) {
        m.output.forEach((o) => {
          if (o instanceof ToolCallMessage) {
            callIds.add(o.callId);
          }
        });
      }
    }
    const newHead: LLMMessage[] = [];
    const newTail = [...tail];
    for (const m of head) {
      if (m instanceof ToolCallOutputMessage) {
        if (callIds.has(m.callId)) {
          newHead.push(m);
        } else {
          newTail.push(m);
        }
      } else {
        newHead.push(m);
      }
    }
    return [newHead, newTail];
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

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    if (!this.params.maxTokens) return state;

    if (ctx.terminateSignal.isActive) return state;

    const shouldSummarize = await this.shouldSummarize(state);
    if (!shouldSummarize) return state;

    const newState = await this.summarize(state, ctx);

    return newState;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;
    try {
      return toPrismaJsonValue(value);
    } catch {
      try {
        return toPrismaJsonValue(JSON.parse(JSON.stringify(value)));
      } catch (err) {
        this.logger.warn('Failed to serialize summarization payload for storage', err);
        return null;
      }
    }
  }

  private toPlainMessage(msg: LLMMessage): unknown {
    const candidate = msg as unknown as { toPlain?: () => unknown; toJSON?: () => unknown };
    if (typeof candidate.toPlain === 'function') return candidate.toPlain();
    if (typeof candidate.toJSON === 'function') return candidate.toJSON();
    return { type: msg.constructor?.name ?? 'UnknownMessage' };
  }
}
