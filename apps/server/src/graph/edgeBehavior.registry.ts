import { EdgeBehaviorRegistry } from './liveGraph.types';

// Default behaviors. Keys should correspond to the callable side: `${template}.${handle}`.
// Extend as needed by registration in runtime options.
export const defaultEdgeBehaviors: EdgeBehaviorRegistry = {
  // Example assumptions for existing system (adjust if actual templates differ):
  'SlackTrigger.subscribe': { reversible: true, reverseHandle: 'unsubscribe', skipIfExecuted: true },
  'SimpleAgent.addTool': { idempotent: true, skipIfExecuted: true },
};
