import { z, ZodTypeAny } from 'zod';

// Minimal JSON Schema subset interface
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  enum?: unknown[];
  description?: string;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  nullable?: boolean;
  $ref?: string; // Not resolved in this lightweight implementation
  default?: unknown;
}

/**
 * Convert a (subset) JSON Schema object into a Zod schema.
 * This is intentionally minimal: handles objects, arrays, enums, scalars, nullable, and basic unions.
 * Unknown/complex constructs fall back to z.any().
 */
export function jsonSchemaToZod(schema: JSONSchema | undefined): ZodTypeAny {
  if (!schema) return z.any();

  // Handle enum
  if (schema.enum && schema.enum.length) {
    const allStrings = schema.enum.every((e) => typeof e === 'string');
    if (allStrings) return z.enum([...(new Set(schema.enum) as Set<string>)] as [string, ...string[]]);
    const literals = schema.enum.map((v) => z.literal(v as never));
    return z.union(literals);
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 1) {
    return z.union(types.map((t) => jsonSchemaToZod({ ...schema, type: t })));
  }

  const t = types[0];
  let base: ZodTypeAny;
  switch (t) {
    case 'string':
      base = z.string();
      break;
    case 'number':
    case 'integer':
      base = z.number();
      break;
    case 'boolean':
      base = z.boolean();
      break;
    case 'array': {
      if (Array.isArray(schema.items)) {
        const tupleItems = schema.items.map((it) => jsonSchemaToZod(it));
        base = z.tuple(tupleItems as [ZodTypeAny, ...ZodTypeAny[]]);
      } else {
        base = z.array(jsonSchemaToZod(schema.items as JSONSchema));
      }
      break;
    }
    case 'object': {
      const shape: Record<string, ZodTypeAny> = {};
      const req = new Set(schema.required || []);
      for (const [k, v] of Object.entries(schema.properties || {})) {
        let prop = jsonSchemaToZod(v);
        if (!req.has(k)) prop = prop.optional();
        shape[k] = prop;
      }
      base = z.object(shape).strict();
      break;
    }
    default: {
      if (schema.properties) {
        const shape: Record<string, ZodTypeAny> = {};
        const req = new Set(schema.required || []);
        for (const [k, v] of Object.entries(schema.properties)) {
          let prop = jsonSchemaToZod(v);
          if (!req.has(k)) prop = prop.optional();
          shape[k] = prop;
        }
        base = z.object(shape).strict();
      } else if (schema.anyOf || schema.oneOf) {
        const alts = (schema.anyOf || schema.oneOf)!.map((s) => jsonSchemaToZod(s));
        base = alts.length === 1 ? alts[0] : z.union(alts as [ZodTypeAny, ...ZodTypeAny[]]);
      } else {
        base = z.any();
      }
    }
  }

  if (schema.allOf && schema.allOf.length) {
    const parts = schema.allOf.map((s) => jsonSchemaToZod(s));
    if (parts.length) {
      base = parts.reduce((acc, cur) => (acc === z.any() ? cur : cur === z.any() ? acc : acc.and(cur)), base);
    }
  }

  if (schema.nullable) base = base.nullable();

  return base;
}

export function inferArgsSchema(inputSchema: unknown): ZodTypeAny {
  try {
    return jsonSchemaToZod(inputSchema as JSONSchema | undefined);
  } catch {
    return z.any();
  }
}
