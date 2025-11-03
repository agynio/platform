// export type ResponseInputItem =
//   | EasyInputMessage
//   | ResponseInputItem.Message
//   | ResponseOutputMessage
//   | ResponseFileSearchToolCall
//   | ResponseComputerToolCall
//   | ResponseInputItem.ComputerCallOutput
//   | ResponseFunctionWebSearch
//   | ResponseFunctionToolCall
//   | ResponseInputItem.FunctionCallOutput
//   | ResponseReasoningItem
//   | ResponseInputItem.ImageGenerationCall
//   | ResponseCodeInterpreterToolCall
//   | ResponseInputItem.LocalShellCall
//   | ResponseInputItem.LocalShellCallOutput
//   | ResponseInputItem.McpListTools
//   | ResponseInputItem.McpApprovalRequest
//   | ResponseInputItem.McpApprovalResponse
//   | ResponseInputItem.McpCall
//   | ResponseCustomToolCallOutput
//   | ResponseCustomToolCall
//   | ResponseInputItem.ItemReference;

import { AIMessage, HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import { Signal } from '../signal';
// Minimal interface required from a caller agent within LLM execution context.
// AgentNode implements this shape; tests can provide light stubs without heavy DI.
// Narrow buffer message shape used by AgentNode message queue
export type BufferLLMMessage = HumanMessage | AIMessage | SystemMessage;

// Minimal interface required from a caller agent within LLM execution context.
export interface CallerAgent {
  getAgentNodeId?: () => string | undefined;
  // AgentNode supports invoking with buffer-safe messages only
  invoke: (threadId: string, messages: BufferLLMMessage[]) => Promise<ResponseMessage | ToolCallOutputMessage>;
  // Optional static config surface used by reducers (subset only)
  config?: {
    restrictOutput?: boolean;
    restrictionMaxInjections?: number;
    restrictionMessage?: string;
  };
}

// export type ResponseOutputItem =
//   | ResponseOutputMessage
//   | ResponseFileSearchToolCall
//   | ResponseFunctionToolCall
//   | ResponseFunctionWebSearch
//   | ResponseComputerToolCall
//   | ResponseReasoningItem
//   | ResponseOutputItem.ImageGenerationCall
//   | ResponseCodeInterpreterToolCall
//   | ResponseOutputItem.LocalShellCall
//   | ResponseOutputItem.McpCall
//   | ResponseOutputItem.McpListTools
//   | ResponseOutputItem.McpApprovalRequest
//   | ResponseCustomToolCall;

///////////

export type LLMMessage = HumanMessage | SystemMessage | AIMessage | ResponseMessage | ToolCallOutputMessage;

export type LLMState = {
  messages: LLMMessage[];
  summary?: string;
  // Per-turn meta used for restriction enforcement and telemetry
  meta?: {
    restrictionInjectionCount?: number;
    restrictionInjected?: boolean;
  };
};

export type LLMContext = {
  threadId: string;
  finishSignal: Signal;
  callerAgent: CallerAgent;
};
