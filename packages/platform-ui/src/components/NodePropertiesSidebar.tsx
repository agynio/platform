import { useCallback, useMemo, useState } from 'react';
import Badge from './Badge';
import { Input } from './Input';
import type { GraphNodeConfig, GraphNodeUpdate } from '@/features/graph/types';
import { NodeActionButtons } from './graph/NodeActionButtons';
import { NodeStatusBadges } from './graph/NodeStatusBadges';
import { ToolItem } from './ToolItem';
import { getConfigView } from '@/components/configViews/registry';
import { useMcpNodeState, useNodeAction } from '@/lib/graph/hooks';

type NodeStatus = GraphNodeConfig['status'];

const statusDisplay: Record<GraphNodeConfig['status'], { label: string; color: string; bgColor: string }> = {
  not_ready: { label: 'Not Ready', color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  provisioning: { label: 'Provisioning', color: 'var(--agyn-status-running)', bgColor: 'var(--agyn-status-running-bg)' },
  ready: { label: 'Ready', color: 'var(--agyn-status-finished)', bgColor: 'var(--agyn-status-finished-bg)' },
  deprovisioning: { label: 'Deprovisioning', color: 'var(--agyn-status-pending)', bgColor: 'var(--agyn-status-pending-bg)' },
  provisioning_error: {
    label: 'Provisioning Error',
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
  },
  deprovisioning_error: {
    label: 'Deprovisioning Error',
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
  },
};

interface NodePropertiesSidebarProps {
  node: GraphNodeConfig;
  onUpdate?: (updates: GraphNodeUpdate) => void;
}

function serialize(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
}

export default function NodePropertiesSidebar({ node, onUpdate }: NodePropertiesSidebarProps) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const statusInfo = statusDisplay[node.status as NodeStatus];
  const runtimeState = node.runtime?.provisionStatus?.state ?? node.status;
  const runtimeDetails = node.runtime?.provisionStatus?.details;
  const isPaused = node.runtime?.isPaused ?? false;

  const provisionable = node.capabilities?.provisionable ?? true;
  const pausable = node.capabilities?.pausable ?? false;
  const action = useNodeAction(node.id);
  const actionPending = action.isPending;

  const StaticView = getConfigView(node.template, 'static');

  const handleTitleChange = useCallback(
    (value: string) => {
      const trimmed = value;
      const nextConfig = { ...(node.config ?? {}), title: trimmed };
      onUpdate?.({ title: trimmed, config: nextConfig });
    },
    [node.config, onUpdate],
  );

  const handleConfigChange = useCallback(
    (next: Record<string, unknown>) => {
      onUpdate?.({ config: next });
    },
    [onUpdate],
  );

  const handleValidate = useCallback((errors?: string[]) => {
    setValidationErrors(errors ?? []);
  }, []);

  const canStart = useMemo(() => {
    if (!provisionable) return false;
    if (actionPending) return false;
    return ['not_ready', 'provisioning_error', 'deprovisioning_error'].includes(runtimeState);
  }, [provisionable, actionPending, runtimeState]);

  const canStop = useMemo(() => {
    if (!provisionable) return false;
    if (actionPending) return false;
    return runtimeState === 'ready' || runtimeState === 'provisioning';
  }, [provisionable, actionPending, runtimeState]);

  const optimisticUpdate = useCallback(
    (state: NodeStatus) => {
      const runtime = {
        ...(node.runtime ?? {}),
        provisionStatus: { state, details: node.runtime?.provisionStatus?.details },
        isPaused: false,
      };
      onUpdate?.({ status: state, runtime });
    },
    [node.runtime, onUpdate],
  );

  const triggerProvision = useCallback(() => {
    if (!provisionable || actionPending) return;
    const previousStatus = node.status;
    const previousRuntime = node.runtime;
    optimisticUpdate('provisioning');
    action.mutate('provision', {
      onError: () => {
        onUpdate?.({ status: previousStatus, runtime: previousRuntime });
      },
    });
  }, [action, actionPending, node.runtime, node.status, onUpdate, optimisticUpdate, provisionable]);

  const triggerDeprovision = useCallback(() => {
    if (!provisionable || actionPending) return;
    const previousStatus = node.status;
    const previousRuntime = node.runtime;
    optimisticUpdate('deprovisioning');
    action.mutate('deprovision', {
      onError: () => {
        onUpdate?.({ status: previousStatus, runtime: previousRuntime });
      },
    });
  }, [action, actionPending, node.runtime, node.status, onUpdate, optimisticUpdate, provisionable]);

  const configJson = useMemo(() => serialize(node.config), [node.config]);
  const stateJson = useMemo(() => serialize(node.state), [node.state]);
  const titleValue = typeof node.config?.title === 'string' ? (node.config.title as string) : node.title;

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-default)]">
        <div>
          <h2 className="text-[var(--agyn-dark)]">Node Properties</h2>
          <p className="text-sm text-[var(--agyn-gray)] mt-0.5">{node.title}</p>
        </div>
        <Badge color={statusInfo.color} bgColor={statusInfo.bgColor}>
          {statusInfo.label}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        <section className="space-y-3">
          <div className="text-[10px] uppercase text-muted-foreground">Runtime Status</div>
          <NodeStatusBadges state={runtimeState} isPaused={isPaused} detail={runtimeDetails} />
          <NodeActionButtons
            provisionable={provisionable}
            pausable={pausable}
            canStart={canStart}
            canStop={canStop}
            onStart={triggerProvision}
            onStop={triggerDeprovision}
          />
        </section>

        <section className="space-y-3">
          <div className="text-[10px] uppercase text-muted-foreground">Title</div>
          <Input
            value={titleValue}
            onChange={(event) => handleTitleChange(event.target.value)}
            size="sm"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase text-muted-foreground">Static Configuration</div>
            <div className="text-[10px] text-muted-foreground">Template: {node.template}</div>
          </div>
          {StaticView ? (
            <StaticView
              key={`static-${node.id}`}
              templateName={node.template}
              value={node.config ?? {}}
              onChange={handleConfigChange}
              readOnly={false}
              disabled={false}
              onValidate={handleValidate}
            />
          ) : (
            <pre className="text-xs bg-[var(--agyn-bg-light)] rounded-md p-3 whitespace-pre-wrap break-all">{configJson}</pre>
          )}
          {validationErrors.length > 0 ? (
            <div className="text-xs text-[var(--agyn-status-failed)] space-y-1">
              {validationErrors.map((err, idx) => (
                <div key={idx}>• {err}</div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="text-[10px] uppercase text-muted-foreground">Node State</div>
          <pre className="text-xs bg-[var(--agyn-bg-light)] rounded-md p-3 whitespace-pre-wrap break-all">{stateJson}</pre>
        </section>

        {node.kind === 'MCP' ? <McpToolsSection nodeId={node.id} /> : null}
      </div>
    </div>
  );
}

function McpToolsSection({ nodeId }: { nodeId: string }) {
  const { tools, enabledTools, setEnabledTools, isLoading } = useMcpNodeState(nodeId);
  const enabledSet = useMemo(() => new Set(enabledTools ?? []), [enabledTools]);

  const handleToggle = useCallback(
    (name: string, enabled: boolean) => {
      const next = new Set(enabledSet);
      if (enabled) {
        next.add(name);
      } else {
        next.delete(name);
      }
      setEnabledTools(Array.from(next));
    },
    [enabledSet, setEnabledTools],
  );

  return (
    <section className="space-y-3">
      <div className="text-[10px] uppercase text-muted-foreground">Tools</div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading tools…</div>
      ) : tools.length === 0 ? (
        <div className="text-xs text-muted-foreground">No tools reported for this node.</div>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <ToolItem
              key={tool.name}
              name={tool.title ?? tool.name}
              description={tool.description ?? 'No description provided.'}
              enabled={enabledSet.has(tool.name)}
              onToggle={(value) => handleToggle(tool.name, value)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
