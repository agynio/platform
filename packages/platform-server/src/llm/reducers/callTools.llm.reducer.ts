import { ToolCallResponse, withToolCall } from '@agyn/tracing';

import { LLMContext, LLMMessage, LLMState } from '../types';
import { FunctionTool, Reducer, ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { LoggerService } from '../../core/services/logger.service';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { McpError } from '../../graph/nodes/mcp/types';
import { ResponseFunctionCallOutputItemList } from 'openai/resources/responses/responses.mjs';

type ToolSchema = FunctionTool['schema'];

type SafeParseResult =
  | { success: true; data: unknown }
  | { success: false; error?: { issues?: unknown } };

type SchemaWithSafeParse = ToolSchema & {
  safeParse: (value: unknown) => SafeParseResult;
};

type SchemaWithParse = ToolSchema & {
  parse: (value: unknown) => unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasSafeParse = (schema: ToolSchema): schema is SchemaWithSafeParse =>
  isRecord(schema) && 'safeParse' in schema && typeof schema.safeParse === 'function';

const hasParse = (schema: ToolSchema): schema is SchemaWithParse =>
  isRecord(schema) && 'parse' in schema && typeof schema.parse === 'function';

@Injectable({ scope: Scope.TRANSIENT })
export class CallToolsLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(@Inject(LoggerService) private logger: LoggerService) {
    super();
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
    const toolsToCall = this.filterToolCalls(state.messages);
    const toolsMap = this.createToolsMap();

    const results = await Promise.all(
      toolsToCall.map(async (t) => {
        const tool = toolsMap.get(t.name);
        const nodeId = ctx?.callerAgent?.getAgentNodeId?.();

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

        const createErrorResponse = (params: {
          code: ToolCallErrorCode;
          message: string;
          originalArgs?: unknown;
          details?: unknown;
          retriable?: boolean;
        }) => {
          const { code, message, originalArgs, details, retriable } = params;
          const payload = {
            status: 'error' as const,
            tool_name: t.name,
            tool_call_id: t.callId,
            error_code: code,
            message,
            ...(originalArgs !== undefined ? { original_args: originalArgs } : {}),
            ...(details !== undefined ? { details } : {}),
            retriable: retriable ?? false,
          };

          return new ToolCallResponse<ToolCallRaw, ToolCallStructuredOutput>({
            raw: message,
            output: payload,
            status: 'error',
          });
        };

        const response = await withToolCall<ToolCallStructuredOutput, ToolCallRaw>(
          {
            name: t.name,
            toolCallId: t.callId,
            input: t.args,
            nodeId,
          },
          async () => {
            if (!tool) {
              this.logger.warn(`Unknown tool called: ${t.name}`);
              return createErrorResponse({
                code: 'TOOL_NOT_FOUND',
                message: `Tool ${t.name} is not registered.`,
                originalArgs: t.args,
              });
            }

            let parsedArgs: unknown;
            try {
              parsedArgs = JSON.parse(t.args);
            } catch (err) {
              this.logger.error('Failed to parse tool arguments', err);
              const details = err instanceof Error ? { message: err.message, name: err.name } : { error: err };
              return createErrorResponse({
                code: 'BAD_JSON_ARGS',
                message: `Invalid JSON arguments for tool ${t.name}.`,
                originalArgs: t.args,
                details,
              });
            }

            let input: unknown;
            if (hasSafeParse(tool.schema)) {
              const validation = tool.schema.safeParse(parsedArgs);
              if (!validation.success) {
                const issues = validation.error?.issues ?? [];
                return createErrorResponse({
                  code: 'SCHEMA_VALIDATION_FAILED',
                  message: `Arguments failed validation for tool ${t.name}.`,
                  originalArgs: parsedArgs,
                  details: issues,
                });
              }
              input = validation.data;
            } else if (hasParse(tool.schema)) {
              try {
                input = tool.schema.parse(parsedArgs);
              } catch (err) {
                const details = err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : { error: err };
                return createErrorResponse({
                  code: 'SCHEMA_VALIDATION_FAILED',
                  message: `Arguments failed validation for tool ${t.name}.`,
                  originalArgs: parsedArgs,
                  details,
                });
              }
            } else {
              return createErrorResponse({
                code: 'SCHEMA_VALIDATION_FAILED',
                message: `Tool ${t.name} schema is missing a parser.`,
                originalArgs: parsedArgs,
              });
            }

            try {
              const raw = await tool.execute(input, ctx);

              if (typeof raw === 'string' && raw.length > 50000) {
                return createErrorResponse({
                  code: 'TOOL_OUTPUT_TOO_LARGE',
                  message: `Tool ${t.name} produced output longer than 50000 characters.`,
                  originalArgs: input,
                  details: { length: raw.length },
                });
              }

              return new ToolCallResponse<ToolCallRaw, ToolCallStructuredOutput>({
                raw,
                output: raw,
                status: 'success',
              });
            } catch (err) {
              this.logger.error('Error occurred while executing tool', err);
              const message = err instanceof Error && err.message ? err.message : 'Unknown error';
              const details = err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : { error: err };
              const code = err instanceof McpError ? 'MCP_CALL_ERROR' : 'TOOL_EXECUTION_ERROR';
              return createErrorResponse({
                code,
                message: `Tool ${t.name} execution failed: ${message}`,
                originalArgs: input,
                details,
              });
            }
          },
        );

        return ToolCallOutputMessage.fromResponse(t.callId, response);
      }),
    );

    // Reset enforcement counters after successful tool execution
    const meta = {
      ...state.meta,
      restrictionInjectionCount: 0,
      restrictionInjected: false,
    };

    return { ...state, messages: [...state.messages, ...results], meta };
  }
}
