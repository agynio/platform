import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { makeBashCommandTool } from "./tools/bash_command";
import { makeFsReadFileTool } from "./tools/fs_read_file";
import { makeFsWriteFileTool } from "./tools/fs_write_file";
import { makeFsEditFileTool } from "./tools/fs_edit_file";
import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";
// Tools are created via factory functions with injected singleton logger

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
            makeBashCommandTool(this.logger),
            makeFsReadFileTool(this.logger),
            makeFsWriteFileTool(this.logger),
            makeFsEditFileTool(this.logger),
        ];
        return createReactAgent({
            llm: model,
            tools,
        });
    }
}