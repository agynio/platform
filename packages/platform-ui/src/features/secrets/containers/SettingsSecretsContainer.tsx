import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { Secret as SecretsScreenSecret } from '@/components/screens/SecretsScreen';
import { SecretsPage } from '@/components/secrets/SecretsPage';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useSecretsData } from '../hooks/useSecretsData';
import { parseKeyPath, toId, toKeyPath } from '../types';
import { writeSecretValue } from '../services/vault';

const KEY_FORMAT_ERROR = 'Secret key must be in mount/path/key format';
const KEY_RENAME_UNSUPPORTED = 'Renaming secrets is not supported yet';
const VALUE_REQUIRED_ERROR = 'Secret value is required';

function sanitizeKeyPath(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, '');
}

async function invalidateVaultQueries(qc: QueryClient, mount: string, path: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['vault', 'keys', mount, path] }),
    qc.invalidateQueries({ queryKey: ['vault', 'discover'] }),
  ]);
}

export function SettingsSecretsContainer() {
  const qc = useQueryClient();
  const secretsData = useSecretsData();

  const warningMessage = useMemo(() => {
    if (secretsData.discoveryError) {
      return 'Vault error: failed to discover keys. Showing graph-required secrets only.';
    }
    if (secretsData.vaultUnavailable) {
      return 'Vault not configured/unavailable. Showing graph-required secrets only.';
    }
    return null;
  }, [secretsData.discoveryError, secretsData.vaultUnavailable]);

  const persistSecret = useCallback(
    async (keyPath: string, rawValue: string) => {
      const normalizedKeyPath = sanitizeKeyPath(keyPath);
      const parsed = parseKeyPath(normalizedKeyPath);
      if (!parsed) {
        notifyError(KEY_FORMAT_ERROR);
        return;
      }

      const value = rawValue.trim();
      if (!value) {
        notifyError(VALUE_REQUIRED_ERROR);
        return;
      }

      try {
        await writeSecretValue(parsed, value);
        notifySuccess('Secret saved');
        await invalidateVaultQueries(qc, parsed.mount, parsed.path);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : 'Write failed';
        notifyError(message);
      }
    },
    [qc],
  );

  const handleCreateSecret = useCallback(
    (secret: Omit<SecretsScreenSecret, 'id'>) => {
      void persistSecret(secret.key, secret.value);
    },
    [persistSecret],
  );

  const handleUpdateSecret = useCallback(
    (id: string, secret: Omit<SecretsScreenSecret, 'id'>) => {
      const existing = secretsData.entries.find((entry) => toId(entry) === id);

      if (existing) {
        const originalKeyPath = toKeyPath(existing);
        const normalized = sanitizeKeyPath(secret.key);
        if (normalized !== originalKeyPath) {
          notifyError(KEY_RENAME_UNSUPPORTED);
          return;
        }
      }

      void persistSecret(secret.key, secret.value);
    },
    [persistSecret, secretsData.entries],
  );

  const handleDeleteSecret = useCallback((id: string) => {
    const entry = secretsData.entries.find((item) => toId(item) === id);
    const name = entry ? toKeyPath(entry) : 'secret';
    notifyError(`Delete not supported for ${name}`);
  }, [secretsData.entries]);

  return (
    <SecretsPage
      secrets={secretsData.secrets}
      isLoading={secretsData.isLoading}
      warningMessage={warningMessage}
      onCreateSecret={handleCreateSecret}
      onUpdateSecret={handleUpdateSecret}
      onDeleteSecret={handleDeleteSecret}
    />
  );
}
