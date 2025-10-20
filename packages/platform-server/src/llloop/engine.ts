import type OpenAI from 'openai';
import { callModel } from './openai/client.js';
import type {
  EngineEvents,
  EngineRunResult,
  Message,
  OpenAIClient,
  ToolDef,
  ToolRegistry,
} from './types.js';

export interface RunTurnParams {
  model: string;
  messages: Message[];
  tools?: ToolDef[];
  memoryMessage?: Message | null;
  restriction?: { enabled: boolean; message: string; maxInjections?: number };
  streaming?: boolean;
  signal?: AbortSignal;
}

export async function runTurn(
  params: RunTurnParams,
  deps: { openai: OpenAIClient; tools: ToolRegistry; logger?: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void; debug?: (...a: unknown[]) => void } },
  events?: EngineEvents,
): Promise<EngineRunResult> {
  const { model, messages, tools, memoryMessage, streaming, signal } = params;

  const allMessages: Message[] = [];
  if (memoryMessage) allMessages.push(memoryMessage);
  allMessages.push(...messages);

  // Initial scaffolding: single call_model step only
  const res = await callModel({
    client: (deps.openai as unknown as OpenAI),
    model,
    messages: allMessages,
    tools,
    stream: streaming,
    signal,
  });

  events?.onMessage?.(res.assistant);
  for (const tc of res.toolCalls) events?.onToolCall?.(tc);

  return { messages: [res.assistant], toolCalls: res.toolCalls, rawRequest: res.rawRequest, rawResponse: res.rawResponse };
}

