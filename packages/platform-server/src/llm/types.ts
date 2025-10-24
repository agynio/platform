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

import {
  AIMessage,
  HumanMessage,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { Signal } from '../signal';
import { AgentNode } from '../nodes/agent/agent.node';

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

export type LLMMessage = HumanMessage | SystemMessage | ResponseMessage | ToolCallOutputMessage;

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
  callerAgent: AgentNode;
};
