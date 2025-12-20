import { memo, useCallback, useMemo } from 'react';

import { Input } from '../Input';

import { Header } from './Header';
import { FieldLabel } from './FieldLabel';
import type { NodeConfig, NodePropertiesSidebarProps, NodeState } from './types';
import type { NodePropertiesViewComponent, NodePropertiesViewProps } from './viewTypes';
import { NODE_TEMPLATE_KIND_MAP, isNodeTemplateName } from './viewTypes';
import { NODE_TEMPLATE_VIEW_REGISTRY, NODE_VIEW_REGISTRY } from './viewRegistry';
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

  const templateName = typeof config.template === 'string' ? config.template : undefined;

  const templateViewFor = <K extends NodeConfig['kind']>(kind: K): NodePropertiesViewComponent<K> | undefined => {
    if (!templateName || !isNodeTemplateName(templateName)) {
      return undefined;
    }
    const expectedKind = NODE_TEMPLATE_KIND_MAP[templateName];
    if (expectedKind !== kind) {
      return undefined;
    }
    const override = NODE_TEMPLATE_VIEW_REGISTRY[templateName];
    if (!override) {
      return undefined;
    }
    return override as NodePropertiesViewComponent<K>;
  };

  const viewElement = (() => {
    switch (config.kind) {
      case 'Tool': {
        const View = templateViewFor('Tool') ?? NODE_VIEW_REGISTRY.Tool;
        const toolConfig = config as NodePropertiesViewProps<'Tool'>['config'];
        const toolViewProps: NodePropertiesViewProps<'Tool'> = {
          config: toolConfig,
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
        const View = templateViewFor('Workspace') ?? NODE_VIEW_REGISTRY.Workspace;
        const workspaceConfig = config as NodePropertiesViewProps<'Workspace'>['config'];
        const workspaceViewProps: NodePropertiesViewProps<'Workspace'> = {
          config: workspaceConfig,
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
        const View = templateViewFor('MCP') ?? NODE_VIEW_REGISTRY.MCP;
        const mcpConfig = config as NodePropertiesViewProps<'MCP'>['config'];
        const mcpViewProps: NodePropertiesViewProps<'MCP'> = {
          config: mcpConfig,
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
        const View = templateViewFor('Agent') ?? NODE_VIEW_REGISTRY.Agent;
        const agentConfig = config as NodePropertiesViewProps<'Agent'>['config'];
        const agentViewProps: NodePropertiesViewProps<'Agent'> = {
          config: agentConfig,
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
        const View = templateViewFor('Trigger') ?? NODE_VIEW_REGISTRY.Trigger;
        const triggerConfig = config as NodePropertiesViewProps<'Trigger'>['config'];
        const triggerViewProps: NodePropertiesViewProps<'Trigger'> = {
          config: triggerConfig,
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
