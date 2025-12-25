import { useCallback, useMemo, type ChangeEvent } from 'react';

import { Dropdown } from '../../../Dropdown';
import { Input } from '../../../Input';
import { MarkdownInput } from '../../../MarkdownInput';
import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import { readNumber, toNumberOrUndefined } from '../../utils';

import { renderMustacheTemplate } from '@/lib/mustache';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

type ManageMode = 'sync' | 'async';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';

type ManageAgentContext = {
  name: string;
  role: string;
  prompt: string;
};

export function ManageToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange, nodeId, graphNodes, graphEdges } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const mode = configRecord.mode === 'async' ? 'async' : 'sync';
  const timeoutMs = readNumber(configRecord.timeoutMs);
  const promptValue = typeof configRecord.prompt === 'string' ? configRecord.prompt : '';

  const timeoutValue = useMemo(() => (timeoutMs !== undefined ? String(timeoutMs) : ''), [timeoutMs]);

  const handleModeChange = useCallback(
    (next: ManageMode) => {
      onConfigChange?.({ mode: next });
    },
    [onConfigChange],
  );

  const handleTimeoutChange = useCallback(
    (value: string) => {
      onConfigChange?.({ timeoutMs: toNumberOrUndefined(value) });
    },
    [onConfigChange],
  );

  const handlePromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onConfigChange?.({ prompt: event.target.value });
    },
    [onConfigChange],
  );

  const agentsContext = useMemo<ManageAgentContext[]>(() => {
    const currentNodeId = typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : null;
    if (!currentNodeId) {
      return [];
    }

    const nodesList = Array.isArray(graphNodes) ? graphNodes : [];
    const edgesList = Array.isArray(graphEdges) ? graphEdges : [];
    if (nodesList.length === 0 || edgesList.length === 0) {
      return [];
    }

    const nodesById = new Map(nodesList.map((node) => [node.id, node] as const));
    const seenTargets = new Set<string>();
    const context: ManageAgentContext[] = [];

    for (const edge of edgesList) {
      if (!edge) {
        continue;
      }
      const sourceId = typeof edge.source === 'string' ? edge.source : '';
      if (sourceId !== currentNodeId) {
        continue;
      }
      const handle = typeof edge.sourceHandle === 'string' ? edge.sourceHandle : '';
      if (handle && handle !== 'agent') {
        continue;
      }

      const targetId = typeof edge.target === 'string' ? edge.target : '';
      if (!targetId || seenTargets.has(targetId)) {
        continue;
      }

      const targetNode = nodesById.get(targetId);
      if (!targetNode || targetNode.kind !== 'Agent') {
        continue;
      }

      seenTargets.add(targetId);
      const targetConfig = (targetNode.config ?? {}) as Record<string, unknown>;
      const rawName = typeof targetConfig.name === 'string' ? targetConfig.name.trim() : '';
      const role = typeof targetConfig.role === 'string' ? targetConfig.role.trim() : '';
      const rawPrompt = typeof targetConfig.systemPrompt === 'string' ? targetConfig.systemPrompt : '';
      const prompt = rawPrompt && rawPrompt.trim().length > 0 ? rawPrompt : DEFAULT_SYSTEM_PROMPT;

      context.push({ name: rawName, role, prompt });
    }

    return context;
  }, [graphNodes, graphEdges, nodeId]);

  const renderPromptPreview = useCallback(
    (template: string) => {
      if (!template || template.trim().length === 0) {
        return '';
      }
      return renderMustacheTemplate(template, { agents: agentsContext });
    },
    [agentsContext],
  );

  return (
    <>
      <ToolNameField {...nameField} />

      <section className="space-y-4">
        <div>
          <FieldLabel
            label="Prompt"
            hint="Optional Mustache template shown to the parent agent. Context: { agents: { name, role, prompt }[] }."
          />
          <MarkdownInput
            rows={3}
            placeholder="Coordinate managed agents and assign roles..."
            value={promptValue}
            onChange={handlePromptChange}
            size="sm"
            maxLength={8192}
            helperText="Preview tab renders with connected agents context."
            previewTransform={renderPromptPreview}
          />
        </div>

        <div>
          <FieldLabel label="Mode" hint="sync waits for child responses; async sends without waiting" />
          <Dropdown
            size="sm"
            value={mode}
            onValueChange={(value) => handleModeChange(value as ManageMode)}
            options={[
              { value: 'sync', label: 'Sync' },
              { value: 'async', label: 'Async' },
            ]}
          />
        </div>

        <div>
          <FieldLabel label="Timeout (ms)" hint="0 disables timeout (sync mode only)" />
          <Input
            size="sm"
            placeholder="0"
            value={timeoutValue}
            onChange={(event) => handleTimeoutChange(event.target.value)}
          />
        </div>
      </section>
    </>
  );
}

export default ManageToolTemplateView;
