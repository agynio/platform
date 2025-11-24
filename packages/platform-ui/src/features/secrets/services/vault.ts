import * as api from '@/api/modules/graph';
import type { VaultSecretKey } from '../types';

export async function readSecretValue({ mount, path, key }: VaultSecretKey): Promise<string> {
  const res = await api.graph.readVaultKey(mount, path, key);
  return res?.value ?? '';
}

export async function writeSecretValue({ mount, path, key }: VaultSecretKey, value: string) {
  return api.graph.writeVaultKey(mount, { path, key, value });
}
