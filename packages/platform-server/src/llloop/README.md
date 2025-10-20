llloop (embedded in platform-server)

Lightweight LLM turn engine used by the platform. No DB writes occur here; persistence is handled by platform-server services.

Usage example

```ts
import OpenAI from 'openai';
import { LLLoop } from './engine';
import type { Message, Tool, ToolRegistry } from './types';
import type { Logger } from '../types/logger';

class SimpleRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  register(t: Tool) { this.tools.set(t.name, t); }
  get(name: string) { return this.tools.get(name); }
  list() { return Array.from(this.tools.values()); }
}

const echoTool: Tool = {
  name: 'echo',
  schema: z.object({ text: z.string() }),
  async invoke(args) { const { text } = this.schema.parse(args); return `echo: ${text}`; },
};

const registry = new SimpleRegistry();
registry.register(echoTool);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const messages: Message[] = [
  { role: 'system', contentText: 'You are a helpful assistant.' },
  { role: 'user', contentText: 'Say hello and call echo with text="hi".' },
];

const logger: Logger = console;
const llloop = new LLLoop(logger, { openai, tools: registry });
const { state, appended } = await llloop.invoke({ state: { model: 'gpt-5', messages }, ctx: { summarizerConfig: { keepTokens: 512, maxTokens: 8192 } } });
console.log('appended:', appended.map(m => m.contentText));

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
- Replace-only semantics: reducers must return the full messages array; the engine computes a diff (appended messages) to emit events in-memory (no per-message persistence).

Snapshot persistence
- LLLoop uses a snapshot-only persistence model. A SnapshotStore upserts the full LoopState per (nodeId, threadId).
- Before invoke: load existing snapshot and merge with incoming messages if needed; after invoke: upsert the new state.
- Run entities (if enabled) may track lifecycle only; ConversationSnapshot is the authoritative state.
