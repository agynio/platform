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

// Local narrow types to avoid relying on possibly-any SDK internals
type ResponseInputItem = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string };
type ResponseInput = ResponseInputItem[];
type ToolWire = { type: 'function'; function: { name: string; description?: string; parameters: object } };
type ResponseCreateWire = { model: string; input: ResponseInput; tools?: ToolWire[] };

// Minimal transforms from internal message format to OpenAI Responses API input
function toOpenAIContent(messages: Message[]): ResponseInput {
  // Map to role/content pairs; support text-only for initial scaffolding
  const parts: ResponseInput = messages.map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant' | 'tool',
    content: m.contentText ?? (m.contentJson ? JSON.stringify(m.contentJson) : ''),
    name: m.name ?? undefined,
  }));
  return parts;
}

// Type guards and extractors to keep nesting shallow
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

function getFirstOutputChunk(resp: unknown): Record<string, unknown> | undefined {
  if (!isRecord(resp)) return undefined;
  const output = (resp as Record<string, unknown>).output;
  if (!Array.isArray(output) || output.length === 0) return undefined;
  const outputArr: unknown[] = output as unknown[];
  const first: unknown = outputArr[0];
  return isRecord(first) ? first : undefined;
}

function extractAssistant(first: Record<string, unknown>): Message | null {
  const typeVal = first.type;
  if (typeVal === 'message') {
    const contentVal = first.content;
    if (!Array.isArray(contentVal)) return { role: 'assistant', contentText: '' };
    const texts: string[] = [];
    for (const c of contentVal) {
      if (isRecord(c) && typeof c.text === 'string' && c.text.length > 0) texts.push(c.text);
    }
    return { role: 'assistant', contentText: texts.join('\n') };
  }
  if (typeVal === 'output_text') {
    const t = first.text;
    return { role: 'assistant', contentText: typeof t === 'string' ? t : '' };
  }
  return null;
}

function extractToolCalls(first: Record<string, unknown>): { id: string; name: string; input: unknown }[] {
  const result: { id: string; name: string; input: unknown }[] = [];
  const toolCallsVal = first.tool_calls;
  if (!Array.isArray(toolCallsVal)) return result;
  for (const tc of toolCallsVal) {
    if (!isRecord(tc)) continue;
    const idVal = tc.id;
    const fnVal = tc.function;
    let nameStr = 'tool';
    let argsVal: unknown = undefined;
    if (isRecord(fnVal)) {
      nameStr = typeof fnVal.name === 'string' ? fnVal.name : 'tool';
      argsVal = fnVal.arguments;
    }
    result.push({ id: typeof idVal === 'string' ? idVal : `${Date.now()}-${Math.random()}`, name: nameStr, input: argsVal });
  }
  return result;
}

export async function callModel(params: CallModelParams): Promise<CallModelResult> {
  const { client, model, messages, tools, signal, stream } = params;
  const input: ResponseInput = toOpenAIContent(messages);

  // Build tool definitions for Responses tool_choice
  const toolDefs: ToolWire[] | undefined = Array.isArray(tools)
    ? tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }))
    : undefined;

  const reqWire: ResponseCreateWire = { model, input };
  if (toolDefs) reqWire.tools = toolDefs;

  // For initial scaffolding, use non-streaming path; streaming wired later
  const response = await client.responses.create(reqWire as unknown as OpenAI.ResponseCreateParams, { signal });
  let assistant: Message = { role: 'assistant', contentText: '' };
  const toolCalls: { id: string; name: string; input: unknown }[] = [];

  const first = getFirstOutputChunk(response);
  if (first) {
    const msg = extractAssistant(first);
    if (msg) assistant = msg;
    toolCalls.push(...extractToolCalls(first));
  }

  return { assistant, toolCalls, rawRequest: reqWire, rawResponse: response };
}

