import { readFileSync } from "fs";
import { z } from "zod";
import { LoggerService } from "../logger.service";
import { tool } from "@langchain/core/tools";

export function makeFsReadFileTool(logger: LoggerService) {
  return tool(
    async ({ path }: { path: string }) => {
      logger.info("Tool called", "fs_read_file", { path });
      try {
        const result = readFileSync(path, "utf-8");
        logger.info("fs_read_file result", result);
        return result;
      } catch (err) {
        logger.error("fs_read_file error", err);
        throw err;
      }
    },
    {
      name: "fs_read_file",
      description: "Read the contents of a file.",
      schema: z.object({
        path: z.string().describe("Path to the file to read."),
      }),
    },
  );
}
