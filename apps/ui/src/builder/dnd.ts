export const DND_ITEM_NODE = 'BUILDER_NODE';
export type { BuilderNodeKind } from './types';

// Drag item carried by template list items
export type DragItem = {
  template: string;
  title?: string;
  kind?: import('shared').TemplateNodeSchema['kind'];
};
