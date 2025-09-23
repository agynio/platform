import type { TemplateNodeSchema } from 'shared';

export function getTemplateSchema(templates: TemplateNodeSchema[], templateName: string | undefined) {
  if (!templateName) return undefined;
  return templates.find((t) => t.name === templateName);
}

export function getDisplayTitle(
  templates: TemplateNodeSchema[],
  templateName: string,
  config?: Record<string, unknown>
) {
  const custom = (config as any)?.title as string | undefined;
  if (custom && custom.trim().length > 0) return custom.trim();
  const tpl = getTemplateSchema(templates, templateName);
  return tpl?.title || templateName;
}

export function getKind(templates: TemplateNodeSchema[], templateName: string) {
  return getTemplateSchema(templates, templateName)?.kind as TemplateNodeSchema['kind'] | undefined;
}

export function kindLabel(kind?: TemplateNodeSchema['kind']) {
  switch (kind) {
    case 'trigger':
      return 'Trigger';
    case 'agent':
      return 'Agent';
    case 'tool':
      return 'Tool';
    case 'mcp':
      return 'MCP';
    default:
      return 'Node';
  }
}

export function kindBadgeClasses(kind?: TemplateNodeSchema['kind']) {
  switch (kind) {
    case 'trigger':
      return 'bg-amber-100 text-amber-900 border border-amber-200';
    case 'agent':
      return 'bg-blue-100 text-blue-900 border border-blue-200';
    case 'tool':
      return 'bg-slate-100 text-slate-900 border border-slate-200';
    case 'mcp':
      return 'bg-violet-100 text-violet-900 border border-violet-200';
    default:
      return 'bg-muted text-foreground border border-muted-foreground/20';
  }
}
