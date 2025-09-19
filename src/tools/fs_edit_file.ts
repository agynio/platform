import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import { LoggerService } from "../services/logger.service";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { BaseTool } from "./base.tool";

const fsEditFileSchema = z.object({
  path: z.string().describe("Path to the file to edit."),
  old_content: z.string().describe("Content to replace."),
  new_content: z.string().describe("New content to insert."),
});

export class FsEditFileTool extends BaseTool {
  constructor(private logger: LoggerService) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input) => {
        const { path, old_content, new_content } = fsEditFileSchema.parse(input);
        this.logger.info("Tool called", "fs_edit_file", { path, old_content, new_content });
        try {
          const file = readFileSync(path, "utf-8");
          const updated = file.replace(old_content, new_content);
          writeFileSync(path, updated, "utf-8");
          return `Edited file: ${path}`;
        } catch (error) {
          this.logger.error("fs_edit_file error", (error as Error).message);
          return `Error editing file: ${(error as Error).message}`;
        }
      },
      {
        name: "fs_edit_file",
        description: "Edit a file by replacing old content with new content.",
        schema: fsEditFileSchema,
      },
    );
  }
}
