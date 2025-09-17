import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { exec } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";
import { z } from "zod";

// Tool functions are now defined as arrow functions inside the tools array below


export class AgentService {
    private configService: ConfigService;
    private logger: LoggerService;

    constructor(configService: ConfigService) {
        this.configService = configService;
        this.logger = new LoggerService();
    }

    createAgent() {
        const model = new ChatOpenAI({
            model: "gpt-4.1",
            apiKey: this.configService.getOpenAIKey(),
        });
        // Define tools as objects compatible with createReactAgent
        const tools = [
            {
                name: "bash_command",
                description: "Execute a bash command and return the output.",
                schema: z.object({
                    command: z.string().describe("The bash command to execute."),
                }),
                execute: async ({ command }: { command: string }) => {
                    this.logger.info("Tool called", "bash_command", { command });
                    return new Promise<string>((resolve, reject) => {
                        exec(command, (error, stdout, stderr) => {
                            if (error) {
                                this.logger.error("bash_command error", stderr || error.message);
                                return reject(stderr || error.message);
                            }
                            this.logger.info("bash_command result", stdout);
                            resolve(stdout);
                        });
                    });
                },
            },
            {
                name: "fs_read_file",
                description: "Read the contents of a file.",
                schema: z.object({
                    path: z.string().describe("Path to the file to read."),
                }),
                execute: ({ path }: { path: string }) => {
                    this.logger.info("Tool called", "fs_read_file", { path });
                    try {
                        const result = readFileSync(path, "utf-8");
                        this.logger.info("fs_read_file result", result);
                        return result;
                    } catch (err) {
                        this.logger.error("fs_read_file error", err);
                        throw err;
                    }
                },
            },
            {
                name: "fs_write_file",
                description: "Write content to a file.",
                schema: z.object({
                    path: z.string().describe("Path to the file to write."),
                    content: z.string().describe("Content to write to the file."),
                }),
                execute: ({ path, content }: { path: string; content: string }) => {
                    this.logger.info("Tool called", "fs_write_file", { path, content });
                    writeFileSync(path, content, "utf-8");
                },
            },
            {
                name: "fs_edit_file",
                description: "Edit a file by replacing old content with new content.",
                schema: z.object({
                    path: z.string().describe("Path to the file to edit."),
                    old_content: z.string().describe("Content to replace."),
                    new_content: z.string().describe("New content to insert."),
                }),
                execute: ({ path, old_content, new_content }: { path: string; old_content: string; new_content: string }) => {
                    this.logger.info("Tool called", "fs_edit_file", { path, old_content, new_content });
                    const file = readFileSync(path, "utf-8");
                    const updated = file.replace(old_content, new_content);
                    writeFileSync(path, updated, "utf-8");
                },
            },
        ];
        return createReactAgent({
            llm: model,
            tools,
        });
    }
}