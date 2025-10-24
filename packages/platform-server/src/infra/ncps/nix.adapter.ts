import type { FastifyInstance } from 'fastify';
import type { NixController } from './nix.controller';

// Bind Fastify GET handlers to controller endpoints while preserving paths
export function registerNixRoutesFromController(fastify: FastifyInstance, controller: NixController) {
  fastify.get('/api/nix/packages', async (req, reply) => {
    const query = (req.query || {}) as Record<string, unknown>;
    return controller.packages(query, reply);
  });

  fastify.get('/api/nix/versions', async (req, reply) => {
    const query = (req.query || {}) as Record<string, unknown>;
    return controller.versions(query, reply);
  });

  fastify.get('/api/nix/resolve', async (req, reply) => {
    const query = (req.query || {}) as Record<string, unknown>;
    return controller.resolve(query, reply);
  });
}

