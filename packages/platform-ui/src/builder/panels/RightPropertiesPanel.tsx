import type { Node } from 'reactflow';
import { useCallback, useEffect, useState, memo } from 'react';
import type { TemplateNodeSchema } from '@agyn/shared';
import { useTemplates } from '../useTemplates';
// Runtime graph components & hooks
// Removed NodeDetailsPanel wrapper; using granular components directly
// Custom config views only; legacy RJSF forms removed
import { useTemplatesCache } from '@/lib/graph/templates.provider';
import { NodeStatusBadges } from '@/components/graph/NodeStatusBadges';
import { NodeActionButtons } from '@/components/graph/NodeActionButtons';
import { useNodeAction, useNodeStatus } from '@/lib/graph/hooks';
import { canPause, canProvision } from '@/lib/graph/capabilities';
import { NixPackagesSection } from '@/components/nix/NixPackagesSection';
import { getConfigView } from '@/components/configViews/registry';
// Registry is initialized once in main.tsx via initConfigViewsRegistry()

interface BuilderPanelNodeData {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
  dynamicConfig?: Record<string, unknown>;
}
interface Props {
  node: Node<BuilderPanelNodeData> | null;
  onChange: (id: string, data: Partial<BuilderPanelNodeData>) => void;
}

function RightPropertiesPanel({ node, onChange }: Props) {
  // Wrapper delegates to body to avoid conditional hooks
  if (!node) {
    return <div className="text-xs text-muted-foreground">Select a node to edit its properties.</div>;
  }
  return <RightPropertiesPanelBody node={node} onChange={onChange} />;
}

function RightPropertiesPanelBody({
  node,
  onChange,
}: {
  node: Node<BuilderPanelNodeData>;
  onChange: (id: string, data: Partial<BuilderPanelNodeData>) => void;
}) {
  const { templates } = useTemplates();
  const runtimeTemplates = useTemplatesCache();

  const { data } = node;
  // Derive readOnly/disabled from runtime status where applicable
  const { data: status } = useNodeStatus(node.id);
  const tpl = templates.find((t: TemplateNodeSchema) => t.name === data.template);
  const cfg = (data.config || {}) as Record<string, unknown>;
  const dynamicConfig = (data.dynamicConfig || {}) as Record<string, unknown>;
  // No-op guard: only forward updates when they change values
  const update = useCallback(
    (patch: Partial<BuilderPanelNodeData>) => {
      const nextConfig = (patch.config ?? cfg) as Record<string, unknown>;
      const nextDyn = (patch.dynamicConfig ?? dynamicConfig) as Record<string, unknown>;
      const sameConfig = JSON.stringify(cfg) === JSON.stringify(nextConfig);
      const sameDyn = JSON.stringify(dynamicConfig) === JSON.stringify(nextDyn);
      const sameName = patch.name === undefined || patch.name === data.name;
      const sameTemplate = patch.template === undefined || patch.template === data.template;
      if (sameConfig && sameDyn && sameName && sameTemplate) return; // no-op
      onChange(node.id, patch);
    },
    [cfg, dynamicConfig, data.name, data.template, node.id, onChange],
  );

  const runtimeTemplate = runtimeTemplates.getTemplate(data.template);
  const kind = runtimeTemplate?.kind as string | undefined;
  // Show Runtime Status if lifecycle-managed kinds or if status has provisionStatus
  const lifecycleKinds = new Set(['mcp', 'trigger', 'service']);
  const { data: statusForGate } = useNodeStatus(node.id);
  const hasRuntimeCaps = lifecycleKinds.has(kind || '') || !!statusForGate?.provisionStatus;

  function RuntimeNodeSection({ nodeId, templateName }: { nodeId: string; templateName: string }) {
    const { data: status } = useNodeStatus(nodeId);
    const action = useNodeAction(nodeId);
    const { getTemplate } = useTemplatesCache();
    const tmpl = getTemplate(templateName);
    const pausable = false; // Pause/resume removed per server alignment
    const provisionable = tmpl ? canProvision(tmpl) : true;
    // Show block whenever lifecycle-managed kinds or provision status exists (parent gate handles kinds)
    const state = status?.provisionStatus?.state ?? 'not_ready';
    const isPaused = !!status?.isPaused;
    const detail = status?.provisionStatus?.details;
    const disableAll = state === 'deprovisioning';
    const canStart = provisionable && ['not_ready', 'error', 'provisioning_error', 'deprovisioning_error'].includes(state) && !disableAll;
    const canStop = provisionable && (state === 'ready' || state === 'provisioning') && !disableAll;
    const canPauseBtn = false;
    const canResumeBtn = false;
    return (
      <div className="space-y-3 text-xs">
        <NodeStatusBadges state={state} isPaused={isPaused} detail={detail} />
        <NodeActionButtons
          provisionable={provisionable}
          pausable={false}
          canStart={canStart}
          canStop={canStop}
          canPauseBtn={false}
          canResumeBtn={false}
          onStart={() => action.mutate('provision')}
          onStop={() => action.mutate('deprovision')}
          onPause={() => {}}
          onResume={() => {}}
        />
      </div>
    );
  }

  // Resolve custom view components if enabled
  const StaticView = getConfigView(data.template, 'static');
  const DynamicView = getConfigView(data.template, 'dynamic');
  const disableAll = status?.provisionStatus?.state === 'deprovisioning';
  const readOnly = status?.provisionStatus?.state === 'provisioning' || false;
  // Track static validation errors reported by StaticView
  const [staticErrors, setStaticErrors] = useState<string[]>([]);

  // Clear validation errors when switching nodes/templates
  useEffect(() => {
    setStaticErrors([]);
  }, [node.id, data.template]);

  // Stable validation handler; guards against no-op updates
  const handleValidate = useCallback((errs?: string[]) => {
    const next = errs || [];
    setStaticErrors((prev) => {
      if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {hasRuntimeCaps && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase text-muted-foreground">Runtime Status</div>
          <RuntimeNodeSection nodeId={node.id} templateName={data.template} />
        </div>
      )}
      <div className="space-y-2">
        <div className="text-[10px] uppercase text-muted-foreground">Static Configuration</div>
        {StaticView ? (
          <StaticView
            key={`static-${node.id}`}
            templateName={data.template}
            value={cfg}
            onChange={(next) => update({ config: next })}
            readOnly={readOnly}
            disabled={!!disableAll}
            onValidate={handleValidate}
          />
        ) : (
          <div className="text-xs text-muted-foreground">No custom view registered for {data.template} (static)</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase text-muted-foreground">Dynamic Configuration</div>
        {DynamicView ? (
          <DynamicView
            key={`dynamic-${node.id}`}
            nodeId={node.id}
            templateName={data.template}
            value={dynamicConfig}
            onChange={(next) => update({ dynamicConfig: next })}
            readOnly={readOnly}
            disabled={!!disableAll}
          />
        ) : (
          <div className="text-xs text-muted-foreground">No custom view registered for {data.template} (dynamic)</div>
        )}
      </div>
      {data.template === 'containerProvider' && (
        <div className="space-y-2">
          <NixPackagesSection config={cfg} onUpdateConfig={(next) => update({ config: next })} />
        </div>
      )}
      {staticErrors.length > 0 && (
        <div className="text-xs text-red-500" data-testid="static-errors">
          {staticErrors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}
      <hr className="border-border" />
      <div className="text-[10px] uppercase text-muted-foreground">
        Template: {data.template}
        {tpl?.title ? (
          <span className="ml-2 text-[10px] italic text-muted-foreground">(Default: {tpl.title})</span>
        ) : null}
      </div>
    </div>
  );
}

// Memoize to avoid unnecessary re-renders on unrelated state updates
export const RightPropertiesPanelMemo = memo(RightPropertiesPanel);
export { RightPropertiesPanelMemo as RightPropertiesPanel };
