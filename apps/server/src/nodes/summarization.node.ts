// Compatibility shim: preserve legacy import path '../nodes/summarization.node'
export {
  SummarizationNode,
  type ChatState,
  type SummarizationOptions,
  countTokens,
  shouldSummarize,
  summarizationNode,
} from './lgnodes/summarization.lgnode';
