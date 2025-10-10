import { z } from 'zod';
import type { VaultRef } from '../services/vault.service';

// Shared Vault reference parser: 'mount/path/key'
export function parseVaultRef(ref: string): VaultRef {
  if (!ref || typeof ref !== 'string') throw new Error('Vault ref must be a non-empty string');
  if (ref.startsWith('/')) throw new Error('Vault ref must not start with /');
  const parts = ref.split('/').filter((p) => p.length > 0);
  if (parts.length < 3) throw new Error('Vault ref must be in format mount/path/key');
  const mount = parts[0].replace(/\/$/, '');
  const key = parts[parts.length - 1];
  const path = parts.slice(1, parts.length - 1).join('/');
  if (!mount || !path || !key) throw new Error('Vault ref must include mount, path and key');
  return { mount, path, key };
}

// Zod helper schemas for reference-shaped fields
export const ReferenceFieldSchema = z
  .object({ value: z.string(), source: z.enum(['static', 'vault']).optional().default('static') })
  .strict();

