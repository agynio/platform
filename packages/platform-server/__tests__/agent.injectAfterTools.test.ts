import { describe, it, expect, vi } from 'vitest';
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { LoggerService } from '../src/core/services/logger.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ModuleRef } from '@nestjs/core';
import { HumanMessage, ResponseMessage, ToolCallMessage, FunctionTool } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { ConditionalLLMRouter } from '../src/llm/routers/conditional.llm.router';
import { StaticLLMRouter } from '../src/llm/routers/static.llm.router';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { EnforceToolsLLMReducer } from '../src/llm/reducers/enforceTools.llm.reducer';
import z from 'zod';
import type { PrismaService } from '../src/core/services/prisma.service';
import { BusyThreadsService } from '../src/graph/nodes/agent/busyThreads.service';

class FakeLLM {
  callsWithTools = 0;
  async call(opts: { model: string; input: any[]; tools?: Array<FunctionTool> }) {
    if (opts.tools && opts.tools.length) {
      this.callsWithTools++;
      const toolCall = new ToolCallMessage({ type: 'function_call', call_id: 'c1', name: 'noop', arguments: '{}' } as any);
      return new ResponseMessage({ output: [toolCall.toPlain()] });
    }
    return new ResponseMessage({ output: [] });
  }
}

class FakeRuns { async ensureIndexes(){} async startRun(){} async markTerminated(){} async list(){return [];} }

class NoopTool extends FunctionTool {
  get name() { return 'noop'; }
  get description() { return 'no op'; }
  get schema() { return z.object({}).strict(); }
  async execute(): Promise<string> { return 'ok'; }
}

function makeModuleRef(logger: LoggerService, _prov: LLMProvisioner, _prisma: PrismaService): ModuleRef {
  return {
    create: async (cls: any) => {
      if (cls.name === 'LoadLLMReducer') {
        return { next(r:any){(this as any)._r=r;return this;}, hasNext(){return !!(this as any)._r;}, getNextRouter(){return (this as any)._r;}, async invoke(s:any){return s;} } as any;
      }
      if (cls === StaticLLMRouter) return new StaticLLMRouter();
      if (cls === ConditionalLLMRouter) return new ConditionalLLMRouter();
      if (cls.name === 'SummarizationLLMReducer') {
        return { init: async()=>({ next(r:any){(this as any)._r=r;return this;} }), next(r:any){(this as any)._r=r;return this;}, hasNext(){return !!(this as any)._r;}, getNextRouter(){return (this as any)._r;}, async invoke(s:any){return s;} } as any;
      }
      if (cls === CallModelLLMReducer) return new CallModelLLMReducer();
      if (cls === CallToolsLLMReducer) return new CallToolsLLMReducer(logger);
      if (cls.name === 'SaveLLMReducer') {
        return { next(r:any){(this as any)._r=r;return this;}, hasNext(){return !!(this as any)._r;}, getNextRouter(){return (this as any)._r;}, async invoke(s:any){return s;} } as any;
      }
      if (cls === EnforceToolsLLMReducer) return new EnforceToolsLLMReducer(logger);
      throw new Error('unknown class');
    },
  } as unknown as ModuleRef;
}

describe('Agent injectAfterTools mode', () => {
  it('injects after tools_save; deferreds resolve after run; respects oneByOne', async () => {
    const logger = new LoggerService();
    const fake = new FakeLLM();
    const provisioner: Pick<LLMProvisioner, 'getLLM'> = { getLLM: async () => fake as any };
    const moduleRef = makeModuleRef(logger, provisioner as LLMProvisioner, { getClient: () => undefined } as any);
    const runs = new FakeRuns() as any;
    const busy = new BusyThreadsService();

    const agent = new AgentNode({} as any, logger, provisioner as any, runs, moduleRef as any, busy);
    agent.setRuntimeContext({ nodeId: 'agent-2' } as any);
    await agent.setConfig({ debounceMs: 0, whenBusy: 'injectAfterTools', processBuffer: 'allTogether' } as any);

    agent.addTool({ getTool: () => new NoopTool() } as any);

    const p1 = agent.invoke('t', [HumanMessage.fromText('first')]);
    const p2 = agent.invoke('t', [HumanMessage.fromText('second')]);
    const p3 = agent.invoke('t', [HumanMessage.fromText('third')]);

    await Promise.all([p1, p2, p3]);

    // With injectAfterTools limited to allTogether, all queued messages are handled in a single run
    expect(fake.callsWithTools).toBe(1);
  });
});
