import { z } from 'zod';

// Sources supported for variables
export const variableSourceSchema = z.enum(['vault', 'graph', 'local']);
export type VariableSource = z.infer<typeof variableSourceSchema>;

// Regex for variable keys: alphanumeric + space
export const variableKeyRegex = /^[0-9a-zA-Z\s]+$/;
export const variableKeySchema = z.string().regex(variableKeyRegex, 'Invalid key');

// Graph-stored item structure (persisted within graph meta)
export const variableGraphItemSchema = z.object({
  key: variableKeySchema,
  source: variableSourceSchema,
  value: z.string().optional(),
  vaultRef: z.string().optional(),
});
export type VariableGraphItem = z.infer<typeof variableGraphItemSchema>;

export const variablesStateSchema = z.object({ items: z.array(variableGraphItemSchema) });
export type VariablesState = z.infer<typeof variablesStateSchema>;

// API view item: merged representation
export const variableViewItemSchema = z.object({
  key: variableKeySchema,
  source: variableSourceSchema,
  value: z.string().optional(),
  vaultRef: z.string().optional(),
});
export type VariableViewItem = z.infer<typeof variableViewItemSchema>;

