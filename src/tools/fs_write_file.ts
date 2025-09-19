import { writeFileSync } from "fs";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";

const fsWriteFileSchema = z.object({
  path: z.string().describe("Path to the file to write."),
  content: z.string().describe("Content to write to the file."),
});

export class FsWriteFileTool extends BaseTool {
  constructor(private logger: LoggerService) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { path, content } = fsWriteFileSchema.parse(input);
        this.logger.info("Tool called", "fs_write_file", { path, content });
        try {
          writeFileSync(path, content, "utf-8");
          return `Wrote to file: ${path}`;
        } catch (error) {
          this.logger.error("fs_write_file error", (error as Error).message);
          return `Error writing file: ${(error as Error).message}`;
        }
      },
      {
        name: "fs_write_file",
        description: "Write content to a file.",
        schema: fsWriteFileSchema,
      },
    );
  }
}
