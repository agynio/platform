import { z } from 'zod';

export const THREAD_CONFIG_SNAPSHOT_VERSION = 1 as const;

export type ThreadConfigSnapshotTool = {
  name: string;
  namespace?: string | null;
  kind: 'native' | 'mcp';
};

export type ThreadConfigSnapshot = {
  version: typeof THREAD_CONFIG_SNAPSHOT_VERSION;
  agentNodeId: string;
  graph: {
    name: string;
    version: number;
    updatedAt: string;
  };
  llm: {
    provider: 'openai' | 'litellm';
    model: string;
  };
  prompts: {
    system: string;
    summarization: string;
  };
  summarization: {
    keepTokens: number;
    maxTokens: number;
  };
  behavior: {
    debounceMs: number;
    whenBusy: 'wait' | 'injectAfterTools';
    processBuffer: 'allTogether' | 'oneByOne';
    restrictOutput: boolean;
    restrictionMessage: string;
    restrictionMaxInjections: number;
  };
  tools: {
    allowed: ThreadConfigSnapshotTool[];
  };
  memory: {
    placement: 'after_system' | 'last_message' | 'none';
  };
};

const ToolSchema = z
  .object({
    name: z.string().min(1),
    namespace: z.string().min(1).optional().nullable(),
    kind: z.enum(['native', 'mcp']),
  })
  .strict();

const ThreadConfigSnapshotSchema = z
  .object({
    version: z.literal(THREAD_CONFIG_SNAPSHOT_VERSION),
    agentNodeId: z.string().min(1),
    graph: z
      .object({
        name: z.string().min(1),
        version: z.number().int().nonnegative(),
        updatedAt: z.string().min(1),
      })
      .strict(),
    llm: z
      .object({
        provider: z.enum(['openai', 'litellm']),
        model: z.string().min(1),
      })
      .strict(),
    prompts: z
      .object({
        system: z.string(),
        summarization: z.string(),
      })
      .strict(),
    summarization: z
      .object({
        keepTokens: z.number().int().min(0),
        maxTokens: z.number().int().min(1),
      })
      .strict(),
    behavior: z
      .object({
        debounceMs: z.number().int().min(0),
        whenBusy: z.enum(['wait', 'injectAfterTools']),
        processBuffer: z.enum(['allTogether', 'oneByOne']),
        restrictOutput: z.boolean(),
        restrictionMessage: z.string(),
        restrictionMaxInjections: z.number().int().min(0),
      })
      .strict(),
    tools: z
      .object({
        allowed: z.array(ToolSchema),
      })
      .strict(),
    memory: z
      .object({
        placement: z.enum(['after_system', 'last_message', 'none']),
      })
      .strict(),
  })
  .strict();

export const parseThreadConfigSnapshot = (input: unknown): ThreadConfigSnapshot | null => {
  const parsed = ThreadConfigSnapshotSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

export type ThreadConfigSnapshotRecord = {
  agentNodeId: string | null;
  snapshot: ThreadConfigSnapshot | null;
  snapshotAt: Date | null;
};
