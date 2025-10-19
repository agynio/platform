import { describe, it, expect } from 'vitest';
import { UnifiedMemoryTool } from '../../src/tools/memory/memory.tool';
import { LoggerService } from '../../src/services/logger.service';
import { TemplateRegistry } from '../../src/graph/templateRegistry';
import { toJSONSchema } from 'zod';
import { UnifiedMemoryToolNodeStaticConfigSchema } from '../../src/tools/memory/memory.tool';

describe('UnifiedMemoryTool config overrides and templates exposure', () => {
  it('applies name/description overrides and keeps defaults', async () => {
    const tool = new UnifiedMemoryTool(new LoggerService());
    // default metadata
    let dynamic = tool.init();
    expect(dynamic.name).toBe('memory');
    expect(dynamic.description).toMatch(/Unified Memory tool/i);

    // override description only (back-compat default name)
    await tool.setConfig({ description: 'Custom desc' });
    dynamic = tool.init();
    expect(dynamic.name).toBe('memory');
    expect(dynamic.description).toBe('Custom desc');

    // override name (valid)
    await tool.setConfig({ name: 'mem_x' });
    dynamic = tool.init();
    expect(dynamic.name).toBe('mem_x');
    expect(dynamic.description).toBe('Custom desc');
  });

  it('rejects invalid name via schema', async () => {
    const tool = new UnifiedMemoryTool(new LoggerService());
    await expect(tool.setConfig({ name: 'Bad-Name' })).rejects.toThrow();
    // ensure defaults unchanged
    const dynamic = tool.init();
    expect(dynamic.name).toBe('memory');
  });

  it('templates expose node-level static config schema', () => {
    const js = toJSONSchema(UnifiedMemoryToolNodeStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['name','description','title']));
  });
});

