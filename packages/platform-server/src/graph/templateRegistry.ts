import { JSONSchema } from 'zod/v4/core';
import { TemplatePortConfig, TemplatePortsRegistry } from './ports.types';
import { FactoryFn, TemplateKind, TemplateNodeSchema } from './types';

export interface TemplateMeta {
  title: string;
  kind: TemplateKind;
  capabilities?: TemplateNodeSchema['capabilities'];
  staticConfigSchema?: JSONSchema.BaseSchema;
}

export class TemplateRegistry {
  private factories = new Map<string, FactoryFn>();
  private ports = new Map<string, TemplatePortConfig>();
  private meta = new Map<string, TemplateMeta>();

  register(template: string, factory: FactoryFn, portConfig?: TemplatePortConfig, meta?: TemplateMeta): this {
    if (this.factories.has(template)) {
      // Allow override deliberately; could warn here if desired
    }
    this.factories.set(template, factory);
    if (portConfig) this.ports.set(template, portConfig);
    if (meta) this.meta.set(template, meta);
    return this;
  }

  get(template: string): FactoryFn | undefined {
    return this.factories.get(template);
  }

  getPortsMap(): TemplatePortsRegistry {
    const out: TemplatePortsRegistry = {};
    for (const [k, v] of this.ports.entries()) out[k] = v;
    return out;
  }

  toSchema(): TemplateNodeSchema[] {
    const schemas: TemplateNodeSchema[] = [];
    for (const name of this.factories.keys()) {
      const portCfg = this.ports.get(name);
      const sourcePorts = portCfg?.sourcePorts ? Object.keys(portCfg.sourcePorts) : [];
      const targetPorts = portCfg?.targetPorts ? Object.keys(portCfg.targetPorts) : [];
      const meta = this.meta.get(name) ?? { title: name, kind: 'tool' as TemplateKind };
      schemas.push({
        name,
        title: meta.title,
        kind: meta.kind,
        sourcePorts,
        targetPorts,
        capabilities: meta.capabilities,
        staticConfigSchema: meta.staticConfigSchema,
      });
    }
    return schemas.sort((a, b) => a.name.localeCompare(b.name));
  }
}
