import { SummarizeResponse, withSummarize } from '@agyn/tracing';
import { LLMContext, LLMMessage, LLMState } from '../types';

import {
  HumanMessage,
  LLM,
  Reducer,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { stringify } from 'yaml';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SummarizationLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(private llm: LLM) {
    super();
  }

  private params: { model: string; keepTokens: number; maxTokens: number; systemPrompt: string } = {
    model: '',
    keepTokens: 0,
    maxTokens: 0,
    systemPrompt: '',
  };

  init(params: { model: string; keepTokens: number; maxTokens: number; systemPrompt: string }) {
    this.params = params;
    return this;
  }

  // Token counting for raw string summary text.
  private countTokensFromString(text: string): number {
    return text.length / 4;
  }

  // Token counting for arrays of LLMMessage objects.
  private async countTokensFromMessages(messages: LLMMessage[]): Promise<number> {
    const contents = messages.map((m) => {
      return stringify(m);
    });
    return contents.reduce((acc, cur) => acc + cur.length / 4, 0);
  }

  private async shouldSummarize(state: LLMState): Promise<boolean> {
    const { maxTokens } = this.params;

    const messagesTokens = await this.countTokensFromMessages(state.messages);
    const summaryTokens = state.summary ? this.countTokensFromString(state.summary) : 0;

    return messagesTokens + summaryTokens > maxTokens;
  }

  private async summarize(state: LLMState): Promise<LLMState> {
    const { keepTokens, model, systemPrompt } = this.params;
    const messages = state.messages;
    if (!messages.length) return state;

    // 1. Split messages into head (latest, minimal to reach keepTokens) and tail (older)
    let [tail, head] = await this.splitHeadTailByTokens(messages, keepTokens);

    // 2. Move all tool outputs without tool calls from head to tail
    [head, tail] = this.moveOrphanToolOutputsToTail(head, tail);

    // 3. Summarize tail
    if (!tail.length) {
      return { ...state, messages: head };
    }

    const foldLines = stringify(tail);
    const userPrompt = `Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages (grouped tool responses kept together):\n${foldLines}\n\nReturn only the updated summary.`;

    const task = await withSummarize(
      {
        oldContext: state.messages,
        oldContextTokensCount: await this.countTokensFromMessages(state.messages),
      },
      async () => {
        const response = await this.llm.call({
          model,
          input: [
            SystemMessage.fromText(systemPrompt), //
            HumanMessage.fromText(userPrompt),
          ],
        });
        const newSummary = response.text.trim();
        return new SummarizeResponse({
          raw: { summary: newSummary, newContext: head },
          summary: newSummary,
          newContext: head,
        });
      },
    );

    return { summary: task.summary, messages: head };
  }

  /**
   * Splits messages into [tail, head] where head is the minimal suffix of messages such that
   * the total token count of head >= keepTokens. Tail is the rest (older messages).
   */
  private async splitHeadTailByTokens(
    messages: LLMMessage[],
    keepTokens: number,
  ): Promise<[LLMMessage[], LLMMessage[]]> {
    const tokenCounts = await Promise.all(messages.map((m) => this.countTokensFromMessages([m])));
    let total = 0;
    let splitIdx = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      total += tokenCounts[i];
      if (total >= keepTokens) {
        splitIdx = i;
        break;
      }
    }
    const head = messages.slice(splitIdx);
    const tail = messages.slice(0, splitIdx);
    return [tail, head];
  }

  /**
   * Moves orphan ToolCallOutputMessages (those without a matching ToolCallMessage in head) from head to tail.
   * Returns [newHead, newTail].
   */
  private moveOrphanToolOutputsToTail(head: LLMMessage[], tail: LLMMessage[]): [LLMMessage[], LLMMessage[]] {
    const callIds = new Set<string>();
    for (const m of head) {
      if (m instanceof ResponseMessage) {
        m.output.forEach((o) => {
          if (o instanceof ToolCallMessage) {
            callIds.add(o.callId);
          }
        });
      }
    }
    const newHead: LLMMessage[] = [];
    const newTail = [...tail];
    for (const m of head) {
      if (m instanceof ToolCallOutputMessage) {
        if (callIds.has(m.callId)) {
          newHead.push(m);
        } else {
          newTail.push(m);
        }
      } else {
        newHead.push(m);
      }
    }
    return [newHead, newTail];
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!this.params.maxTokens) return state;

    const shouldSummarize = await this.shouldSummarize(state);
    if (!shouldSummarize) return state;

    const newState = await this.summarize(state);

    return newState;
  }
}
