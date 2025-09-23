import type { Node } from 'reactflow';
import type { TemplateNodeSchema } from 'shared';
import { useTemplates } from '../useTemplates';

interface BuilderPanelNodeData { template: string; name?: string; config?: Record<string, unknown>; }
interface Props {
  node: (Node<BuilderPanelNodeData> | null);
  onChange: (id: string, data: Partial<BuilderPanelNodeData>) => void;
}

export function RightPropertiesPanel({ node, onChange }: Props) {
  const { templates } = useTemplates();
  if (!node) {
    return <div className="text-xs text-muted-foreground">Select a node to edit its properties.</div>;
  }
  const { data } = node;
  const tpl = templates.find((t: TemplateNodeSchema) => t.name === data.template);
  const update = (patch: Record<string, unknown>) => onChange(node.id, patch);
  const cfg = (data.config || {}) as Record<string, unknown>;
  const title = (cfg.title as string) || '';
  const configString = JSON.stringify(cfg, null, 2);

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase text-muted-foreground">
        Template: {data.template}
        {tpl?.title ? <span className="ml-2 text-[10px] italic text-muted-foreground">(Default: {tpl.title})</span> : null}
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Title</label>
        <input
          value={title}
          onChange={e => {
            const next = { ...(data.config || {}), title: e.target.value } as Record<string, unknown>;
            update({ config: next });
          }}
          placeholder={tpl?.title || data.template}
          className="w-full rounded border bg-background px-2 py-1 text-xs"
        />
        <div className="mt-1 text-[10px] text-muted-foreground">If set, this title overrides the default label shown on the node.</div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Config (JSON)</label>
        <textarea
          value={configString}
          onChange={e => {
            try {
              const parsed = JSON.parse(e.target.value || '{}');
              update({ config: parsed });
            } catch {
              /* ignore invalid JSON */
            }
          }}
          className="w-full font-mono rounded border bg-background px-2 py-1 text-[10px]" rows={6}
        />
      </div>
    </div>
  );
}
