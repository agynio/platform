import { describe, it, expect } from 'vitest';
import { SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';
import { MemoryConnectorNode } from '../src/nodes/memoryConnector.node';
import { CallModelNode } from '../src/lgnodes/callModel.lgnode';

class FakeLLM {
  public captured: BaseMessage[] | null = null;
  withConfig(_cfg: any) {
    return {
      invoke: async (messages: BaseMessage[]) => {
        this.captured = messages;
        return new AIMessage('ok');
      },
    } as any;
  }
}

describe('CallModelNode memory injection', () => {
  it('inserts memory after system or at last based on placement', async () => {
    const llm = new FakeLLM() as any;
    const node = new CallModelNode([], llm);
    node.setSystemPrompt('sys');

    const { makeFakeDb } = await import('./helpers/fakeDb');
    const { db } = makeFakeDb();
    const logger = new LoggerService();
    const svc = new MemoryService(db as any, logger, {
      nodeId: 'cm',
      scope: 'global',
      threadResolver: () => undefined,
    });
    // Use MemoryService without DB by stubbing coll methods via ensureDir/append that upsert lazily
    await svc.append('/mem/k', 'v');

    const conn = new MemoryConnectorNode(logger);
    conn.setMemoryService(svc);
    conn.setConfig({ placement: 'after_system', content: 'full' });

    // Inject connector
    node.setMemoryConnector(conn);

    const res = await node.action({ messages: [new AIMessage('hello')] as any }, { configurable: { thread_id: 'T' } });
    expect(res.messages?.items?.length).toBe(1);

    const messages = (llm as any).captured as BaseMessage[];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    // Memory should be inserted at index 1
    expect(messages[1]).toBeInstanceOf(SystemMessage);

    // Now test last_message placement
    const conn2 = new MemoryConnectorNode(logger);
    conn2.setMemoryService(svc);
    conn2.setConfig({ placement: 'last_message', content: 'tree' });
    node.setMemoryConnector(conn2);

    (llm as any).captured = null;
    await node.action({ messages: [new AIMessage('hello')] as any }, { configurable: { thread_id: 'T' } });
    const messages2 = (llm as any).captured as BaseMessage[];
    expect(messages2[0]).toBeInstanceOf(SystemMessage);
    // Memory should be last
    expect(messages2[messages2.length - 1]).toBeInstanceOf(SystemMessage);
  });
});
