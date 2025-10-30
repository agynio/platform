
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { AIMessage, HumanMessage, ResponseMessage } from '@agyn/llm';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';

class CountingAgent extends AgentNode {
  private _starts = 0;
  get starts() { return this._starts; }
  override async invoke(thread: string, messages: HumanMessage[]): Promise<ResponseMessage> {
    const res = await super.invoke(thread, Array.isArray(messages) ? messages : [messages]);
    if (res instanceof ResponseMessage && res.text !== 'queued') this._starts += 1;
    return res as ResponseMessage;
  }
}

describe('Agent busy gating (wait mode)', () => {
  it('does not start a new loop while running; schedules next after finish', async () => {
    // Create a controllable promise to keep the first run in-flight during assertions
    let releaseFirst: (v: ResponseMessage) => void = () => {};
    const firstRunGate = new Promise<ResponseMessage>((resolve) => { releaseFirst = resolve; });
    const provisioner = { getLLM: async () => ({ call: async () => await firstRunGate }) } as LLMProvisioner;
    const module = await Test.createTestingModule({
      providers: [LoggerService, ConfigService, { provide: LLMProvisioner, useValue: provisioner }, { provide: (await import('../src/core/services/prisma.service')).PrismaService, useValue: { getClient: () => null } }, CountingAgent],
    }).compile();
    const agent = await module.resolve(CountingAgent);
    await agent.setConfig({ whenBusy: 'wait' });
    agent.init({ nodeId: 'A1' });

    const p1 = agent.invoke('t', [HumanMessage.fromText('m1')]);
    // Immediately enqueue another message; should not start a second run now
    const p2 = agent.invoke('t', [HumanMessage.fromText('m2')]);
    const r2 = await p2; // queued response
    await new Promise((r) => setTimeout(r, 0));
    expect(r2.text).toBe('queued');
    // Now release the first run and await completion
    releaseFirst(new ResponseMessage({ output: [AIMessage.fromText('done').toPlain()] }));
    const r1 = await p1; // first run completes
    expect(r1.text).toBe('done');

    await new Promise((r) => setTimeout(r, 50));
    expect(agent.starts).toBeGreaterThanOrEqual(2);
  });
});
