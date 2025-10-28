import { z } from 'zod';
import type { VaultRef, VaultService } from '../vault/vault.service';

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

export type ReferenceValue = z.infer<typeof ReferenceFieldSchema>;

// Normalize a token reference from union input
export function normalizeTokenRef(input: string | ReferenceValue): ReferenceValue {
  if (typeof input === 'string') return { value: input, source: 'static' };
  return { value: input.value, source: input.source || 'static' };
}

// Resolve a token reference, validating expected prefix and handling vault semantics
export async function resolveTokenRef(
  ref: ReferenceValue,
  opts: { expectedPrefix: string; fieldName: string; vault: VaultService },
): Promise<string> {
  const { expectedPrefix, fieldName, vault } = opts;
  if ((ref.source || 'static') === 'vault') {
    const vr = parseVaultRef(ref.value);
    const secret = await vault.getSecret(vr);
    if (!secret) throw new Error(`Vault secret for ${fieldName} not found`);
    if (!String(secret).startsWith(expectedPrefix)) {
      const name = fieldName === 'bot_token' ? 'bot token' : 'app token';
      throw new Error(`Resolved Slack ${name} is invalid (must start with ${expectedPrefix})`);
    }
    return secret;
  }
  if (!ref.value?.startsWith(expectedPrefix)) {
    const name = fieldName === 'bot_token' ? 'bot token' : 'app token';
    throw new Error(`Slack ${name} must start with ${expectedPrefix}`);
  }
  return ref.value;
}
