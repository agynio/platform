import { useCallback } from 'react';

import { Input } from '../../Input';
import { FieldLabel } from '../FieldLabel';
import type { NodePropertiesViewProps } from '../viewTypes';

type SecretNodeProps = NodePropertiesViewProps<'Secret'>;

function SecretNodeConfigContent({ config, onConfigChange }: SecretNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const secretPath = typeof configRecord.secretPath === 'string' ? (configRecord.secretPath as string) : '';
  const secretKey = typeof configRecord.secretKey === 'string' ? (configRecord.secretKey as string) : '';
  const version = typeof configRecord.version === 'string' ? (configRecord.version as string) : '';

  const handleSecretPathChange = useCallback(
    (value: string) => {
      onConfigChange?.({ secretPath: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  const handleSecretKeyChange = useCallback(
    (value: string) => {
      onConfigChange?.({ secretKey: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  const handleVersionChange = useCallback(
    (value: string) => {
      onConfigChange?.({ version: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  return (
    <section className="space-y-4">
      <div>
        <FieldLabel label="Secret path" hint="Path for the secret in the provider." required />
        <Input
          size="sm"
          value={secretPath}
          placeholder="/path/to/secret"
          onChange={(event) => handleSecretPathChange(event.target.value)}
        />
      </div>
      <div>
        <FieldLabel label="Secret key" hint="Key within the secret payload." required />
        <Input
          size="sm"
          value={secretKey}
          placeholder="apiKey"
          onChange={(event) => handleSecretKeyChange(event.target.value)}
        />
      </div>
      <div>
        <FieldLabel label="Version" hint="Optional version identifier." />
        <Input
          size="sm"
          value={version}
          placeholder="latest"
          onChange={(event) => handleVersionChange(event.target.value)}
        />
      </div>
    </section>
  );
}

export function SecretNodeConfigView(props: NodePropertiesViewProps<'Secret'>) {
  return <SecretNodeConfigContent {...props} />;
}

export default SecretNodeConfigView;
