import { useCallback, useMemo, type ChangeEvent } from 'react';

import { Dropdown } from '../../../Dropdown';
import { Input } from '../../../Input';
import { MarkdownInput } from '../../../MarkdownInput';
import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import { readNumber, toNumberOrUndefined } from '../../utils';

import { renderMustacheTemplate } from '@/lib/mustache';
import { useTemplatesCache } from '@/lib/graph/templates.provider';

import { createPromptResolver, type PreviewManageAgentContext } from '../../promptPreview';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

type ManageMode = 'sync' | 'async';

export function ManageToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange, nodeId, graphNodes, graphEdges } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const mode = configRecord.mode === 'async' ? 'async' : 'sync';
  const timeoutMs = readNumber(configRecord.timeoutMs);
  const promptValue = typeof configRecord.prompt === 'string' ? configRecord.prompt : '';
  const { getTemplate } = useTemplatesCache();

  const promptResolver = useMemo(
    () =>
      createPromptResolver({
        graphNodes,
        graphEdges,
        getTemplate,
      }),
    [graphEdges, graphNodes, getTemplate],
  );

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

  const agentsContext = useMemo<PreviewManageAgentContext[]>(() => {
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      return [];
    }

    return promptResolver.buildManageAgentsContext(nodeId);
  }, [nodeId, promptResolver]);

  const renderPromptPreview = useCallback(
    (template: string) => {
      const rendered = template && template.trim().length > 0 ? renderMustacheTemplate(template, { agents: agentsContext }) : '';
      if (rendered.trim().length > 0) {
        return rendered;
      }
      if (typeof nodeId === 'string' && nodeId.length > 0) {
        return promptResolver.resolveManagePrompt(nodeId);
      }
      return '';
    },
    [agentsContext, nodeId, promptResolver],
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
