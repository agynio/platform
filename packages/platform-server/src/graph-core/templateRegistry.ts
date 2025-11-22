import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Constructor } from 'type-fest';

import type { TemplatePortConfig } from '../graph/ports.types';
import type { TemplateKind, TemplateNodeSchema } from '../shared/types/graph.types';
import Node from '../nodes/base/Node';

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

  register(template: string, meta: TemplateMeta, nodeClass: TemplateCtor): this {
    if (this.classes.has(template)) {
      // Allow override deliberately; could warn here if desired
    }
    this.classes.set(template, nodeClass);
    if (meta) this.meta.set(template, meta);
    return this;
  }

  getClass(template: string): TemplateCtor | undefined {
    return this.classes.get(template);
  }

  getMeta(template: string): TemplateMeta | undefined {
    return this.meta.get(template);
  }

  async toSchema(): Promise<TemplateNodeSchema[]> {
    const schemas: TemplateNodeSchema[] = [];
    for (const name of this.classes.keys()) {
      let sourcePorts: string[] = [];
      let targetPorts: string[] = [];

      const cls = this.classes.get(name)!;
      const inst = await this.moduleRef.create<Node>(cls);

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
