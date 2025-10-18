export const DND_ITEM_NODE = 'BUILDER_NODE';
export type { BuilderNodeKind } from './types';

// Standardized drag payload shape for node insertions
export type DragItem = {
  template: string;
  title?: string;
  kind?: import('shared').TemplateNodeSchema['kind'] | string;
  origin?: 'popover' | 'palette';
};
