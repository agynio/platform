Conversation summarization

This repository supports rolling conversation summarization to manage model context. The summarization keeps the last K messages verbatim and folds older history into a concise summary, ensuring the model input stays under a token budget.

Key concepts
- keepLast (K): Number of most recent messages to keep verbatim.
- maxTokens: Token budget for the model input built from [summary-as-system?, ...last K].
- summary: Rolling summary text updated by the LLM as conversation grows.

How it works (centralized in SummarizationNode)
1) Before each model call, the graph runs a SummarizationNode which is responsible for:
   - Determining if summarization is needed by computing tokens for [System(summary)?, ...last K] and comparing to maxTokens.
   - If needed and there is a tail (older than last K), updating the rolling summary by folding the tail.
   - Building the final trimmed context for the model ([System(summary)?, ...last K] capped to maxTokens) and writing it into state.messages.
2) CallModelNode simply prepends System(systemPrompt) to the state.messages and invokes the model.

Prompting
- System: You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.
- Human: Previous summary: <summary or (none)>; Fold in the following messages: <older>; Return only the updated summary.

Budgeting and trimming
- The SummarizationNode uses trimMessages from @langchain/core/messages with includeSystem=true and tokenCounter=llm to ensure the final context fits within maxTokens.
- countTokens() uses llm.getNumTokens() and is used by shouldSummarize() to determine whether to summarize.

Configuration
- SimpleAgent.setConfig accepts:
  - summarizationKeepLast: integer >= 0
  - summarizationMaxTokens: integer > 0
- When both are set, SummarizationNode performs summarization and stores trimmed context into state.messages.
- When unset, behavior is unchanged and all messages are sent.

Examples
- Configure at runtime:
  agent.configure({ summarizationKeepLast: 4, summarizationMaxTokens: 4096 });

Notes
- Summary is stored in the agent state, default ''.
- System prompt is always prepended to the final input by CallModelNode.
