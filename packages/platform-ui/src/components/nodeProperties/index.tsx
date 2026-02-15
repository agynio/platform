import { memo, useMemo } from 'react';

import { Header } from './Header';
import { NodePropertiesContent } from './NodePropertiesContent';
import type { NodePropertiesSidebarProps } from './types';
import { computeAgentDefaultTitle } from '../../utils/agentDisplay';

function NodePropertiesSidebar(props: NodePropertiesSidebarProps) {
  const { config, state, displayTitle, canProvision = false, canDeprovision = false, isActionPending = false, onProvision, onDeprovision } = props;

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
        <NodePropertiesContent {...props} />
      </div>
    </div>
  );
}

export default memo(NodePropertiesSidebar);
export type { NodeConfig, NodePropertiesSidebarProps, NodeState } from './types';
