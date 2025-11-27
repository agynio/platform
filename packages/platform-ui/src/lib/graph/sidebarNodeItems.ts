import type { TemplateSchema } from '@/api/types/graph';
import type { DraggableNodeItem } from '@/components/EmptySelectionSidebar';

const templateKindMap: Record<string, DraggableNodeItem['kind']> = {
  trigger: 'Trigger',
  agent: 'Agent',
  tool: 'Tool',
  mcp: 'MCP',
  service: 'Workspace',
};

function normalizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKind(kind: unknown): DraggableNodeItem['kind'] | null {
  if (typeof kind !== 'string') return null;
  const mapped = templateKindMap[kind.toLowerCase()];
  return mapped ?? null;
}

function normalizeTitle(title: unknown, fallback: string): string {
  if (typeof title !== 'string') return fallback;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeDescription(description: unknown, title: string): string {
  if (typeof description === 'string') {
    const trimmed = description.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return `Add ${title} to your graph`;
}

export function mapTemplatesToSidebarItems(templates: TemplateSchema[] | undefined): DraggableNodeItem[] {
  if (!Array.isArray(templates) || templates.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const items: DraggableNodeItem[] = [];
  for (const tpl of templates) {
    if (!tpl || typeof tpl !== 'object') continue;
    const name = normalizeName((tpl as TemplateSchema).name);
    if (!name || seen.has(name)) continue;
    const kind = normalizeKind((tpl as TemplateSchema).kind);
    if (!kind) continue;
    seen.add(name);
    const title = normalizeTitle((tpl as TemplateSchema).title, name);
    const description = normalizeDescription((tpl as TemplateSchema).description, title);
    items.push({
      id: name,
      kind,
      title,
      description,
    });
  }
  return items;
}
