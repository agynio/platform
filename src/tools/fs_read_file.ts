import { readFileSync } from "fs";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";

const fsReadFileSchema = z.object({
  path: z.string().describe("Path to the file to read."),
});

export class FsReadFileTool extends BaseTool {
  constructor(private logger: LoggerService) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { path } = fsReadFileSchema.parse(input);
        this.logger.info("Tool called", "fs_read_file", { path });
        try {
          const result = readFileSync(path, "utf-8");
          this.logger.info("fs_read_file result", result);
          return result;
        } catch (err) {
          this.logger.error("fs_read_file error", err);
          return `Error reading file: ${(err as Error).message}`;
        }
      },
      {
        name: "fs_read_file",
        description: "Read the contents of a file.",
        schema: fsReadFileSchema,
      },
    );
  }
}
