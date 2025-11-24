import type { SecretEntry, SecretKey } from '@/api/modules/graph';
import type { Secret as SecretsScreenSecret } from '@/components/screens/SecretsScreen';

export type VaultSecretKey = SecretKey;

export type ScreenSecret = SecretsScreenSecret & {
  mount: string;
  path: string;
  required: boolean;
  present: boolean;
};

const ID_DELIMITER = '::';

export function toId({ mount, path, key }: VaultSecretKey): string {
  return [mount, path, key].join(ID_DELIMITER);
}

export function toKeyPath({ mount, path, key }: VaultSecretKey): string {
  const normalizedPath = path?.trim();
  if (!normalizedPath) return `${mount}/${key}`;
  return `${mount}/${normalizedPath}/${key}`;
}

export function parseKeyPath(input: string): VaultSecretKey | null {
  const raw = input.trim();
  if (!raw) return null;

  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const mount = segments[0];
  const key = segments[segments.length - 1];
  const pathSegments = segments.slice(1, -1);
  const path = pathSegments.join('/') || '';

  if (!mount || !key) return null;

  return { mount, path, key };
}

export function mapEntryToScreenSecret(entry: SecretEntry): ScreenSecret {
  const base: VaultSecretKey = {
    mount: entry.mount,
    path: entry.path,
    key: entry.key,
  };

  const status: SecretsScreenSecret['status'] = entry.required && !entry.present ? 'missing' : 'used';

  return {
    id: toId(base),
    key: toKeyPath(base),
    value: '',
    status,
    mount: entry.mount,
    path: entry.path,
    required: entry.required,
    present: entry.present,
  };
}
