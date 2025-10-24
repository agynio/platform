// Minimal stub to satisfy vi.mock in tests; real implementation was removed in refactor.
import { LoggerService } from '../core/services/logger.service';

export class CheckpointerService {
  constructor(private _logger: LoggerService) {}
  getCheckpointer() {
    // Provide a minimal interface used in tests and mocks
    return {
      async getTuple() { return undefined; },
      async *list() {},
      async put(_config: unknown, _checkpoint: unknown, _metadata: unknown) {
        return { configurable: { thread_id: 't', checkpoint_ns: '', checkpoint_id: '1' } } as any;
      },
      async putWrites() {},
      getNextVersion() { return '1'; },
    } as any;
  }
}

