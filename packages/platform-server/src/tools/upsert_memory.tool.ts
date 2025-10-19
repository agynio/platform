import { BaseStore, LangGraphRunnableConfig } from "@langchain/langgraph";
import { BaseTool } from "./base.tool";
import { LoggerService } from "../services/logger.service";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { v4 as uuidv4 } from "uuid";

const schema = z.object({
  content: z.string().describe(
    "The main content of the memory. For example:           'User expressed interest in learning about French.'",
  ),
  context: z.string().describe(
    "Additional context for the memory. For example:           'This was mentioned while discussing career options in Europe.'",
  ),
  memoryId: z.string().optional().describe("The memory ID to overwrite. Only provide if updating an existing memory."),
});

export class UpsertMemoryTool extends BaseTool {
  constructor(logger: LoggerService) { super(logger); }
  getStoreFromConfigOrThrow(config: LangGraphRunnableConfig): BaseStore {
    if (!config.store) throw new Error("Store not found in configuration");
    return config.store;
  }

  init(config?: LangGraphRunnableConfig) {
    /**
     * Upsert a memory in the database.
     * @param content The main content of the memory.
     * @param context Additional context for the memory.
     * @param memoryId Optional ID to overwrite an existing memory.
     * @returns A string confirming the memory storage.
     */

    return tool(
      async (input): Promise<string> => {
        const { content, context, memoryId } = schema.parse(input);
        if (!config || !config.store) {
          throw new Error("Config or store not provided");
        }

        const memId = memoryId || uuidv4();
        const store = this.getStoreFromConfigOrThrow(config);

        // TODO: fix USER_ID
        await store.put(["memories", "USER_ID"], memId, {
          content,
          context,
        });

        return `Stored memory ${memId}`;
      },
      {
        name: "upsertMemory",
        description:
          "Upsert a memory in the database. If a memory conflicts with an existing one,       update the existing one by passing in the memory_id instead of creating a duplicate.       If the user corrects a memory, update it. Can call multiple times in parallel       if you need to store or update multiple memories.",
        schema,
      },
    );
  }
}
