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
  const responseMode: ResponseMode =
    configRecord.response === 'async' || configRecord.response === 'ignore'
      ? (configRecord.response as ResponseMode)
      : 'sync';

  const descriptionTextareaValue = useMemo(() => descriptionValue, [descriptionValue]);

  const handleDescriptionChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onConfigChange?.({ description: trimmed.length > 0 ? trimmed : undefined });
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
          <FieldLabel label="Description" hint="Optional description shared with downstream tooling." />
          <Textarea
            value={descriptionTextareaValue}
            onChange={(event) => handleDescriptionChange(event.target.value)}
            className="min-h-[96px]"
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
