import {
  AIMessage,
  FunctionTool,
  HumanMessage,
  LLM,
  Reducer,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMMessage, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';
import { RunEventsService, ToolCallRecord } from '../../events/run-events.service';
import { RunEventStatus, Prisma, ContextItemRole } from '@prisma/client';
import { toPrismaJsonValue } from '../services/messages.serialization';
import { ContextItemInput } from '../services/context-items.utils';

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
    const summaryText = state.summary?.trim();
    const summaryMsg = summaryText ? HumanMessage.fromText(summaryText) : null;
    const mem = this.memoryProvider ? await this.memoryProvider(_ctx, state) : null;

    // Assemble input in a single expression using filter(Boolean)
    const input: (SystemMessage | LLMMessage)[] =
      mem?.place === 'after_system'
        ? ([system, summaryMsg, mem?.msg ?? null, ...state.messages].filter(Boolean) as Array<
            SystemMessage | LLMMessage
          >)
        : mem?.place === 'last_message'
          ? ([system, summaryMsg, ...state.messages, mem?.msg ?? null].filter(Boolean) as Array<
              SystemMessage | LLMMessage
            >)
          : ([system, summaryMsg, ...state.messages].filter(Boolean) as Array<SystemMessage | LLMMessage>);

    const nodeId = _ctx.callerAgent.getAgentNodeId?.() ?? null;
    const llmEvent = await this.runEvents.startLLMCall({
      runId: _ctx.runId,
      threadId: _ctx.threadId,
      nodeId,
      model: this.model,
      contextItems: this.buildContextItems(input),
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

  private buildContextItems(messages: Array<SystemMessage | LLMMessage>): ContextItemInput[] {
    const items: ContextItemInput[] = [];
    for (const message of messages) {
      if (message instanceof SystemMessage) {
        items.push({
          role: ContextItemRole.system,
          contentText: message.text,
          metadata: { type: message.type },
        });
        continue;
      }
      if (message instanceof HumanMessage) {
        items.push({
          role: ContextItemRole.user,
          contentText: message.text,
          metadata: { type: message.type },
        });
        continue;
      }
      if (message instanceof AIMessage) {
        items.push({
          role: ContextItemRole.assistant,
          contentText: message.text,
          metadata: { type: message.type },
        });
        continue;
      }
      if (message instanceof ToolCallOutputMessage) {
        items.push({
          role: ContextItemRole.tool,
          contentText: message.text,
          contentJson: safeToPlain(message),
          metadata: { type: message.type, callId: message.callId },
        });
        continue;
      }
      if (message instanceof ResponseMessage) {
        items.push({
          role: ContextItemRole.assistant,
          contentText: message.text,
          contentJson: safeToPlain(message),
          metadata: { type: message.type },
        });
        continue;
      }
      items.push({
        role: ContextItemRole.other,
        contentJson: safeToPlain(message) ?? null,
      });
    }
    return items;
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

function safeToPlain(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const candidate = value as { toPlain?: () => unknown };
    if (typeof candidate.toPlain === 'function') {
      try {
        return candidate.toPlain();
      } catch {
        return null;
      }
    }
  }
  return null;
}
