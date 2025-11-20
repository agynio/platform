import { z } from 'zod';

export const SecretReferenceSchema = z
  .object({
    kind: z.literal('vault'),
    path: z.string().min(1, 'path is required'),
    key: z.string().min(1, 'key is required'),
    mount: z.string().min(1).optional(),
  })
  .strict();

export const VariableReferenceSchema = z
  .object({
    kind: z.literal('var'),
    name: z.string().min(1, 'name is required'),
    default: z.string().optional(),
  })
  .strict();

export const ReferenceValueSchema = z.union([z.string(), SecretReferenceSchema, VariableReferenceSchema]);

export type SecretReferenceInput = z.infer<typeof SecretReferenceSchema>;
export type VariableReferenceInput = z.infer<typeof VariableReferenceSchema>;
export type ReferenceValueInput = z.infer<typeof ReferenceValueSchema>;
