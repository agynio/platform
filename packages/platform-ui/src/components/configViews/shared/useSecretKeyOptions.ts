import { useEffect, useState } from 'react';
import { listAllSecretPaths } from '@/features/secrets/utils/flatVault';

const SECRET_SUGGESTION_TTL_MS = 5 * 60 * 1000;

let cachedSecretKeys: string[] | null = null;
let cachedAt = 0;
let inflightPromise: Promise<string[]> | null = null;

async function fetchSecretKeys(): Promise<string[]> {
  const now = Date.now();
  if (cachedSecretKeys && now - cachedAt < SECRET_SUGGESTION_TTL_MS) {
    return cachedSecretKeys;
  }

  if (!inflightPromise) {
    inflightPromise = listAllSecretPaths()
      .then((keys) => {
        cachedSecretKeys = Array.isArray(keys) ? keys : [];
        cachedAt = Date.now();
        return cachedSecretKeys;
      })
      .catch(() => {
        cachedSecretKeys = [];
        cachedAt = Date.now();
        return cachedSecretKeys;
      })
      .finally(() => {
        inflightPromise = null;
      });
  }

  return inflightPromise;
}

export function useSecretKeyOptions(): string[] {
  const [secretKeys, setSecretKeys] = useState<string[]>(() => cachedSecretKeys ?? []);

  useEffect(() => {
    let cancelled = false;
    void fetchSecretKeys().then((keys) => {
      if (cancelled) return;
      setSecretKeys((current) => (current === keys ? current : keys));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return secretKeys;
}
