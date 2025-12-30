import { useCallback, useEffect, useMemo, useState } from 'react';

import { AgentSection } from '../AgentSection';
import type { AgentQueueConfig, AgentSummarizationConfig } from '../types';
import type { NodePropertiesViewProps } from '../viewTypes';
import {
  applyQueueUpdate,
  applySummarizationUpdate,
  readQueueConfig,
  readSummarizationConfig,
} from '../utils';

type AgentNodeProps = NodePropertiesViewProps<'Agent'>;

function AgentNodeConfigContent({ config, onConfigChange, nodeId, graphNodes, graphEdges }: AgentNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const agentNameValue = typeof configRecord.name === 'string' ? (configRecord.name as string) : '';
  const agentRoleValue = typeof configRecord.role === 'string' ? (configRecord.role as string) : '';
  const agentModelValue = typeof configRecord.model === 'string' ? (configRecord.model as string) : '';
  const agentSystemPromptValue =
    typeof configRecord.systemPrompt === 'string' ? (configRecord.systemPrompt as string) : '';
  const agentRestrictOutput = configRecord.restrictOutput === true;
  const agentRestrictionMessageValue =
    typeof configRecord.restrictionMessage === 'string'
      ? (configRecord.restrictionMessage as string)
      : '';
  const agentRestrictionMaxInjectionsValue =
    typeof configRecord.restrictionMaxInjections === 'number'
      ? (configRecord.restrictionMaxInjections as number)
      : undefined;

  const [agentNameInput, setAgentNameInput] = useState(agentNameValue);
  const [agentRoleInput, setAgentRoleInput] = useState(agentRoleValue);
  const [agentNameDirty, setAgentNameDirty] = useState(false);
  const [agentRoleDirty, setAgentRoleDirty] = useState(false);

  useEffect(() => {
    if (agentNameDirty) return;
    setAgentNameInput(agentNameValue);
  }, [agentNameValue, agentNameDirty]);

  useEffect(() => {
    if (agentRoleDirty) return;
    setAgentRoleInput(agentRoleValue);
  }, [agentRoleValue, agentRoleDirty]);

  const agentQueueConfig = useMemo<AgentQueueConfig>(() => readQueueConfig(config), [config]);
  const agentSummarizationConfig = useMemo<AgentSummarizationConfig>(
    () => readSummarizationConfig(config),
    [config],
  );

  const handleAgentNameChange = useCallback(
    (value: string) => {
      setAgentNameDirty(true);
      setAgentNameInput(value);
      const trimmed = value.trim();
      const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
      const normalizedCurrent = agentNameValue.length > 0 ? agentNameValue : undefined;
      if (normalizedNext === normalizedCurrent) {
        return;
      }
      onConfigChange?.({ name: normalizedNext });
    },
    [agentNameValue, onConfigChange],
  );

  const handleAgentNameBlur = useCallback(() => {
    const trimmed = agentNameInput.trim();
    const nextInputValue = trimmed.length > 0 ? trimmed : '';
    setAgentNameInput(nextInputValue);
    setAgentNameDirty(false);

    const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
    const normalizedCurrent = agentNameValue.length > 0 ? agentNameValue : undefined;
    if (normalizedNext === normalizedCurrent) {
      return;
    }

    onConfigChange?.({ name: normalizedNext });
  }, [agentNameInput, agentNameValue, onConfigChange]);

  const handleAgentRoleChange = useCallback(
    (value: string) => {
      setAgentRoleDirty(true);
      setAgentRoleInput(value);
      const trimmed = value.trim();
      const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
      const normalizedCurrent = agentRoleValue.length > 0 ? agentRoleValue : undefined;
      if (normalizedNext === normalizedCurrent) {
        return;
      }
      onConfigChange?.({ role: normalizedNext });
    },
    [agentRoleValue, onConfigChange],
  );

  const handleAgentRoleBlur = useCallback(() => {
    const trimmed = agentRoleInput.trim();
    const nextInputValue = trimmed.length > 0 ? trimmed : '';
    setAgentRoleInput(nextInputValue);
    setAgentRoleDirty(false);

    const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
    const normalizedCurrent = agentRoleValue.length > 0 ? agentRoleValue : undefined;
    if (normalizedNext === normalizedCurrent) {
      return;
    }

    onConfigChange?.({ role: normalizedNext });
  }, [agentRoleInput, agentRoleValue, onConfigChange]);

  const handleAgentModelChange = useCallback(
    (value: string) => {
      onConfigChange?.({ model: value.trim() });
    },
    [onConfigChange],
  );

  const handleAgentSystemPromptChange = useCallback(
    (value: string) => {
      onConfigChange?.({ systemPrompt: value });
    },
    [onConfigChange],
  );

  const handleAgentRestrictOutputChange = useCallback(
    (checked: boolean) => {
      onConfigChange?.({ restrictOutput: checked });
    },
    [onConfigChange],
  );

  const handleAgentRestrictionMessageChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onConfigChange?.({ restrictionMessage: trimmed.length > 0 ? trimmed : undefined });
    },
    [onConfigChange],
  );

  const handleAgentRestrictionMaxInjectionsChange = useCallback(
    (value: number | undefined) => {
      onConfigChange?.({ restrictionMaxInjections: value ?? undefined });
    },
    [onConfigChange],
  );

  const handleAgentQueueConfigChange = useCallback(
    (partial: Partial<AgentQueueConfig>) => {
      onConfigChange?.(applyQueueUpdate(config, partial));
    },
    [config, onConfigChange],
  );

  const handleAgentSummarizationChange = useCallback(
    (partial: Partial<AgentSummarizationConfig>) => {
      onConfigChange?.(applySummarizationUpdate(config, partial));
    },
    [config, onConfigChange],
  );

  return (
    <AgentSection
      name={agentNameInput}
      role={agentRoleInput}
      model={agentModelValue}
      systemPrompt={agentSystemPromptValue}
      restrictOutput={agentRestrictOutput}
      restrictionMessage={agentRestrictionMessageValue}
      restrictionMaxInjections={agentRestrictionMaxInjectionsValue}
      queueConfig={agentQueueConfig}
      summarization={agentSummarizationConfig}
      nodeId={nodeId}
      graphNodes={graphNodes}
      graphEdges={graphEdges}
      onNameChange={handleAgentNameChange}
      onNameBlur={handleAgentNameBlur}
      onRoleChange={handleAgentRoleChange}
      onRoleBlur={handleAgentRoleBlur}
      onModelChange={handleAgentModelChange}
      onSystemPromptChange={handleAgentSystemPromptChange}
      onRestrictOutputChange={handleAgentRestrictOutputChange}
      onRestrictionMessageChange={handleAgentRestrictionMessageChange}
      onRestrictionMaxInjectionsChange={handleAgentRestrictionMaxInjectionsChange}
      onQueueConfigChange={handleAgentQueueConfigChange}
      onSummarizationChange={handleAgentSummarizationChange}
    />
  );
}

export function AgentNodeConfigView(props: NodePropertiesViewProps<'Agent'>) {
  return <AgentNodeConfigContent {...props} />;
}

export default AgentNodeConfigView;
