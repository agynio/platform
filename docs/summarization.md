Conversation summarization

This repository supports rolling conversation summarization to manage model context. The summarization keeps the last K messages verbatim and folds older history into a concise summary, ensuring the model input stays under a token budget.

Key concepts
- keepLast (K): Number of most recent messages to keep verbatim.
- maxTokens: Token budget for the model input built from [summary-as-system?, ...last K].
- summary: Rolling summary text updated by the LLM as conversation grows.

How it works
1) Before each model call, the graph runs a SummarizationNode.
2) If older history exists and either there is no summary yet or the current summary + last K exceed maxTokens, we prompt the LLM to update the summary from the older messages.
3) The SimpleAgent state stores the latest summary and prunes messages to last K when a new summary is produced.
4) CallModelNode constructs final model input as: [System(systemPrompt), System(summary)?, ...last K], trimmed to maxTokens.

Prompting
- System: You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.
- Human: Previous summary: <summary or (none)>; Fold in the following messages: <older>; Return only the updated summary.

Budgeting and trimming
- The buildContextForModel helper uses trimMessages from @langchain/core/messages with includeSystem=true and tokenCounter=llm to ensure the final context fits within maxTokens.
- countTokens() uses llm.getNumTokens() and is used by shouldSummarize() to determine whether to summarize.

Configuration
- SimpleAgent.setConfig accepts:
  - summarizationKeepLast: integer >= 0
  - summarizationMaxTokens: integer > 0
- When both are set, CallModelNode switches to trimmed context mode using buildContextForModel.
- When unset, behavior is unchanged.

Examples
- Configure at runtime:
  agent.setConfig({ summarizationKeepLast: 4, summarizationMaxTokens: 4096 });

Notes
- Summary is stored in the agent state, default ''.
- System prompt is always prepended to the final input.
