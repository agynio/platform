import { useCallback } from 'react';

import { Dropdown } from '../../Dropdown';
import { Input } from '../../Input';
import { FieldLabel } from '../FieldLabel';
import type { NodePropertiesViewProps } from '../viewTypes';

type SecretProviderNodeProps = NodePropertiesViewProps<'SecretProvider'>;

const PROVIDER_OPTIONS = [
  { value: 'vault', label: 'Vault' },
  { value: 'aws_secrets_manager', label: 'AWS Secrets Manager' },
  { value: 'gcp_secret_manager', label: 'GCP Secret Manager' },
  { value: 'azure_key_vault', label: 'Azure Key Vault' },
];

function SecretProviderNodeConfigContent({ config, onConfigChange }: SecretProviderNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const providerType = typeof configRecord.providerType === 'string' ? (configRecord.providerType as string) : '';
  const providerValue = providerType.length > 0 ? providerType : undefined;
  const endpoint = typeof configRecord.endpoint === 'string' ? (configRecord.endpoint as string) : '';
  const authToken = typeof configRecord.authToken === 'string' ? (configRecord.authToken as string) : '';

  const handleProviderChange = useCallback(
    (value: string) => {
      onConfigChange?.({ providerType: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  const handleEndpointChange = useCallback(
    (value: string) => {
      onConfigChange?.({ endpoint: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  const handleAuthTokenChange = useCallback(
    (value: string) => {
      onConfigChange?.({ authToken: value.length > 0 ? value : undefined });
    },
    [onConfigChange],
  );

  return (
    <section className="space-y-4">
      <div>
        <FieldLabel label="Provider type" hint="Select the secret provider integration." required />
        <Dropdown
          size="sm"
          value={providerValue}
          onValueChange={handleProviderChange}
          options={PROVIDER_OPTIONS}
          placeholder="Select a provider"
        />
      </div>
      <div>
        <FieldLabel label="Endpoint URL" hint="Base URL for the provider API." />
        <Input
          size="sm"
          value={endpoint}
          placeholder="https://vault.example.com"
          onChange={(event) => handleEndpointChange(event.target.value)}
        />
      </div>
      <div>
        <FieldLabel label="Auth token" hint="Token used to authenticate with the provider." />
        <Input
          size="sm"
          value={authToken}
          placeholder="Enter token"
          onChange={(event) => handleAuthTokenChange(event.target.value)}
        />
      </div>
    </section>
  );
}

export function SecretProviderNodeConfigView(props: NodePropertiesViewProps<'SecretProvider'>) {
  return <SecretProviderNodeConfigContent {...props} />;
}

export default SecretProviderNodeConfigView;
