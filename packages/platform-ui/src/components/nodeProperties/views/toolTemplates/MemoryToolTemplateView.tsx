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

  const descriptionTextareaValue = useMemo(() => descriptionValue, [descriptionValue]);

  const handleDescriptionChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onConfigChange?.({ description: trimmed.length > 0 ? trimmed : undefined });
    },
    [onConfigChange],
  );

  return (
    <>
      <ToolNameField {...nameField} />

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
