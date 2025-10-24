// Minimal legacy CallModelNode used in tests for memory injection behavior
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export class CallModelNode {
  private systemPrompt: string | undefined;
  private memoryConnector: { getPlacement: () => 'after_system' | 'last_message'; renderMessage: () => Promise<SystemMessage> } | undefined;
  constructor(_tools: any[], private llm: any) {}
  setSystemPrompt(text: string) { this.systemPrompt = text; }
  setMemoryConnector(conn: any) { this.memoryConnector = conn; }
  async action(state: { messages: any[] }, _ctx: any) {
    const msgs: any[] = [];
    if (this.systemPrompt) msgs.push(new SystemMessage(this.systemPrompt));
    const placement = this.memoryConnector?.getPlacement();
    if (placement === 'after_system') {
      const m = await this.memoryConnector!.renderMessage();
      msgs.push(m);
    }
    msgs.push(...(state.messages || []));
    if (placement === 'last_message') {
      const m = await this.memoryConnector!.renderMessage();
      msgs.push(m);
    }
    const res = await this.llm.withConfig({}).invoke(msgs);
    return { messages: { items: [res] } };
  }
}

