import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LiveGraphRuntime } from '../graph/liveGraph.manager.js';
import { LoggerService } from '../services/logger.service';
import { AgentRunService } from '../services/run.service';

export function registerRunsRoutes(
  fastify: FastifyInstance,
  runtime: LiveGraphRuntime,
  runs: AgentRunService,
  logger: LoggerService,
) {
  type TerminableAgent = {
    terminateRun: (threadId: string, runId?: string) => 'ok' | 'not_running' | 'not_found';
    getCurrentRunId?: (threadId: string) => string | undefined;
  };
  type ListParams = { nodeId: string };
  type ListQuery = { status?: 'running' | 'terminating' | 'all' };
  type ListReply = { items: Array<{ nodeId: string; threadId: string; runId: string; status: string; startedAt: string; updatedAt: string; expiresAt?: string }> } | { error: string };
  fastify.get<{ Params: ListParams; Querystring: ListQuery; Reply: ListReply }>(
    '/graph/nodes/:nodeId/runs',
    {
      schema: {
        params: { type: 'object', required: ['nodeId'], properties: { nodeId: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: { status: { type: 'string', enum: ['running', 'terminating', 'all'] } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['nodeId', 'threadId', 'runId', 'status', 'startedAt', 'updatedAt'],
                  properties: {
                    nodeId: { type: 'string' },
                    threadId: { type: 'string' },
                    runId: { type: 'string' },
                    status: { type: 'string' },
                    startedAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                    expiresAt: { type: 'string' },
                  },
                },
              },
            },
          },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: ListParams; Querystring: ListQuery }>, reply: FastifyReply): Promise<void | ListReply> => {
      const { nodeId } = req.params;
      const status = req.query?.status ?? 'all';
      try {
        const items = await runs.list(nodeId, status);
        reply.code(200);
        return { items: items.map(({ _id, ...rest }) => ({ ...rest, startedAt: rest.startedAt.toISOString(), updatedAt: rest.updatedAt.toISOString(), ...(rest.expiresAt ? { expiresAt: rest.expiresAt.toISOString() } : {}) })) } as ListReply;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'list_failed';
        reply.code(500);
        return { error: msg } as ListReply;
      }
    },
  );

  // Terminate by runId
  type TerminateParams = { nodeId: string; runId: string };
  type TerminateReply = { status: 'terminating' } | { error: string };
  fastify.post<{ Params: TerminateParams; Reply: TerminateReply }>(
    '/graph/nodes/:nodeId/runs/:runId/terminate',
    {
      schema: {
        params: { type: 'object', required: ['nodeId', 'runId'], properties: { nodeId: { type: 'string' }, runId: { type: 'string' } } },
        response: {
          202: { type: 'object', properties: { status: { type: 'string', enum: ['terminating'] } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          409: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: TerminateParams }>, reply: FastifyReply) => {
      const { nodeId, runId } = req.params;
      try {
        const inst = runtime.getNodeInstance<TerminableAgent>(nodeId);
        if (!inst) { reply.code(404); return { error: 'node_not_found' } as const; }
        if (typeof inst.terminateRun !== 'function') { reply.code(404); return { error: 'not_terminable' } as const; }
        // Use persisted threadId from AgentRunService if available
        const doc = await runs.findByRunId(nodeId, runId);
        const threadId = doc?.threadId;
        if (!threadId) {
          reply.code(404);
          return { error: 'run_not_found' } as const;
        }
        const res = inst.terminateRun(threadId, runId) as 'ok' | 'not_running' | 'not_found';
        if (res === 'ok') {
          await runs.markTerminating(nodeId, runId).catch(() => {});
          reply.code(202);
          return { status: 'terminating' } as const;
        }
        if (res === 'not_found') { reply.code(404); return { error: 'run_not_found' } as const; }
        reply.code(409); // not_running
        return { error: 'not_running' } as const;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'terminate_failed';
        reply.code(500);
        return { error: msg } as const;
      }
    },
  );

  // Terminate by threadId (current run)
  type TerminateThreadParams = { nodeId: string; threadId: string };
  type TerminateThreadReply = { status: 'terminating' } | { error: string };
  fastify.post<{ Params: TerminateThreadParams; Reply: TerminateThreadReply }>(
    '/graph/nodes/:nodeId/threads/:threadId/terminate',
    {
      schema: {
        params: { type: 'object', required: ['nodeId', 'threadId'], properties: { nodeId: { type: 'string' }, threadId: { type: 'string' } } },
        response: {
          202: { type: 'object', properties: { status: { type: 'string', enum: ['terminating'] } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          409: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: TerminateThreadParams }>, reply: FastifyReply) => {
      const { nodeId, threadId } = req.params;
      try {
        const inst = runtime.getNodeInstance<TerminableAgent>(nodeId);
        if (!inst) { reply.code(404); return { error: 'node_not_found' } as const; }
        if (typeof inst.terminateRun !== 'function' || typeof inst.getCurrentRunId !== 'function') { reply.code(404); return { error: 'not_terminable' } as const; }
        const runId = inst.getCurrentRunId(threadId) as string | undefined;
        if (!runId) { reply.code(409); return { error: 'not_running' } as const; }
        const res = inst.terminateRun(threadId, runId) as 'ok' | 'not_running' | 'not_found';
        if (res === 'ok') {
          await runs.markTerminating(nodeId, runId).catch(() => {});
          reply.code(202);
          return { status: 'terminating' } as const;
        }
        if (res === 'not_found') { reply.code(404); return { error: 'run_not_found' } as const; }
        reply.code(409);
        return { error: 'not_running' } as const;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'terminate_failed';
        reply.code(500);
        return { error: msg } as const;
      }
    },
  );
}
