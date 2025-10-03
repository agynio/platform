import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import { MemoryAppendToolStaticConfigSchema } from '../../src/tools/memory/memory_append.tool';
import { MemoryDeleteToolStaticConfigSchema } from '../../src/tools/memory/memory_delete.tool';
import { MemoryListToolStaticConfigSchema } from '../../src/tools/memory/memory_list.tool';
import { MemoryReadToolStaticConfigSchema } from '../../src/tools/memory/memory_read.tool';
import { MemoryUpdateToolStaticConfigSchema } from '../../src/tools/memory/memory_update.tool';

// Ensure that converting tool schemas to JSON Schema does not throw and produces expected keys

describe('memory tool schemas: toJSONSchema', () => {
  it('memory_append', () => {
    const js = toJSONSchema(MemoryAppendToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path','data']));
  });
  it('memory_delete', () => {
    const js = toJSONSchema(MemoryDeleteToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path']));
  });
  it('memory_list', () => {
    const js = toJSONSchema(MemoryListToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    // path optional
    expect(js.properties.path.type).toBe('string');
  });
  it('memory_read', () => {
    const js = toJSONSchema(MemoryReadToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path']));
  });
  it('memory_update', () => {
    const js = toJSONSchema(MemoryUpdateToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path','old_data','new_data']));
  });
});
