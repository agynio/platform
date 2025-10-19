import { useEffect, useState } from 'react';
import { isBrowser } from '../utils/env';

// Accept a precomputed storage key to keep hook deps simple and stable
export function usePersistedViewMode<T extends string>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (!isBrowser) return defaultValue;
    try {
      const v = window.localStorage.getItem(key);
      return (v as T) || defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    if (!isBrowser) return;
    try {
      const v = window.localStorage.getItem(key);
      setValue((v as T) || defaultValue);
    } catch {
      setValue(defaultValue);
    }
  }, [key, defaultValue]);

  const setAndPersist = (v: T) => {
    setValue(v);
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // ignore persistence errors
    }
  };
  return [value, setAndPersist];
}
