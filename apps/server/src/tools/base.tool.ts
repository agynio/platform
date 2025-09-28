import { DynamicStructuredTool } from '@langchain/core/tools';
import { LangGraphRunnableConfig } from '@langchain/langgraph';

export abstract class BaseTool {
  abstract init(config?: LangGraphRunnableConfig): DynamicStructuredTool;
  async destroy(): Promise<void> {
    /* default no-op */
  }
  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    /* default no-op */
  }
}
