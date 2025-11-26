import { parse as parseYamlImpl, stringify as stringifyYamlImpl } from 'yaml';

export function parseYaml<T>(text: string): T {
  return parseYamlImpl(text) as T;
}

export function stringifyYaml(input: unknown): string {
  const out = stringifyYamlImpl(input, {
    indent: 2,
    sortMapEntries: false,
    lineWidth: 0,
  });
  return out.endsWith('\n') ? out : `${out}\n`;
}
