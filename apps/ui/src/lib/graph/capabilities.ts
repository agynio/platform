import type { TemplateSchema } from './types';

export function canPause(t: TemplateSchema): boolean {
  return !!t.capabilities?.pausable;
}
export function canProvision(t: TemplateSchema): boolean {
  return !!t.capabilities?.provisionable;
}
export function hasStaticConfig(t: TemplateSchema): boolean {
  return !!t.capabilities?.staticConfigurable && !!t.staticConfigSchema;
}
export function hasDynamicConfig(t: TemplateSchema): boolean {
  return !!t.capabilities?.dynamicConfigurable;
}

export function canPauseByName(name: string, getTemplate: (n: string) => TemplateSchema | undefined): boolean {
  const t = getTemplate(name);
  return t ? canPause(t) : false;
}
export function canProvisionByName(name: string, getTemplate: (n: string) => TemplateSchema | undefined): boolean {
  const t = getTemplate(name);
  return t ? canProvision(t) : false;
}
export function hasStaticConfigByName(name: string, getTemplate: (n: string) => TemplateSchema | undefined): boolean {
  const t = getTemplate(name);
  return t ? hasStaticConfig(t) : false;
}
export function hasDynamicConfigByName(name: string, getTemplate: (n: string) => TemplateSchema | undefined): boolean {
  const t = getTemplate(name);
  return t ? hasDynamicConfig(t) : false;
}
