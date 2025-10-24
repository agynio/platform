// Simple runtime holder to bridge manual bootstrap and Nest controllers
// Avoids duplicating LiveGraphRuntime instantiation via DI.
import type { LiveGraphRuntime } from '../../graph/liveGraph.manager';

export class RuntimeRef {
  private static _runtime: LiveGraphRuntime | undefined;

  static set(runtime: LiveGraphRuntime) {
    RuntimeRef._runtime = runtime;
  }

  static get(): LiveGraphRuntime {
    if (!RuntimeRef._runtime) throw new Error('LiveGraphRuntime not initialized');
    return RuntimeRef._runtime;
  }
}

