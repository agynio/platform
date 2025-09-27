import { BaseMessage } from '@langchain/core/messages';

export type NodeOutput = {
  summary?: string;
  messages?: { method: 'replace' | 'append'; items: BaseMessage[] };
  // Signals the graph should terminate this turn (e.g., a tool indicated completion)
  done?: boolean;
  // Restriction enforcement bookkeeping (per turn)
  restrictionInjectionCount?: number;
  restrictionInjected?: boolean;
};
