import { useCallback, useMemo } from 'react';

import type { NodePropertiesViewProps } from '../viewTypes';
import ToolNameField from './toolTemplates/ToolNameField';
import { useToolNameField } from './toolTemplates/useToolNameField';
import { FieldLabel } from '../FieldLabel';
import { Textarea } from '../../Textarea';

export function ToolNodeConfigView(props: NodePropertiesViewProps<'Tool'>) {
  const nameField = useToolNameField(props);
  const { config, onConfigChange } = props;

  const promptValue = useMemo(() => {
    const prompt = (config as Record<string, unknown>)?.prompt;
    return typeof prompt === 'string' ? prompt : '';
  }, [config]);

  const handlePromptChange = useCallback(
    (value: string) => {
      onConfigChange?.({ prompt: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  return (
    <>
      <ToolNameField {...nameField} />
      <section className="space-y-2">
        <FieldLabel label="Prompt" hint="Optional prompt metadata shared with the parent agent." />
        <Textarea
          rows={3}
          value={promptValue}
          onChange={(event) => handlePromptChange(event.target.value)}
          placeholder="Provide guidance for this tool..."
          className="min-h-[96px]"
          maxLength={8192}
        />
      </section>
    </>
  );
}

export default ToolNodeConfigView;
