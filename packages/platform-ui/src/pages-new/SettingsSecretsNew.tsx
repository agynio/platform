import { SecretsScreen } from '@agyn/ui-new';

const placeholderSecrets = [
  {
    id: 'placeholder',
    key: 'API_KEY',
    value: '********',
    status: 'used' as const,
  },
];

export function SettingsSecretsNew() {
  return <SecretsScreen secrets={placeholderSecrets} renderSidebar={false} />;
}
