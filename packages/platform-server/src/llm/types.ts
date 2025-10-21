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
};

export type LLMContext = {
  threadId: string;
};
