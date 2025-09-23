import { BaseMessage } from '@langchain/core/messages';

export type NodeOutput = { summary?: string; messages?: { method: 'replace' | 'append'; items: BaseMessage[] } };
