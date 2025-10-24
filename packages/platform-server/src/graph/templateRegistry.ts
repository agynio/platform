import { Injectable } from '@nestjs/common';
import { JSONSchema } from 'zod/v4/core';
import type { TemplatePortConfig, TemplatePortsRegistry } from './ports.types';
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
      // Attempt DI instantiation to read ports from instance
      try {
        const cls = this.classes.get(name)!;
        let inst: any;
        try {
          inst = (await resolve<Node>(cls as any)) as any;
        } catch {
          // Fallback for test environments without DI bindings
          try {
            inst = new (cls as any)();
          } catch {}
        }
        if (inst && typeof inst.getPortConfig === 'function') {
          const cfg = (inst.getPortConfig?.() || {}) as TemplatePortConfig;
          sourcePorts = cfg?.sourcePorts ? Object.keys(cfg.sourcePorts) : [];
          targetPorts = cfg?.targetPorts ? Object.keys(cfg.targetPorts) : [];
        }
      } catch {
        // ignore instance creation errors for schema generation; fall back to no ports
      }
      const meta = this.meta.get(name) ?? { title: name, kind: 'tool' as TemplateKind };
      const clsAny = this.classes.get(name)! as any;
      const caps = (clsAny && clsAny.capabilities)
        ? (clsAny.capabilities as TemplateNodeSchema['capabilities'])
        : undefined;
      const staticSchema = (clsAny && clsAny.staticConfigSchema)
        ? (clsAny.staticConfigSchema as JSONSchema.BaseSchema)
        : undefined;
      schemas.push({
        name,
        title: meta.title,
        kind: meta.kind,
        sourcePorts,
        targetPorts,
        capabilities: caps ?? meta.capabilities,
        staticConfigSchema: staticSchema ?? meta.staticConfigSchema,
      });
    }
    return schemas.sort((a, b) => a.name.localeCompare(b.name));
  }
}
