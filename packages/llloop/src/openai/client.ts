import type OpenAI from 'openai';
import { type Message } from '../types.js';

export interface CallModelParams {
  client: OpenAI;
  model: string;
  messages: Message[];
  tools?: Array<{ name: string; description?: string; schema: object }>;
  signal?: AbortSignal;
  stream?: boolean;
}

export type CallModelResult = {
  assistant: Message;
  toolCalls: { id: string; name: string; input: unknown }[];
  rawRequest?: unknown;
  rawResponse?: unknown;
};

// Minimal transforms from internal message format to OpenAI Responses API input
function toOpenAIContent(messages: Message[]): OpenAI.ResponseCreateParams['input'] {
  // Map to role/content pairs; support text-only for initial scaffolding
  const parts: OpenAI.ResponseCreateParams['input'] = messages.map((m) => ({
    role: m.role as any,
    content: m.contentText ?? (m.contentJson ? JSON.stringify(m.contentJson) : ''),
    name: m.name ?? undefined,
  }));
  return parts;
}

export async function callModel(params: CallModelParams): Promise<CallModelResult> {
  const { client, model, messages, tools, signal, stream } = params;
  const input = toOpenAIContent(messages);

  // Build tool definitions for Responses tool_choice
  const toolDefs = tools?.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.schema },
  }));

  const req: OpenAI.ResponseCreateParams = {
    model,
    input,
    ...(toolDefs ? { tools: toolDefs } : {}),
  } as any;

  // For initial scaffolding, use non-streaming path; streaming wired later
  const response = await client.responses.create(req, { signal });
  let assistant: Message = { role: 'assistant', contentText: '' };
  const toolCalls: { id: string; name: string; input: unknown }[] = [];

  // Extract assistant text and tool calls from Responses output (minimal handling)
  // Note: structure varies; handle text output and tool calls via output[0].
  const output = (response as any).output as any[] | undefined;
  if (output && output.length) {
    const first = output[0];
    if (first.type === 'message') {
      const msg = first;
      const contentText = (msg.content?.map((c: any) => c.text).filter(Boolean).join('\n')) || '';
      assistant = { role: 'assistant', contentText };
      // Tool calls can be in msg.tool_calls for some providers
      const tcs = (msg.tool_calls as any[]) || [];
      for (const tc of tcs) {
        toolCalls.push({ id: tc.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`), name: tc.function?.name || 'tool', input: tc.function?.arguments });
      }
    } else if (first.type === 'output_text') {
      assistant = { role: 'assistant', contentText: first.text };
    }
  }

  return { assistant, toolCalls, rawRequest: req, rawResponse: response };
}

