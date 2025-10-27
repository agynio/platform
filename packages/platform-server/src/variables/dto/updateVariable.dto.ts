import { z } from 'zod';
import { variableKeySchema } from '../variables.types';

// Update body discriminated by new source; transitions handled in service
export const UpdateVariableBodySchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('graph'), value: z.string().optional() }),
  z.object({ source: z.literal('vault'), vaultRef: z.string().optional() }),
  z.object({ source: z.literal('local'), value: z.string().optional() }),
]);

export type UpdateVariableBody = z.infer<typeof UpdateVariableBodySchema>;

