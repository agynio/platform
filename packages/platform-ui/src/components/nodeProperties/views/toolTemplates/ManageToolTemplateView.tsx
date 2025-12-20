import { useCallback, useMemo } from 'react';

import { Dropdown } from '../../../Dropdown';
import { Input } from '../../../Input';
import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import { readNumber, toNumberOrUndefined } from '../../utils';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

type ManageMode = 'sync' | 'async';

export function ManageToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const mode = configRecord.mode === 'async' ? 'async' : 'sync';
  const timeoutMs = readNumber(configRecord.timeoutMs);

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

  return (
    <>
      <ToolNameField {...nameField} />

      <section className="space-y-4">
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
