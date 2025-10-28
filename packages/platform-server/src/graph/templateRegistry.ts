import { Inject, Injectable } from '@nestjs/common';
import type { TemplatePortConfig } from './ports.types';
import type { TemplateKind, TemplateNodeSchema } from './types';
import Node from '../graph/nodes/base/Node';
import type { Constructor } from 'type-fest';
import { ModuleRef } from '@nestjs/core';

export interface TemplateMeta {
  title: string;
  kind: TemplateKind;
}

export type TemplateCtor = Constructor<Node>;

@Injectable()
export class TemplateRegistry {
  private classes = new Map<string, TemplateCtor>();
  private meta = new Map<string, TemplateMeta>();

  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  // Register associates template -> node class and meta (ports are read from instance via getPortConfig)
  register(template: string, meta: TemplateMeta, nodeClass: TemplateCtor): this {
    if (this.classes.has(template)) {
      // Allow override deliberately; could warn here if desired
    }
    this.classes.set(template, nodeClass);
    if (meta) this.meta.set(template, meta);
    return this;
  }

  // Provide class lookup for runtime
  getClass(template: string): TemplateCtor | undefined {
    return this.classes.get(template);
  }

  // Introspect ports by instantiating classes via DI; async to support resolution.
  async toSchema(): Promise<TemplateNodeSchema[]> {
    const schemas: TemplateNodeSchema[] = [];
    for (const name of this.classes.keys()) {
      let sourcePorts: string[] = [];
      let targetPorts: string[] = [];
      // Attempt DI instantiation to read ports from instance

      const cls = this.classes.get(name)!;
      let inst = await this.moduleRef.create<Node>(cls);

      if (inst) {
        const cfg: TemplatePortConfig = inst.getPortConfig();
        sourcePorts = cfg.sourcePorts ? Object.keys(cfg.sourcePorts) : [];
        targetPorts = cfg.targetPorts ? Object.keys(cfg.targetPorts) : [];
      }

      const meta: TemplateMeta = this.meta.get(name) ?? { title: name, kind: 'tool' };
      schemas.push({
        name,
        title: meta.title,
        kind: meta.kind,
        sourcePorts,
        targetPorts,
      });
    }
    return schemas.sort((a, b) => a.name.localeCompare(b.name));
  }
}
