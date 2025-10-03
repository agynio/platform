import { DynamicStructuredTool } from "@langchain/core/tools";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { LoggerService } from "../services/logger.service";

export abstract class BaseTool {
  // Require explicit logger injection for tools
  constructor(protected readonly logger: LoggerService) {}
  // Tools must call super(logger) in subclass constructors to standardize logger injection.
  abstract init(config?: LangGraphRunnableConfig): DynamicStructuredTool;
  async destroy(): Promise<void> { /* default no-op */ }
}
