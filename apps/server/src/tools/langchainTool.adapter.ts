import { DynamicStructuredTool } from '@langchain/core/tools';
import { LangGraphRunnableConfig } from '@langchain/langgraph';

import { BaseTool } from './base.tool';

/**
 * Adapter to wrap an existing LangChain DynamicStructuredTool so it conforms to our BaseTool abstraction.
 */
export class LangChainToolAdapter extends BaseTool {
  constructor(private inner: DynamicStructuredTool) { super(); }

  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    // We could clone or wrap for per-run config if needed later.
    return this.inner;
  }
}
