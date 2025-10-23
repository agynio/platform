import type { FastifyInstance } from 'fastify';
import type { LoggerService } from '../core/services/logger.service';
import type { ActiveReminder, RemindMeInspectable } from '../nodes/tools/remind_me.tool';

// Minimal interface to look up live node instances
interface HasNodeLookup { getNodeInstance(id: string): unknown }

function isRemindMeInspectable(x: unknown): x is RemindMeInspectable {
  return !!x && typeof (x as Record<string, unknown>)['getActiveReminders'] === 'function';
}

export function registerRemindersRoute(fastify: FastifyInstance, runtime: HasNodeLookup, _logger: LoggerService) {
  // List active reminders for a given nodeId (RemindMe tool)
  fastify.get('/graph/nodes/:nodeId/reminders', async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string };
    try {
      const inst = runtime.getNodeInstance(nodeId);
      if (!inst) {
        reply.code(404);
        return { error: 'node_not_found' };
      }
      if (!isRemindMeInspectable(inst)) {
        reply.code(404);
        return { error: 'not_remindme_node' };
      }
      const items: ActiveReminder[] = inst.getActiveReminders();
      // Optional response size bound via ?limit=
      const q = req.query as { limit?: string } | undefined;
      let limit: number | undefined;
      if (q?.limit) {
        const parsed = Number.parseInt(q.limit, 10);
        if (Number.isFinite(parsed)) {
          limit = Math.min(1000, Math.max(1, parsed));
        }
      }
      return { items: typeof limit === 'number' ? items.slice(0, limit) : items };
    } catch (e: unknown) {
      // Log internal error; do not leak details
      try { _logger.error?.('reminders route', e as unknown); } catch {}
      reply.code(500);
      return { error: 'server_error' };
    }
  });
}
