import { Injectable } from '@nestjs/common';
import { JSONSchema } from 'zod/v4/core';
import type { TemplateKind, TemplateNodeSchema } from './types';
import type Node from '../nodes/base/Node';
import { resolve } from '../bootstrap/di';

export interface TemplateMeta {
  title: string;
  kind: TemplateKind;
  capabilities?: TemplateNodeSchema['capabilities'];
  staticConfigSchema?: JSONSchema.BaseSchema;
}

@Injectable()
export class TemplateRegistry {
  private classes = new Map<string, new (...args: any[]) => Node>();
  private meta = new Map<string, TemplateMeta>();

  // Register associates template -> node class and meta (ports are read from instance via getPortConfig)
  register(template: string, meta: TemplateMeta, nodeClass: new (...args: any[]) => Node): this {
    if (this.classes.has(template)) {
      // Allow override deliberately; could warn here if desired
    }
    this.classes.set(template, nodeClass);
    if (meta) this.meta.set(template, meta);
    return this;
  }

  // Provide class lookup for runtime
  getClass(template: string): (new (...args: any[]) => Node) | undefined {
    return this.classes.get(template);
  }

  // Introspect ports by instantiating classes via DI; async to support resolution.
  async toSchema(): Promise<TemplateNodeSchema[]> {
    const schemas: TemplateNodeSchema[] = [];
    for (const name of this.classes.keys()) {
      let sourcePorts: string[] = [];
      let targetPorts: string[] = [];
      try {
        const cls = this.classes.get(name)!;
        const inst = (await resolve<Node>(cls as any)) as any;
        if (inst && typeof inst.getPortConfig === 'function') {
          const cfg = inst.getPortConfig();
          sourcePorts = cfg?.sourcePorts ? Object.keys(cfg.sourcePorts) : [];
          targetPorts = cfg?.targetPorts ? Object.keys(cfg.targetPorts) : [];
        }
      } catch {}
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
