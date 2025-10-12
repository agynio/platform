import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import { ShellToolStaticConfigSchema } from '../src/tools/shell_command';
import { LocalMcpServerStaticConfigSchema } from '../src/mcp/localMcpServer';

describe('template schemas: env ui:field', () => {
  it('ShellToolStaticConfigSchema.env includes ui:field ReferenceEnvField', () => {
    const js = toJSONSchema(ShellToolStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(js.properties).toHaveProperty('env');
    expect(js.properties.env['ui:field']).toBe('ReferenceEnvField');
  });

  it('LocalMcpServerStaticConfigSchema.env includes ui:field ReferenceEnvField', () => {
    const js = toJSONSchema(LocalMcpServerStaticConfigSchema) as any;
    expect(js.type).toBe('object');
    expect(js.properties).toHaveProperty('env');
    expect(js.properties.env['ui:field']).toBe('ReferenceEnvField');
  });
});

