import type { Node } from 'reactflow';

interface BuilderPanelNodeData { template: string; name?: string; config?: Record<string, unknown>; }
interface Props {
  node: (Node<BuilderPanelNodeData> | null);
  onChange: (id: string, data: Partial<BuilderPanelNodeData>) => void;
}

export function RightPropertiesPanel({ node, onChange }: Props) {
  if (!node) {
    return <div className="text-xs text-muted-foreground">Select a node to edit its properties.</div>;
  }
  const { data } = node;
  const update = (patch: Record<string, unknown>) => onChange(node.id, patch);
  const configString = JSON.stringify(data.config || {}, null, 2);
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase text-muted-foreground">Template: {data.template}</div>
      <div>
        <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Name</label>
        <input value={data.name || ''} onChange={e => update({ name: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
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
