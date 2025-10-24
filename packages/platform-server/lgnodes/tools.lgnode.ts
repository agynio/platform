// Minimal legacy ToolsNode used only in tests for oversize output handling
import { AIMessage } from '@langchain/core/messages';
import { BaseTool } from '../nodes/tools/base.tool';
import { LoggerService } from '../src/core/services/logger.service';

export class ToolsNode {
  constructor(private tools: BaseTool[], private logger: LoggerService = new LoggerService()) {}
  async action(state: any, runtime: any) {
    const last = (state?.messages || []).at(-1);
    if (!(last instanceof AIMessage)) return { messages: { items: [] } };
    const call = (last as any).tool_calls?.[0];
    if (!call) return { messages: { items: [] } };
    const tool = this.tools.find((t) => t.init().name === call.name) || this.tools[0];
    const dyn = tool.init();
    const raw = await dyn.invoke(call.args || {}, { configurable: { thread_id: (runtime?.configurable?.thread_id) || 't' } });
    const out = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const len = out.length;
    if (len > 50000) {
      try {
        const c = await (tool as any).getContainerForThread?.((runtime?.configurable?.thread_id) || 't');
        if (c?.putArchive) {
          const path = `/tmp/${Date.now()}.txt`;
          const buf = Buffer.from(out, 'utf8');
          await c.putArchive(buf, { path });
          return { messages: { items: [{ content: `Error: output is too long (${len} characters). The output has been saved to ${path}` }] } };
        }
        return { messages: { items: [{ content: `Error (output too long: ${len} characters).` }] } };
      } catch {
        return { messages: { items: [{ content: `Error (output too long: ${len} characters).` }] } };
      }
    }
    return { messages: { items: [{ content: out }] } };
  }
}

