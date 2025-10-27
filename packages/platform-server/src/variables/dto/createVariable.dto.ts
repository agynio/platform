import { z } from 'zod';
import { variableKeySchema, variableSourceSchema } from '../variables.types';

// Discriminated union by source; allow empty strings; no required checks beyond key regex and source enum
export const CreateVariableBodySchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('graph'), key: variableKeySchema, value: z.string().optional() }),
  z.object({ source: z.literal('vault'), key: variableKeySchema, vaultRef: z.string().optional() }),
  z.object({ source: z.literal('local'), key: variableKeySchema, value: z.string().optional() }),
]);

export type CreateVariableBody = z.infer<typeof CreateVariableBodySchema>;

