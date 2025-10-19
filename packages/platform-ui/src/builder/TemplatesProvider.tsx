import React from 'react';
import type { TemplateNodeSchema } from 'shared';
import { TemplatesContext } from './templatesContext';

export function TemplatesProvider({ templates, children }: { templates: TemplateNodeSchema[]; children: React.ReactNode }) {
  return <TemplatesContext.Provider value={{ templates }}>{children}</TemplatesContext.Provider>;
}
