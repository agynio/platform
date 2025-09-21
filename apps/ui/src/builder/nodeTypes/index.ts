// Generic template-driven node implementation
import { TemplateNode } from './TemplateNode';
import type { TemplateNodeSchema } from 'shared';
import type { NodeTypes } from 'reactflow';

export function makeNodeTypes(templates: TemplateNodeSchema[]): NodeTypes {
  const map: NodeTypes = {};
  for (const t of templates) map[t.name] = TemplateNode;
  return map;
}

