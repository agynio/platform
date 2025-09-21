import { useContext } from 'react';
import { TemplatesContext } from './templatesContext';

export function useTemplates() {
  return useContext(TemplatesContext);
}
