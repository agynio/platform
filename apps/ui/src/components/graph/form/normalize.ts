import type { JsonSchemaObject } from './types';

export function normalizeForRjsf(schema: JsonSchemaObject | null): JsonSchemaObject | null {
  if (!schema) return null;
  type SchemaLike = JsonSchemaObject & { $ref?: string; definitions?: Record<string, JsonSchemaObject>; $defs?: Record<string, JsonSchemaObject>; $schema?: string };
  const s: SchemaLike = { ...schema } as SchemaLike;
  let candidate: JsonSchemaObject = s;
  const defName = 'SimpleAgentStaticConfig';
  if (s.$ref && typeof s.$ref === 'string') {
    const ref = s.$ref.replace(/^#\/(definitions|\$defs)\//, '');
    const defs = (s.definitions || s.$defs) as Record<string, JsonSchemaObject> | undefined;
    if (defs) {
      if (defs[ref]) candidate = defs[ref];
      else if (defs[defName]) candidate = defs[defName];
    }
  } else if (s.definitions?.[defName]) {
    candidate = s.definitions[defName];
  } else if (s.$defs?.[defName]) {
    candidate = s.$defs[defName];
  }
  const out: JsonSchemaObject = { ...candidate };
  if ('$schema' in out) delete (out as { $schema?: unknown }).$schema;
  return out;
}
