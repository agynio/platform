// Lightweight provider for NodeStateService to enable deterministic injection via templates
// without relying on LiveGraphRuntime.setFactoryDeps.
import type { NodeStateService } from './nodeState.service';

let _nodeStateService: NodeStateService | undefined;

export function setNodeStateService(svc: NodeStateService | undefined) {
  _nodeStateService = svc;
}

export function getNodeStateService(): NodeStateService | undefined {
  return _nodeStateService;
}

