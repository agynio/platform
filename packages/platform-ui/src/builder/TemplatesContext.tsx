import { createContext } from 'react';
import type { TemplateNodeSchema } from 'shared';

interface TemplatesContextValue {
  templates: TemplateNodeSchema[];
}

export const TemplatesContext = createContext<TemplatesContextValue>({ templates: [] });

export function TemplatesProvider({
  templates,
  children,
}: {
  templates: TemplateNodeSchema[];
  children: React.ReactNode;
}) {
  return <TemplatesContext.Provider value={{ templates }}>{children}</TemplatesContext.Provider>;
}
