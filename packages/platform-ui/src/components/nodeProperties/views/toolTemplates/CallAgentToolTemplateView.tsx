import { useCallback, useMemo } from 'react';

import { Dropdown } from '../../../Dropdown';
import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import { Textarea } from '../../../Textarea';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

type ResponseMode = 'sync' | 'async' | 'ignore';

export function CallAgentToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const descriptionValue = typeof configRecord.description === 'string' ? (configRecord.description as string) : '';
  const promptValue = typeof configRecord.prompt === 'string' ? (configRecord.prompt as string) : '';
  const responseMode: ResponseMode =
    configRecord.response === 'async' || configRecord.response === 'ignore'
      ? (configRecord.response as ResponseMode)
      : 'sync';

  const descriptionTextareaValue = useMemo(() => descriptionValue, [descriptionValue]);
  const promptTextareaValue = useMemo(() => promptValue, [promptValue]);

  const handleDescriptionChange = useCallback(
    (value: string) => {
      onConfigChange?.({ description: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      onConfigChange?.({ prompt: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  const handleResponseModeChange = useCallback(
    (next: ResponseMode) => {
      onConfigChange?.({ response: next });
    },
    [onConfigChange],
  );

  return (
    <>
      <ToolNameField {...nameField} />

      <section className="space-y-4">
        <div>
          <FieldLabel label="Prompt" hint="Optional prompt metadata shared with the parent agent." />
          <Textarea
            value={promptTextareaValue}
            onChange={(event) => handlePromptChange(event.target.value)}
            className="min-h-[96px]"
            placeholder="Describe how this tool should be used..."
            maxLength={8192}
          />
        </div>
        <div>
          <FieldLabel label="Description" hint="Optional description shared with downstream tooling." />
          <Textarea
            value={descriptionTextareaValue}
            onChange={(event) => handleDescriptionChange(event.target.value)}
            className="min-h-[96px]"
            placeholder="Describe what this tool does..."
          />
        </div>
        <div>
          <FieldLabel label="Response mode" hint="Choose how the tool handles responses from the called agent." />
          <Dropdown
            size="sm"
            value={responseMode}
            onValueChange={(value) => handleResponseModeChange(value as ResponseMode)}
            options={[
              { value: 'sync', label: 'Sync (wait for response)' },
              { value: 'async', label: 'Async (fire and forget)' },
              { value: 'ignore', label: 'Ignore response' },
            ]}
          />
        </div>
      </section>
    </>
  );
}

export default CallAgentToolTemplateView;
