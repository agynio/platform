import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import { UnifiedMemoryToolStaticConfigSchema } from '../../src/graph/nodes/tools/memory/memory.tool';

// Ensure that converting tool schemas to JSON Schema does not throw and produces expected keys

describe('Unified memory tool schema: toJSONSchema', () => {
  it('memory', () => {
    const js = toJSONSchema(UnifiedMemoryToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path','command']));
    const enumVals = js.properties.command.enum || js.properties.command.anyOf?.flatMap((x: any) => x.enum ?? []);
    expect(enumVals).toEqual(expect.arrayContaining(['read','list','append','update','delete']));
  });
  
  it('runtime parsing: invalid combos return EINVAL envelope upstream (validate via safeParse here)', () => {
    // JSON Schema cannot express conditional requirements easily; ensure base keys exist
    const valid = UnifiedMemoryToolStaticConfigSchema.safeParse({ path: '/a', command: 'read' });
    expect(valid.success).toBe(true);
    const missingCmd = UnifiedMemoryToolStaticConfigSchema.safeParse({ path: '/a' } as any);
    expect(missingCmd.success).toBe(false);
    const missingPath = UnifiedMemoryToolStaticConfigSchema.safeParse({ command: 'read' } as any);
    expect(missingPath.success).toBe(false);
  });
});
