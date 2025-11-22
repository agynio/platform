import { describe, it, expect } from 'vitest';
import { UnifiedMemoryFunctionTool as UnifiedMemoryTool } from '../../src/nodes/tools/memory/memory.tool';
import { MemoryToolNodeStaticConfigSchema as UnifiedMemoryToolNodeStaticConfigSchema } from '../../src/nodes/tools/memory/memory.node';
import { LoggerService } from '../../src/core/services/logger.service';
import { TemplateRegistry } from '../../src/graph-core/templateRegistry';
import { toJSONSchema } from 'zod';
// Note: schema below tests node-level config, not function tool input schema.

describe('UnifiedMemoryTool config overrides and templates exposure', () => {
  it('applies name/description overrides and keeps defaults', async () => {
    // New API: config applied at node level; tool pulls metadata from node
    const logger = new LoggerService();
    const node = new (await import('../../src/nodes/tools/memory/memory.node')).MemoryToolNode(logger);
    await node.setConfig({ description: 'Custom desc' });
    const tool = node.getTool();
    expect(tool.name).toBe('memory');
    expect(tool.description).toBe('Custom desc');

    await node.setConfig({ name: 'mem_x', description: 'Custom desc' });
    const tool2 = node.getTool();
    expect(tool2.name).toBe('mem_x');
    expect(tool2.description).toBe('Custom desc');
  });

  it('accepts string name; schema exposed via templates (no runtime validation)', async () => {
    const logger = new LoggerService();
    const node = new (await import('../../src/nodes/tools/memory/memory.node')).MemoryToolNode(logger);
    await node.setConfig({ name: 'Bad-Name' });
    const tool = node.getTool();
    expect(typeof tool.name).toBe('string');
  });

  it('templates expose node-level static config schema', () => {
    const js = toJSONSchema(UnifiedMemoryToolNodeStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['name','description','title']));
  });
});
