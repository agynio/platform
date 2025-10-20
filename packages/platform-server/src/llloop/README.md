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
const result = await llloop.invoke({ model: 'gpt-5', messages, streaming: false });

console.log(result.messages[0]?.contentText);
```

Notes
- No DB writes here; platform-server services handle persistence.
- Only message-level events initially; hooks for streaming can be added later.
