import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import type { JSONSchema7 } from 'json-schema';

type JsonSchemaWithUi = JSONSchema7 & { 'ui:field'?: string };
import { ShellToolStaticConfigSchema } from '../src/nodes/tools/shell_command/shell_command.node';
<<<<<<< HEAD
<<<<<<< HEAD
import { LocalMcpServerStaticConfigSchema } from "../src/nodes/mcp/localMcpServer.node";
=======
=======
>>>>>>> 97093c1 (test(platform-server): normalize async TemplateRegistry usage and class-based registrations; remove conflict markers)
<<<<<<< HEAD
import { LocalMcpServerStaticConfigSchema } from '../src/mcp/localMcpServer';
=======
import { LocalMcpServerStaticConfigSchema } from '../src/nodes/mcp/localMcpServer.node';
>>>>>>> 9157620 (Refactor: move graph routes to Nest controllers (packages/platform-server) [#432] (#433))
<<<<<<< HEAD
>>>>>>> 3836410 (fix: resolve rebase conflicts in tests and index.ts; prefer node-local import paths and keep Nest graph routes)
=======
=======
import { LocalMcpServerStaticConfigSchema } from '../src/nodes/mcp/localMcpServer.node';
=======
import { LocalMcpServerStaticConfigSchema } from '../src/mcp/localMcpServer';
>>>>>>> 08061e3 (test(platform-server): update imports to new DI-based structure; fix templates.jsonschema to reference ShellToolStaticConfigSchema path)
>>>>>>> dd1050b (refactor(platform-server): make TemplateRegistry.register class-only; ports sourced from nodes via getPortConfig(); toSchema/getPortsMap async; update templates.ts to class-based registrations and fix tests accordingly)
>>>>>>> 97093c1 (test(platform-server): normalize async TemplateRegistry usage and class-based registrations; remove conflict markers)
import { AgentStaticConfigSchema } from '../src/nodes/agent/agent.node';

describe('template schemas: env ui:field', () => {
  it('ShellToolStaticConfigSchema.env includes ui:field ReferenceEnvField', () => {
    const js = toJSONSchema(ShellToolStaticConfigSchema) as JSONSchema7;
    expect(js.type).toBe('object');
    const props = (js.properties ?? {}) as Record<string, JsonSchemaWithUi>;
    expect(Object.prototype.hasOwnProperty.call(props, 'env')).toBe(true);
    const envSchema = props.env as JsonSchemaWithUi;
    expect(envSchema['ui:field']).toBe('ReferenceEnvField');
    // Ensure timeouts are exposed
    expect(Object.prototype.hasOwnProperty.call(props, 'executionTimeoutMs')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(props, 'idleTimeoutMs')).toBe(true);
    // Verify min/max constraints are present in JSON schema for active (non-zero) case
    const execSchema = props['executionTimeoutMs'] as JSONSchema7;
    const idleSchema = props['idleTimeoutMs'] as JSONSchema7;
    // union translates to anyOf with literal 0 or constrained number
    const hasExecRange = Array.isArray(execSchema.anyOf) && execSchema.anyOf.some((s: any) => s.minimum === 1000 && s.maximum === 86400000);
    const hasIdleRange = Array.isArray(idleSchema.anyOf) && idleSchema.anyOf.some((s: any) => s.minimum === 1000 && s.maximum === 86400000);
    expect(hasExecRange).toBe(true);
    expect(hasIdleRange).toBe(true);
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

describe('Agent schema: enum UI metadata', () => {
  it("includes ui:widget 'select' for whenBusy/processBuffer", () => {
    const js = toJSONSchema(AgentStaticConfigSchema) as JSONSchema7 & { properties?: Record<string, any> };
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
