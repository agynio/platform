llloop (embedded in platform-server)

Lightweight LLM turn engine used by the platform. No DB writes occur here; persistence is handled by platform-server services.

Usage example

```ts
import OpenAI from 'openai';
import { LLLoop } from './engine';
import { createTool } from './tools';
import type { Message, Tool, ToolRegistry } from './types';
import type { Logger } from '../types/logger';

class SimpleRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  add(t: Tool) { this.tools.set(t.name, t); }
  get(name: string) { return this.tools.get(name); }
  list() { return Array.from(this.tools.values()); }
}

const echoTool: Tool = createTool(
  'echo',
  z.object({ text: z.string() }),
  async ({ text }) => `echo: ${text}`,
);

const registry = new SimpleRegistry();
registry.add(echoTool);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const messages: Message[] = [
  { role: 'system', contentText: 'You are a helpful assistant.' },
  { role: 'user', contentText: 'Say hello and call echo with text="hi".' },
];

const logger: Logger = console;
const llloop = new LLLoop(logger, { openai, tools: registry });
const resultState = await llloop.invoke({ state: { model: 'gpt-5', messages }, ctx: { summarizerConfig: { keepTokens: 512, maxTokens: 8192 } } });
console.log(resultState.messages.at(-1)?.contentText);

console.log(result.messages[0]?.contentText);
```

Notes
- No DB writes here; platform-server services handle persistence.
- Only message-level events initially; hooks for streaming can be added later.

Reducer architecture
- LLLoop runs an internal dispatcher over reducers: summarize -> call_model -> tools -> enforce -> route.
- Each reducer has a single responsibility and returns the next step.
- Reducers receive only a lean ctx (summarizerConfig, optional memory, and run metadata). No LLM or ToolRegistry via ctx.
- Operational dependencies (OpenAI client, ToolRegistry, Logger) are injected into reducer constructors by LLLoop when wiring.
- Dispatcher signature: invoke({ reducers, state, ctx, logger }).
- LoopState carries no routing flags; routing is solely via ReduceResult.next.
