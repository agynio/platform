import type { FastifyInstance } from 'fastify';
import { LoggerService } from '../core/services/logger.service';

// Minimal runtime interface used by tests
type Runtime = { getNodeInstance(id: string): unknown };

export function registerRemindersRoute(app: FastifyInstance, runtime: Runtime, logger: LoggerService) {
  app.get('/graph/nodes/:nodeId/reminders', async (req, reply) => {
    try {
      const nodeId = (req.params as { nodeId: string }).nodeId;
      const inst = runtime.getNodeInstance(nodeId) as Record<string, unknown> | undefined;
      const getActive = inst && typeof inst === 'object' ? (inst as any).getActiveReminders : undefined;
      if (typeof getActive !== 'function') {
        // Not found or not a RemindMe tool
        return reply.status(404).send({ error: 'not_remindme_node' });
      }
      const items = (await getActive()) || [];
      // Normalize shape used in tests: { items: Array<{ note, threadId, at }> }
      return reply.send({ items });
    } catch (e) {
      logger.error('reminders route error', e);
      return reply.status(500).send({ error: 'internal_error' });
    }
  });
}

