export const DND_ITEM_NODE = 'BUILDER_NODE';
export type { BuilderNodeKind } from './types';
import { type TemplateNodeSchema } from '@agyn/shared';

// Standardized drag payload shape for node insertions
export type DragItem = {
  template: string;
  title?: string;
  kind?: TemplateNodeSchema['kind'] | string;
  origin?: 'popover' | 'palette';
};
