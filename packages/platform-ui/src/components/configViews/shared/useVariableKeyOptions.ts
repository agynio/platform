import { useEffect, useState } from 'react';
import { listVariables } from '@/features/variables/api';

const VARIABLE_SUGGESTION_TTL_MS = 5 * 60 * 1000;

let cachedVariableKeys: string[] | null = null;
let variableCachedAt = 0;
let variableInflightPromise: Promise<string[]> | null = null;

async function fetchVariableKeys(): Promise<string[]> {
  const now = Date.now();
  if (cachedVariableKeys && now - variableCachedAt < VARIABLE_SUGGESTION_TTL_MS) {
    return cachedVariableKeys;
  }

  if (!variableInflightPromise) {
    variableInflightPromise = listVariables()
      .then((items) => {
        const keys = Array.isArray(items)
          ? items
              .map((item) => (typeof item?.key === 'string' ? item.key : ''))
              .filter((key): key is string => key.length > 0)
          : [];
        cachedVariableKeys = keys;
        variableCachedAt = Date.now();
        return cachedVariableKeys;
      })
      .catch(() => {
        cachedVariableKeys = [];
        variableCachedAt = Date.now();
        return cachedVariableKeys;
      })
      .finally(() => {
        variableInflightPromise = null;
      });
  }

  return variableInflightPromise;
}

export function useVariableKeyOptions(): string[] {
  const [variableKeys, setVariableKeys] = useState<string[]>(() => cachedVariableKeys ?? []);

  useEffect(() => {
    let cancelled = false;
    void fetchVariableKeys().then((keys) => {
      if (cancelled) return;
      setVariableKeys((current) => (current === keys ? current : keys));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return variableKeys;
}
