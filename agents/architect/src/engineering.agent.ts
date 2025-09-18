import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";
// Tools are created via factory functions with injected singleton logger

export class EngineeringAgent {
  private configService: ConfigService;
  private logger: LoggerService;

  constructor(configService: ConfigService) {
    this.configService = configService;
    this.logger = new LoggerService();
  }

  createAgent() {
    const model = new ChatOpenAI({
      model: "gpt-5",
      apiKey: this.configService.openaiApiKey,
    });
    // Define tools as objects compatible with createReactAgent
    return createReactAgent({
      llm: model,
      tools: [],
    });
  }
}
