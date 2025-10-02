import { z } from 'zod';
import { tool as lcTool } from '@langchain/core/tools';
import { MemoryService } from '../services/memory.service';

export const MemoryToolsSchema = {
  memory_read: z.object({ path: z.string() }),
  memory_list: z.object({ path: z.string().optional() }),
  memory_append: z.object({ path: z.string(), data: z.string() }),
  memory_update: z.object({ path: z.string(), old_data: z.string(), new_data: z.string() }),
  memory_delete: z.object({ path: z.string() }),
};

export type MemoryTools = typeof MemoryToolsSchema;

export function buildMemoryTools(serviceFactory: (opts: { threadId?: string }) => MemoryService) {
  const read = lcTool(
    async (args, config) => {
      const service = serviceFactory({ threadId: config?.configurable?.thread_id });
      return await service.read(args.path as string);
    },
    { name: 'memory_read', description: 'Read memory file content', schema: MemoryToolsSchema.memory_read },
  );

  const list = lcTool(
    async (args, config) => {
      const service = serviceFactory({ threadId: config?.configurable?.thread_id });
      const items = await service.list((args as any).path || '/');
      return JSON.stringify(items);
    },
    { name: 'memory_list', description: 'List memory directory', schema: MemoryToolsSchema.memory_list },
  );

  const append = lcTool(
    async (args, config) => {
      const service = serviceFactory({ threadId: config?.configurable?.thread_id });
      await service.append(args.path as string, (args as any).data);
      return 'ok';
    },
    { name: 'memory_append', description: 'Append string to memory file', schema: MemoryToolsSchema.memory_append },
  );

  const update = lcTool(
    async (args, config) => {
      const service = serviceFactory({ threadId: config?.configurable?.thread_id });
      const count = await service.update(args.path as string, (args as any).old_data, (args as any).new_data);
      return String(count);
    },
    { name: 'memory_update', description: 'Replace occurrences in memory file', schema: MemoryToolsSchema.memory_update },
  );

  const del = lcTool(
    async (args, config) => {
      const service = serviceFactory({ threadId: config?.configurable?.thread_id });
      const res = await service.delete(args.path as string);
      return JSON.stringify(res);
    },
    { name: 'memory_delete', description: 'Delete memory path (file or dir subtree)', schema: MemoryToolsSchema.memory_delete },
  );

  return { read, list, append, update, delete: del };
}
