import { FunctionTool, HumanMessage, LLM, Reducer, ResponseMessage, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMMessage, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';
import { RunEventsService, ToolCallRecord } from '../../run-events/run-events.service';
import { RunEventStatus, Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../services/messages.serialization';

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
      prompt: this.serializeMessages(input),
    });

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
      if (error instanceof Error) throw error;
      throw new Error(String(error));
    }
  }

  private serializeMessages(messages: Array<SystemMessage | LLMMessage>): string {
    try {
      const payload = messages.map((msg) => {
        const candidate = msg as unknown as { toPlain?: () => unknown; toJSON?: () => unknown };
        if (typeof candidate.toPlain === 'function') return candidate.toPlain();
        if (typeof candidate.toJSON === 'function') return candidate.toJSON();
        return msg;
      });
      return JSON.stringify(payload);
    } catch (err) {
      this.logger.warn('Failed to serialize LLM prompt for run event', err);
      return messages
        .map((m) => {
          const candidate = m as { text?: unknown; toString?: () => string };
          if (typeof candidate.text === 'string') return candidate.text;
          if (typeof candidate.toString === 'function') return candidate.toString();
          return m.constructor?.name ?? 'Message';
        })
        .join('\n---\n');
    }
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
