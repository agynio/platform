import { DynamicStructuredTool } from '@langchain/core/tools';
import { LoggerService } from '../../services/logger.service';

// Minimal base class to unify tool shape and allow tests to extend
export abstract class BaseTool {
  protected logger: LoggerService;
  constructor(logger: LoggerService) { this.logger = logger; }
  // Optional configure hook for static config
  async configure(_cfg: Record<string, unknown>): Promise<void> { /* default no-op */ }
  // Return a DynamicStructuredTool for LangChain
  abstract init(config?: unknown): DynamicStructuredTool;
  // Optional lifecycle cleanup
  async delete(): Promise<void> { /* default no-op */ }
}
