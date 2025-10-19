// Shared helpers for Vault reference parsing
// Reference format: "mount/path/to/secret/key"

export type ParsedVaultRef = { mount?: string; path?: string; key?: string; pathPrefix?: string };

export function parseVaultRef(v?: string): ParsedVaultRef {
  if (!v) return {};
  if (v.startsWith('/')) return {};
  const parts = v.split('/').filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { mount: parts[0] };
  if (parts.length === 2) return { mount: parts[0], pathPrefix: parts[1] };
  const mount = parts[0];
  const key = parts[parts.length - 1];
  const path = parts.slice(1, parts.length - 1).join('/');
  return { mount, path, key };
}

export function isValidVaultRef(v?: string): boolean {
  if (!v) return true; // empty value treated as valid input state
  if (v.startsWith('/')) return false;
  const parts = v.split('/').filter(Boolean);
  return parts.length >= 3;
}

