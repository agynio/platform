import { useCallback, useMemo } from 'react';

import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import { Textarea } from '../../../Textarea';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

export function MemoryToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);
  const descriptionValue = typeof configRecord.description === 'string' ? (configRecord.description as string) : '';
  const promptValue = typeof configRecord.prompt === 'string' ? (configRecord.prompt as string) : '';

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

  return (
    <>
      <ToolNameField {...nameField} />

      <section>
        <FieldLabel label="Prompt" hint="Optional prompt metadata shared with the parent agent." />
        <Textarea
          value={promptTextareaValue}
          onChange={(event) => handlePromptChange(event.target.value)}
          className="min-h-[96px]"
          placeholder="Describe when to reference stored memory..."
          maxLength={8192}
        />
      </section>

      <section>
        <FieldLabel label="Description" hint="Optional description for the memory tool metadata." />
        <Textarea
          value={descriptionTextareaValue}
          onChange={(event) => handleDescriptionChange(event.target.value)}
          className="min-h-[96px]"
        />
      </section>
    </>
  );
}

export default MemoryToolTemplateView;
