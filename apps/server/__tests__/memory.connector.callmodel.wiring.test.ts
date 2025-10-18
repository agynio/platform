import { describe, it, expect, vi } from 'vitest';
import { CallModelNode } from '../src/nodes/call-model.node';
import { BaseTool } from '../src/tools/base.tool';
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';

// Mock ChatOpenAI to avoid network and capture messages passed to invoke
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    lastMessages: BaseMessage[] = [];
    withConfig(_cfg: any) { return { invoke: async (msgs: BaseMessage[]) => { this.lastMessages = msgs; return new AIMessage('ok'); } } as any; }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

// Minimal tool stub
class DummyTool extends BaseTool { init(): any { return { name: 'dummy', invoke: async () => 'x' }; } }

describe('CallModel memory injection', () => {
  it('inserts memory message after system when placement=after_system', async () => {
    const node = new CallModelNode([new DummyTool()] as any, new (await import('@langchain/openai')).ChatOpenAI({ model: 'x', apiKey: 'k' }) as any);
    node.setSystemPrompt('SYS');
    node.setMemoryConnector({
      getPlacement: () => 'after_system',
      renderMessage: async () => new SystemMessage('MEM'),
    } as any);
    const res = await node.action({ messages: [] as BaseMessage[] }, { configurable: { thread_id: 't' } } as any);
    const llm = (node as any).llm as any; // access mock to get lastMessages
    const msgs = llm.lastMessages as BaseMessage[];
    expect((msgs[0] as any).content).toBe('SYS');
    expect((msgs[1] as any).content).toBe('MEM');
  });

  it('appends memory message at end when placement=last_message', async () => {
    const node = new CallModelNode([new DummyTool()] as any, new (await import('@langchain/openai')).ChatOpenAI({ model: 'x', apiKey: 'k' }) as any);
    node.setSystemPrompt('SYS');
    node.setMemoryConnector({
      getPlacement: () => 'last_message',
      renderMessage: async () => new SystemMessage('MEM'),
    } as any);
    const res = await node.action({ messages: [new SystemMessage('S')] as BaseMessage[] }, { configurable: { thread_id: 't' } } as any);
    const llm = (node as any).llm as any;
    const msgs = llm.lastMessages as BaseMessage[];
    expect((msgs[msgs.length - 1] as any).content).toBe('MEM');
  });
});
