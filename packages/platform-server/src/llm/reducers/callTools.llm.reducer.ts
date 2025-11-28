import { LLMContext, LLMContextState, LLMMessage, LLMState } from '../types';
import { FunctionTool, Reducer, ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { McpError } from '../../nodes/mcp/types';
import { RunEventsService } from '../../events/run-events.service';
import { EventsBusService } from '../../events/events-bus.service';
import { ToolExecStatus, Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../services/messages.serialization';
import type { ResponseFunctionCallOutputItemList } from 'openai/resources/responses/responses.mjs';
import { contextItemInputFromMessage } from '../services/context-items.utils';
import { ShellCommandTool } from '../../nodes/tools/shell_command/shell_command.tool';

type ToolCallErrorCode =
  | 'BAD_JSON_ARGS'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'TOOL_NOT_FOUND'
  | 'TOOL_EXECUTION_ERROR'
  | 'TOOL_OUTPUT_TOO_LARGE'
  | 'MCP_CALL_ERROR';

type ToolCallRaw = string | ResponseFunctionCallOutputItemList;
type ToolCallErrorPayload = {
  status: 'error';
  tool_name: string;
  tool_call_id: string;
  error_code: ToolCallErrorCode;
  message: string;
  original_args?: unknown;
  details?: unknown;
  retriable: boolean;
};
type ToolCallStructuredOutput = ToolCallRaw | ToolCallErrorPayload;

type ToolCallResult = {
  status: 'success' | 'error';
  raw: ToolCallRaw;
  output: ToolCallStructuredOutput;
};

const isToolCallRaw = (value: unknown): value is ToolCallRaw =>
  typeof value === 'string' || Array.isArray(value);

const SHELL_EXIT_CODE_REGEX = /^\[exit code (-?\d+)]/;

const isNonZeroShellExitMessage = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const match = SHELL_EXIT_CODE_REGEX.exec(value);
  if (!match) return false;
  const parsed = Number.parseInt(match[1], 10);
  if (Number.isNaN(parsed)) return false;
  return parsed !== 0;
};

@Injectable({ scope: Scope.TRANSIENT })
export class CallToolsLLMReducer extends Reducer<LLMState, LLMContext> {
  private readonly logger = new Logger(CallToolsLLMReducer.name);
  constructor(
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {
    super();
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

  private tools?: FunctionTool[];

  init(params: { tools: FunctionTool[] }) {
    this.tools = params.tools || [];
    return this;
  }

  filterToolCalls(messages: LLMMessage[]) {
    const result: ToolCallMessage[] = [];

    const m = messages.at(-1);
    if (m instanceof ResponseMessage) {
      m.output.forEach((o) => {
        if (o instanceof ToolCallMessage) {
          result.push(o);
        }
      });
    }

    return result;
  }

  createToolsMap() {
    if (!this.tools) throw new Error('CallToolsLLMReducer not initialized');
    const toolsMap = new Map<string, FunctionTool>();
    this.tools.forEach((t) => toolsMap.set(t.name, t));
    return toolsMap;
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    if (ctx.terminateSignal.isActive) {
      return state;
    }
    const toolsToCall = this.filterToolCalls(state.messages);
    const toolsMap = this.createToolsMap();
    const nodeId = ctx?.callerAgent?.getAgentNodeId?.() ?? null;
    const llmEventId = state.meta?.lastLLMEventId ?? null;

    const results = await Promise.all(
      toolsToCall.map(async (toolCall) => {
        const tool = toolsMap.get(toolCall.name);
        const execution = await this.executeToolCall({
          ctx,
          llmEventId,
          nodeId,
          tool,
          toolCall,
        });
        const outputForMessage = this.buildToolMessagePayload(execution);
        return ToolCallOutputMessage.fromResponse(toolCall.callId, outputForMessage);
      }),
    );

    if (ctx.terminateSignal.isActive) {
      return state;
    }

    // Reset enforcement counters after successful tool execution
    const meta = {
      ...state.meta,
      restrictionInjectionCount: 0,
      restrictionInjected: false,
    };

    const context = this.cloneContext(state.context);
    if (results.length > 0) {
      const inputs = results.map((msg) => contextItemInputFromMessage(msg));
      const created = await this.runEvents.createContextItems(inputs);
      context.messageIds = [...context.messageIds, ...created];
    }

    return { ...state, messages: [...state.messages, ...results], meta, context };
  }

  private async executeToolCall(params: {
    ctx: LLMContext;
    llmEventId: string | null;
    nodeId: string | null;
    tool: FunctionTool | undefined;
    toolCall: ToolCallMessage;
  }): Promise<ToolCallResult> {
    const { ctx, llmEventId, nodeId, tool, toolCall } = params;

    let startedEventId: string | null = null;
    let caughtError: unknown | null = null;
    let response: ToolCallResult | undefined;

    const createErrorResponse = (args: {
      code: ToolCallErrorCode;
      message: string;
      originalArgs?: unknown;
      details?: unknown;
      retriable?: boolean;
    }): ToolCallResult => {
      const { code, message, originalArgs, details, retriable } = args;
      return {
        status: 'error',
        raw: message,
        output: {
          status: 'error',
          tool_name: toolCall.name,
          tool_call_id: toolCall.callId,
          error_code: code,
          message,
          ...(originalArgs !== undefined ? { original_args: originalArgs } : {}),
          ...(details !== undefined ? { details } : {}),
          retriable: retriable ?? false,
        },
      };
    };

    try {
      if (!tool) {
        this.logger.warn(
          `Unknown tool called${this.format({ tool: toolCall.name, callId: toolCall.callId, threadId: ctx.threadId })}`,
        );
        response = createErrorResponse({
          code: 'TOOL_NOT_FOUND',
          message: `Tool ${toolCall.name} is not registered.`,
          originalArgs: toolCall.args,
        });
        return response;
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.args);
      } catch (err) {
        this.logger.error(
          `Failed to parse tool arguments${this.format({
            tool: toolCall.name,
            callId: toolCall.callId,
            error: this.errorInfo(err),
          })}`,
        );
        const details = err instanceof Error ? { message: err.message, name: err.name } : { error: err };
        response = createErrorResponse({
          code: 'BAD_JSON_ARGS',
          message: `Invalid JSON arguments for tool ${toolCall.name}.`,
          originalArgs: toolCall.args,
          details,
        });
        return response;
      }

      const validation = tool.schema.safeParse(parsedArgs);
      if (!validation.success) {
        const issues = validation.error?.issues ?? [];
        response = createErrorResponse({
          code: 'SCHEMA_VALIDATION_FAILED',
          message: `Arguments failed validation for tool ${toolCall.name}.`,
          originalArgs: parsedArgs,
          details: issues,
        });
        return response;
      }
      const input = validation.data;

      try {
        let serializedInput: Prisma.InputJsonValue;
        try {
          serializedInput = toPrismaJsonValue(input);
        } catch (err) {
          this.logger.warn(
            `Failed to serialize tool input for run event${this.format({
              tool: tool.name,
              callId: toolCall.callId,
              error: this.errorInfo(err),
            })}`,
          );
          serializedInput = toPrismaJsonValue(null);
        }

        const started = await this.runEvents.startToolExecution({
          runId: ctx.runId,
          threadId: ctx.threadId,
          nodeId,
          toolName: tool.name,
          toolCallId: toolCall.callId,
          llmCallEventId: llmEventId ?? undefined,
          input: serializedInput,
        });
        startedEventId = started.id;
        await this.eventsBus.publishEvent(started.id, 'append');
      } catch (err) {
        this.logger.warn(
          `Failed to record tool execution start${this.format({
            tool: tool?.name,
            callId: toolCall.callId,
            error: this.errorInfo(err),
          })}`,
        );
      }

      try {
        let raw: unknown;
        if (tool instanceof ShellCommandTool && startedEventId) {
          raw = await tool.executeStreaming(
            input as Parameters<ShellCommandTool['executeStreaming']>[0],
            ctx,
            {
              runId: ctx.runId,
              threadId: ctx.threadId,
              eventId: startedEventId,
            },
          );
        } else {
          raw = await tool.execute(input as Parameters<FunctionTool['execute']>[0], ctx);
        }

        if (typeof raw === 'string' && raw.length > 50000) {
          response = createErrorResponse({
            code: 'TOOL_OUTPUT_TOO_LARGE',
            message: `Tool ${toolCall.name} produced output longer than 50000 characters.`,
            originalArgs: input,
            details: { length: raw.length },
          });
        } else if (!isToolCallRaw(raw)) {
          response = createErrorResponse({
            code: 'TOOL_EXECUTION_ERROR',
            message: `Tool ${toolCall.name} returned unsupported output type.`,
            originalArgs: input,
            details: { receivedType: typeof raw },
          });
        } else {
          const shouldFlagNonZeroShellExit =
            tool instanceof ShellCommandTool && isNonZeroShellExitMessage(raw);

          response = {
            status: shouldFlagNonZeroShellExit ? 'error' : 'success',
            raw,
            output: raw,
          };
        }
      } catch (err) {
        this.logger.error(
          `Error occurred while executing tool${this.format({
            tool: tool?.name ?? toolCall.name,
            callId: toolCall.callId,
            error: this.errorInfo(err),
          })}`,
        );
        const message = err instanceof Error && err.message ? err.message : 'Unknown error';
        const details =
          err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : { error: err };
        const code = err instanceof McpError ? 'MCP_CALL_ERROR' : 'TOOL_EXECUTION_ERROR';
        response = createErrorResponse({
          code,
          message: `Tool ${toolCall.name} execution failed: ${message}`,
          originalArgs: input,
          details,
        });
      }

      if (!response) {
        throw new Error('tool_response_missing');
      }

      return response;
    } catch (err) {
      caughtError = err;
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      if (startedEventId) {
        try {
          await this.finalizeToolExecutionEvent(startedEventId, response, caughtError);
        } catch (finalizeErr: unknown) {
          this.logger.warn(
            `Failed to finalize tool execution event${this.format({
              eventId: startedEventId,
              error: this.errorInfo(finalizeErr),
            })}`,
          );
        }
      }
    }
  }

  private buildToolMessagePayload(response: ToolCallResult): ToolCallRaw {
    const payload = response.output ?? response.raw;
    if (response.status === 'success') {
      if (typeof payload === 'string') return payload;
      if (Array.isArray(payload)) return payload as ResponseFunctionCallOutputItemList;
      throw new Error('tool_response_invalid_output');
    }

    if (typeof payload === 'string') return payload;
    try {
      return JSON.stringify(payload);
    } catch {
      return 'Tool execution failed';
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;
    try {
      return toPrismaJsonValue(value);
    } catch (err) {
      try {
        return toPrismaJsonValue(JSON.parse(JSON.stringify(value)));
      } catch (nested) {
        this.logger.warn(
          `Failed to serialize tool payload for run event${this.format({
            error: this.errorInfo(err),
            nested: this.errorInfo(nested),
          })}`,
        );
        return null;
      }
    }
  }

  private extractErrorMessage(response: ToolCallResult | undefined): string | null {
    if (!response || response.status === 'success') return null;
    if (typeof response.output === 'string') return response.output;
    if (typeof response.raw === 'string') return response.raw;
    return null;
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

  private async finalizeToolExecutionEvent(
    eventId: string,
    response: ToolCallResult | undefined,
    caughtError: unknown | null,
  ): Promise<void> {
    if (caughtError !== null) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : String(caughtError);
      await this.runEvents.completeToolExecution({
        eventId,
        status: ToolExecStatus.error,
        errorMessage,
        raw: null,
      });
      await this.eventsBus.publishEvent(eventId, 'update');
      return;
    }

    if (!response) return;

    const status = response.status === 'success' ? ToolExecStatus.success : ToolExecStatus.error;
    await this.runEvents.completeToolExecution({
      eventId,
      status,
      output: this.toJson(response.output ?? response.raw),
      raw: this.toJson(response.raw),
      errorMessage: status === ToolExecStatus.success ? null : this.extractErrorMessage(response),
    });
    await this.eventsBus.publishEvent(eventId, 'update');
  }
}
