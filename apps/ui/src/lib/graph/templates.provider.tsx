import React, { createContext, useContext, useMemo } from 'react';
import { useTemplates } from './hooks';
import type { TemplateSchema } from './types';

interface TemplatesContextValue {
  templates: TemplateSchema[];
  getTemplate: (name: string) => TemplateSchema | undefined;
  loading: boolean;
  ready: boolean;
  error: unknown;
}

const TemplatesContext = createContext<TemplatesContextValue | undefined>(undefined);

export function TemplatesProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isSuccess, error } = useTemplates();
  const map = useMemo(() => {
    const m = new Map<string, TemplateSchema>();
    for (const t of data || []) m.set(t.name, t);
    return m;
  }, [data]);
  const value: TemplatesContextValue = useMemo(
    () => ({
      templates: data || [],
      getTemplate: (name: string) => map.get(name),
      loading: !!isLoading,
      ready: !!isSuccess,
      error: error ?? null,
    }),
    [data, map, isLoading, isSuccess, error],
  );
  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

export function useTemplatesCache(): TemplatesContextValue {
  const ctx = useContext(TemplatesContext);
  if (!ctx) throw new Error('useTemplatesCache must be used within TemplatesProvider');
  return ctx;
}
