import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { makeRemoteBashCommandTool } from "./tools/remote_bash_command";
import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";
import { CodespaceSSHService } from "./codespace-ssh.service";
// Tools are created via factory functions with injected singleton logger

export class ConflictAgentService {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  createAgent() {
    const model = new ChatOpenAI({
      model: "gpt-5",
      apiKey: this.configService.openaiApiKey,
    });
    // Define tools as objects compatible with createReactAgent
    const tools = [
      makeRemoteBashCommandTool(
        this.logger,
        new CodespaceSSHService(this.configService, this.logger).connect("fantastic-robot-7749rxj6j63w656"),
      ),
    ];
    return createReactAgent({
      llm: model,
      tools,
    });
  }
}
