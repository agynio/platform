import type {
  ConfigViewMode,
  ConfigViewRegistration,
  DynamicConfigViewComponent,
  StaticConfigViewComponent,
} from './types';

type Key = `${string}:${ConfigViewMode}`;

const reg = new Map<Key, StaticConfigViewComponent | DynamicConfigViewComponent>();

function makeKey(template: string, mode: ConfigViewMode): Key {
  return `${template}:${mode}`;
}

export function registerConfigView(entry: ConfigViewRegistration) {
  reg.set(makeKey(entry.template, entry.mode), entry.component);
}

export function getConfigView(template: string, mode: ConfigViewMode) {
  return reg.get(makeKey(template, mode));
}

export function hasConfigView(template: string, mode: ConfigViewMode) {
  return reg.has(makeKey(template, mode));
}

export function clearRegistry() {
  reg.clear();
}

