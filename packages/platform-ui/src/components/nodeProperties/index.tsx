import { memo, useCallback, useMemo } from 'react';

import { Input } from '../Input';

import { Header } from './Header';
import { FieldLabel } from './FieldLabel';
import type { NodeConfig, NodePropertiesSidebarProps, NodeState } from './types';
import type { NodePropertiesViewProps } from './viewTypes';
import { NODE_VIEW_REGISTRY } from './viewRegistry';
import { computeAgentDefaultTitle } from '../../utils/agentDisplay';

function NodePropertiesSidebar(props: NodePropertiesSidebarProps) {
  const {
    config,
    state,
    displayTitle,
    onConfigChange,
    onProvision,
    onDeprovision,
    canProvision = false,
    canDeprovision = false,
    isActionPending = false,
    tools,
    enabledTools,
    onToggleTool,
    toolsLoading,
    nixPackageSearch,
    fetchNixPackageVersions,
    resolveNixPackageSelection,
    secretKeys,
    variableKeys,
    ensureSecretKeys,
    ensureVariableKeys,
  } = props;

  const nodeKind = config.kind;
  const nodeTitleValue = typeof config.title === 'string' ? config.title : '';
  const configRecord = config as Record<string, unknown>;

  const agentNameValue = typeof configRecord.name === 'string' ? (configRecord.name as string) : '';
  const agentRoleValue = typeof configRecord.role === 'string' ? (configRecord.role as string) : '';

  const agentDefaultTitle = useMemo(
    () => computeAgentDefaultTitle(agentNameValue.trim(), agentRoleValue.trim(), 'Agent'),
    [agentNameValue, agentRoleValue],
  );

  const headerTitle = useMemo(() => {
    if (nodeKind === 'Agent') {
      return agentDefaultTitle;
    }
    const providedDisplay = typeof displayTitle === 'string' ? displayTitle.trim() : '';
    if (providedDisplay.length > 0) {
      return providedDisplay;
    }
    const trimmed = nodeTitleValue.trim();
    return trimmed.length > 0 ? trimmed : nodeTitleValue;
  }, [agentDefaultTitle, displayTitle, nodeKind, nodeTitleValue]);

  const handleConfigChange = useCallback(
    (partial: Partial<NodeConfig>) => {
      if (!onConfigChange) {
        return;
      }

      if (nodeKind !== 'Agent') {
        onConfigChange(partial);
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(partial, 'title')) {
        onConfigChange(partial);
        return;
      }

      const rawTitle = partial.title;
      const stringTitle = typeof rawTitle === 'string' ? rawTitle : '';
      const trimmedTitle = stringTitle.trim();
      onConfigChange({ ...partial, title: trimmedTitle });
    },
    [nodeKind, onConfigChange],
  );

  const secretSuggestions = useMemo(() => (Array.isArray(secretKeys) ? secretKeys : []), [secretKeys]);
  const variableSuggestions = useMemo(() => (Array.isArray(variableKeys) ? variableKeys : []), [variableKeys]);

  const viewElement = (() => {
    switch (config.kind) {
      case 'Tool': {
        const View = NODE_VIEW_REGISTRY.Tool;
        const toolViewProps: NodePropertiesViewProps<'Tool'> = {
          config,
          state,
          displayTitle,
          onConfigChange: handleConfigChange,
          onProvision,
          onDeprovision,
          canProvision,
          canDeprovision,
          isActionPending,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
        } satisfies NodePropertiesViewProps<'Tool'>;
        return <View {...toolViewProps} />;
      }
      case 'Workspace': {
        const View = NODE_VIEW_REGISTRY.Workspace;
        const workspaceViewProps: NodePropertiesViewProps<'Workspace'> = {
          config,
          state,
          displayTitle,
          onConfigChange: handleConfigChange,
          onProvision,
          onDeprovision,
          canProvision,
          canDeprovision,
          isActionPending,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          nixPackageSearch,
          fetchNixPackageVersions,
          resolveNixPackageSelection,
        } satisfies NodePropertiesViewProps<'Workspace'>;
        return <View {...workspaceViewProps} />;
      }
      case 'MCP': {
        const View = NODE_VIEW_REGISTRY.MCP;
        const mcpViewProps: NodePropertiesViewProps<'MCP'> = {
          config,
          state,
          displayTitle,
          onConfigChange: handleConfigChange,
          onProvision,
          onDeprovision,
          canProvision,
          canDeprovision,
          isActionPending,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          tools,
          enabledTools,
          onToggleTool,
          toolsLoading,
        } satisfies NodePropertiesViewProps<'MCP'>;
        return <View {...mcpViewProps} />;
      }
      case 'Agent': {
        const View = NODE_VIEW_REGISTRY.Agent;
        const agentViewProps: NodePropertiesViewProps<'Agent'> = {
          config,
          state,
          displayTitle,
          onConfigChange: handleConfigChange,
          onProvision,
          onDeprovision,
          canProvision,
          canDeprovision,
          isActionPending,
        } satisfies NodePropertiesViewProps<'Agent'>;
        return <View {...agentViewProps} />;
      }
      case 'Trigger': {
        const View = NODE_VIEW_REGISTRY.Trigger;
        const triggerViewProps: NodePropertiesViewProps<'Trigger'> = {
          config,
          state,
          displayTitle,
          onConfigChange: handleConfigChange,
          onProvision,
          onDeprovision,
          canProvision,
          canDeprovision,
          isActionPending,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
        } satisfies NodePropertiesViewProps<'Trigger'>;
        return <View {...triggerViewProps} />;
      }
      default: {
        const unexpectedKind: never = config.kind;
        throw new Error(`Unsupported node kind: ${String(unexpectedKind)}`);
      }
    }
  })();

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col">
      <Header
        title={headerTitle}
        status={state.status}
        canProvision={canProvision}
        canDeprovision={canDeprovision}
        isActionPending={isActionPending}
        onProvision={onProvision}
        onDeprovision={onDeprovision}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-8">
          <section>
            <FieldLabel label="Title" hint="The display name for this node" />
            <Input
              value={nodeTitleValue}
              onChange={(event) => handleConfigChange({ title: event.target.value })}
              size="sm"
              placeholder={nodeKind === 'Agent' ? agentDefaultTitle : undefined}
            />
          </section>

          {viewElement}
        </div>
      </div>
    </div>
  );
}

export default memo(NodePropertiesSidebar);
export type { NodeConfig, NodePropertiesSidebarProps, NodeState };
