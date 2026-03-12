import { useCallback, type ChangeEvent } from 'react';

import { Dropdown } from '../../Dropdown';
import { Input } from '../../Input';
import { FieldLabel } from '../FieldLabel';
import type { NodePropertiesViewProps } from '../viewTypes';
import { isRecord } from '../utils';

type MemoryTemplateProps = NodePropertiesViewProps<'Workspace'>;
type MemoryScopeOption = 'global' | 'perThread';

const SCOPE_OPTIONS: Array<{ value: MemoryScopeOption; label: string }> = [
  { value: 'global', label: 'Global (shared across threads)' },
  { value: 'perThread', label: 'Per thread (isolated by thread)' },
];

export function MemoryWorkspaceTemplateView({ config, onConfigChange }: MemoryTemplateProps) {
  const configRecord = config as Record<string, unknown>;
  const staticConfig = isRecord(configRecord.staticConfig)
    ? (configRecord.staticConfig as Record<string, unknown>)
    : undefined;
  const rawScope = typeof configRecord.scope === 'string' ? (configRecord.scope as string) : undefined;
  const staticScope = typeof staticConfig?.scope === 'string' ? (staticConfig.scope as string) : undefined;
  const rawCollectionPrefix =
    typeof configRecord.collectionPrefix === 'string'
      ? (configRecord.collectionPrefix as string)
      : typeof configRecord.collection_prefix === 'string'
      ? (configRecord.collection_prefix as string)
      : '';
  const scope: MemoryScopeOption =
    rawScope === 'perThread'
      ? 'perThread'
      : rawScope === 'global'
      ? 'global'
      : staticScope === 'perThread'
      ? 'perThread'
      : 'global';

  const handleScopeChange = useCallback(
    (next: string) => {
      const scopeValue: MemoryScopeOption = next === 'perThread' ? 'perThread' : 'global';
      onConfigChange?.({ scope: scopeValue });
    },
    [onConfigChange],
  );

  const handleCollectionPrefixChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      onConfigChange?.({ collectionPrefix: value.trim().length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  return (
    <section className="space-y-4">
      <div>
        <FieldLabel
          label="Scope"
          hint="Global shares memory across all threads; Per thread keeps data isolated per conversation."
        />
        <Dropdown
          size="sm"
          value={scope}
          onValueChange={handleScopeChange}
          options={SCOPE_OPTIONS}
        />
      </div>
      <div>
        <FieldLabel
          label="Collection prefix"
          hint="Optional prefix applied to collection names for stored memories."
        />
        <Input
          value={rawCollectionPrefix}
          onChange={handleCollectionPrefixChange}
          placeholder="e.g. team-memory"
        />
      </div>
    </section>
  );
}

export default MemoryWorkspaceTemplateView;
