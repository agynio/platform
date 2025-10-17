import type { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseTool } from './base.tool';

// Simple adapter to wrap a DynamicStructuredTool as BaseTool-compatible instance if needed by older code
export class LangChainToolAdapter extends BaseTool {
  constructor(private inner: DynamicStructuredTool, logger: any) { super(logger); }
  init(): DynamicStructuredTool { return this.inner; }
}
