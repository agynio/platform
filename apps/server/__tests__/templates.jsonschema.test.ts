import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import type { JSONSchema7 } from 'json-schema';

type JsonSchemaWithUi = JSONSchema7 & { 'ui:field'?: string };
import { ShellToolStaticConfigSchema } from '../src/tools/shell_command';
import { LocalMcpServerStaticConfigSchema } from '../src/mcp/localMcpServer';
import { SimpleAgentStaticConfigSchema } from '../src/agents/simple.agent';

describe('template schemas: env ui:field', () => {
  it('ShellToolStaticConfigSchema.env includes ui:field ReferenceEnvField', () => {
    const js = toJSONSchema(ShellToolStaticConfigSchema) as JSONSchema7;
    expect(js.type).toBe('object');
    const props = (js.properties ?? {}) as Record<string, JsonSchemaWithUi>;
    expect(Object.prototype.hasOwnProperty.call(props, 'env')).toBe(true);
    const envSchema = props.env as JsonSchemaWithUi;
    expect(envSchema['ui:field']).toBe('ReferenceEnvField');
  });

  it('LocalMcpServerStaticConfigSchema.env includes ui:field ReferenceEnvField', () => {
    const js = toJSONSchema(LocalMcpServerStaticConfigSchema) as JSONSchema7;
    expect(js.type).toBe('object');
    const props = (js.properties ?? {}) as Record<string, JsonSchemaWithUi>;
    expect(Object.prototype.hasOwnProperty.call(props, 'env')).toBe(true);
    const envSchema = props.env as JsonSchemaWithUi;
    expect(envSchema['ui:field']).toBe('ReferenceEnvField');
  });
});

describe('SimpleAgent schema: enum UI metadata', () => {
  it("includes ui:widget 'select' for whenBusy/processBuffer", () => {
    const js = toJSONSchema(SimpleAgentStaticConfigSchema) as JSONSchema7 & { properties?: Record<string, any> };
    expect(js.type).toBe('object');
    const props = (js.properties ?? {}) as Record<string, any>;
    const whenBusy = props['whenBusy'] as Record<string, any>;
    const processBuffer = props['processBuffer'] as Record<string, any>;
    expect(whenBusy).toBeDefined();
    expect(processBuffer).toBeDefined();
    expect(whenBusy['ui:widget']).toBe('select');
    expect(processBuffer['ui:widget']).toBe('select');
  });
});
