import { useEffect, useState } from 'react';
import { makeStorageKey } from '../utils/keys';
import { isBrowser } from '../utils/env';

export function usePersistedViewMode<T extends string>(keyParts: (string | number)[], defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (!isBrowser) return defaultValue;
    try {
      const k = makeStorageKey(keyParts);
      const v = window.localStorage.getItem(k);
      return (v as T) || defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    if (!isBrowser) return;
    try {
      const k = makeStorageKey(keyParts);
      const v = window.localStorage.getItem(k);
      setValue((v as T) || defaultValue);
    } catch {
      setValue(defaultValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, keyParts.map(String));

  const setAndPersist = (v: T) => {
    setValue(v);
    if (!isBrowser) return;
    try {
      const k = makeStorageKey(keyParts);
      window.localStorage.setItem(k, v);
    } catch {
      // ignore persistence errors
    }
  };
  return [value, setAndPersist];
}

