import { useCallback, useRef, useState } from 'react';

import { listAllSecretPaths } from '@/features/secrets/utils/flatVault';
import { listVariables } from '@/features/variables/api';

const SECRET_TTL_MS = 5 * 60 * 1000;
const VARIABLE_TTL_MS = 5 * 60 * 1000;

const sanitizeList = (items: unknown): string[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item): item is string => typeof item === 'string' && item.length > 0);
};

export function useReferenceSuggestions() {
  const [secretKeys, setSecretKeys] = useState<string[]>([]);
  const [variableKeys, setVariableKeys] = useState<string[]>([]);

  const secretCacheRef = useRef<string[] | null>(null);
  const secretFetchedAtRef = useRef<number>(0);
  const secretPromiseRef = useRef<Promise<string[]> | null>(null);

  const variableCacheRef = useRef<string[] | null>(null);
  const variableFetchedAtRef = useRef<number>(0);
  const variablePromiseRef = useRef<Promise<string[]> | null>(null);

  const ensureSecretKeys = useCallback(async () => {
    const cached = secretCacheRef.current;
    const now = Date.now();
    if (cached && now - secretFetchedAtRef.current < SECRET_TTL_MS) {
      setSecretKeys((current) => (current === cached ? current : cached));
      return cached;
    }

    if (!secretPromiseRef.current) {
      secretPromiseRef.current = listAllSecretPaths()
        .then((items) => {
          const sanitized = sanitizeList(items);
          secretCacheRef.current = sanitized;
          secretFetchedAtRef.current = Date.now();
          setSecretKeys(sanitized);
          return sanitized;
        })
        .catch(() => {
          secretCacheRef.current = [];
          secretFetchedAtRef.current = Date.now();
          setSecretKeys([]);
          return [];
        })
        .finally(() => {
          secretPromiseRef.current = null;
        });
    }

    try {
      return await secretPromiseRef.current;
    } catch {
      return [];
    }
  }, []);

  const ensureVariableKeys = useCallback(async () => {
    const cached = variableCacheRef.current;
    const now = Date.now();
    if (cached && now - variableFetchedAtRef.current < VARIABLE_TTL_MS) {
      setVariableKeys((current) => (current === cached ? current : cached));
      return cached;
    }

    if (!variablePromiseRef.current) {
      variablePromiseRef.current = listVariables()
        .then((items) => {
          const keys = items
            .map((item) => item?.key)
            .filter((key): key is string => typeof key === 'string' && key.length > 0);
          variableCacheRef.current = keys;
          variableFetchedAtRef.current = Date.now();
          setVariableKeys(keys);
          return keys;
        })
        .catch(() => {
          variableCacheRef.current = [];
          variableFetchedAtRef.current = Date.now();
          setVariableKeys([]);
          return [];
        })
        .finally(() => {
          variablePromiseRef.current = null;
        });
    }

    try {
      return await variablePromiseRef.current;
    } catch {
      return [];
    }
  }, []);

  return {
    secretKeys,
    variableKeys,
    ensureSecretKeys,
    ensureVariableKeys,
  } as const;
}
