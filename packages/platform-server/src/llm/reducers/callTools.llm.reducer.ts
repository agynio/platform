import { ToolCallResponse, withToolCall } from '@agyn/tracing';

import { LLMContext, LLMMessage, LLMState } from '../types';
import { FunctionTool, Reducer, ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';

export class CallToolsLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(private tools: FunctionTool[]) {
    super();
  }

  filterToolCalls(messages: LLMMessage[]) {
    const fulfilledCallIds = new Set<string>();
    const result: ToolCallMessage[] = [];

    messages.forEach((m) => {
      if (m instanceof ToolCallOutputMessage) {
        fulfilledCallIds.add(m.callId);
        return;
      }
      if (m instanceof ResponseMessage) {
        m.output.forEach((o) => {
          if (o instanceof ToolCallMessage) {
            !fulfilledCallIds.has(o.callId) && result.push(o);
          }
        });
      }
    });
    return result;
  }

  createToolsMap() {
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
        if (!tool) throw new Error(`Unknown tool called: ${t.name}`);
        const input = tool.schema.parse(JSON.parse(t.args));

        const response = await withToolCall(
          {
            name: tool.name,
            toolCallId: t.callId,
            input,
          },
          async () => {
            const raw = await tool.execute(input, ctx);
            return new ToolCallResponse({
              raw,
              status: 'success',
            });
          },
        );

        return ToolCallOutputMessage.fromResponse(t.callId, response);
      }),
    );

    return { ...state, messages: [...state.messages, ...results] };
  }
}
