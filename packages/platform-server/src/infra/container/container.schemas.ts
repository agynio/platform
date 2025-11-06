import { z } from 'zod';
import { NODE_ID_LABEL, PLATFORM_LABEL, PARENT_CID_LABEL, ROLE_LABEL, THREAD_ID_LABEL } from '../../constants';

// Zod schema for normalized container metadata stored in DB
export const ContainerMetadataSchema = z.object({
  labels: z.record(z.string(), z.string()).default({}),
  platform: z.string().optional(),
  // No TTL in metadata; TTL is a typed column
  lastError: z.string().optional(),
  retryAfter: z.string().optional(),
  terminationAttempts: z.number().int().nonnegative().optional(),
  claimId: z.string().optional(),
});
export type ContainerMetadata = z.infer<typeof ContainerMetadataSchema>;

// Zod schema to parse labels from Docker inspect output
export const InspectLabelsSchema = z
  .object({
    [ROLE_LABEL]: z.enum(['workspace', 'dind']).optional(),
    [PARENT_CID_LABEL]: z.string().optional(),
    [THREAD_ID_LABEL]: z.string().optional(),
    [NODE_ID_LABEL]: z.string().optional(),
    [PLATFORM_LABEL]: z.string().optional(),
  })
  .passthrough();
