import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { LoggerService } from './logger.service';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type DebugHttpHandler = (req: FastifyRequest, rep: FastifyReply) => Promise<any> | any;

type Registry = Map<HttpMethod, Map<string, DebugHttpHandler>>; // method -> (path -> handler)

/**
 * Singleton HTTP service to host DebugTool routes on a shared Fastify server.
 * Lazily starts the server on first register and dispatches requests to per-path handlers.
 */
class DebugHttpServiceImpl {
  private fastify: FastifyInstance | null = null;
  private registry: Registry = new Map();
  private logger: LoggerService | null = null;
  private baseUrl: string | null = null;

  /** Provide logger on first use; subsequent calls ignore param. */
  init(logger: LoggerService) {
    if (!this.logger) this.logger = logger;
  }

  /** Register a route handler; throws if method+path already registered. Returns an unregister function. */
  async register(opts: { method: HttpMethod; path: string; handler: DebugHttpHandler }): Promise<() => void> {
    if (!this.logger) throw new Error('DebugHttpService not initialized: call init(logger)');
    await this.ensureServer();
    const method = opts.method.toUpperCase() as HttpMethod;
    const path = this.normalizePath(opts.path);
    const m = this.getOrCreateMethodMap(method);
    if (m.has(path)) {
      throw new Error(`Route already registered for ${method} ${path}`);
    }
    m.set(path, opts.handler);
    this.logger.info(`[DebugHttp] route registered ${method} ${path}`);
    return () => {
      const mm = this.registry.get(method);
      if (mm && mm.has(path)) {
        mm.delete(path);
        this.logger?.info(`[DebugHttp] route unregistered ${method} ${path}`);
      }
    };
  }

  /** Unregister a route by method+path; no-op if missing. */
  unregister(path: string, method: HttpMethod): void {
    const m = this.registry.get(method.toUpperCase() as HttpMethod);
    const norm = this.normalizePath(path);
    if (m && m.has(norm)) {
      m.delete(norm);
      this.logger?.info(`[DebugHttp] route unregistered ${method.toUpperCase()} ${norm}`);
    }
  }

  /** For tests/diagnostics only: return base URL once server is listening. */
  getBaseUrl(): string {
    if (!this.baseUrl) throw new Error('DebugHttp server not started');
    return this.baseUrl;
  }

  /** Gracefully shut down and clear registry (primarily for tests). */
  async shutdown(): Promise<void> {
    if (this.fastify) {
      try { await this.fastify.close(); } catch {}
      this.fastify = null;
    }
    this.registry.clear();
    this.baseUrl = null;
  }

  private getOrCreateMethodMap(method: HttpMethod): Map<string, DebugHttpHandler> {
    let m = this.registry.get(method);
    if (!m) {
      m = new Map<string, DebugHttpHandler>();
      this.registry.set(method, m);
    }
    return m;
  }

  private async ensureServer(): Promise<void> {
    if (this.fastify) return;
    if (!this.logger) throw new Error('DebugHttpService requires logger');
    const srv = Fastify({ logger: false });
    await srv.register(cors, { origin: true });

    // Single wildcard dispatcher; exact-path lookup per method
    srv.all('/*', async (request, reply) => {
      const method = request.method.toUpperCase() as HttpMethod;
      const url = request.url || '/';
      const path = this.normalizePath(url.split('?')[0] || '/');
      const map = this.registry.get(method);
      const handler = map?.get(path);
      if (!handler) {
        reply.code(404);
        return { error: 'not_found' };
      }
      try {
        return await handler(request, reply);
      } catch (err: any) {
        this.logger?.error('[DebugHttp] handler error', err?.message || String(err));
        reply.code(500);
        return { error: 'internal_error', message: err?.message || String(err) };
      }
    });

    // Start listening on configured port (0 -> ephemeral)
    const portRaw = process.env.DEBUG_HTTP_PORT;
    const port = portRaw ? Number(portRaw) : 0;
    await srv.listen({ port, host: '127.0.0.1' });
    const addr = srv.server.address();
    let bound = 'http://127.0.0.1';
    if (typeof addr === 'object' && addr && 'port' in addr) {
      bound = `http://127.0.0.1:${(addr as any).port}`;
    }
    this.baseUrl = bound;
    this.logger.info(`[DebugHttp] listening on ${bound}`);
    this.fastify = srv;
  }

  private normalizePath(p: string): string {
    if (!p.startsWith('/')) return '/' + p;
    return p;
  }
}

// Module-level singleton access
let _singleton: DebugHttpServiceImpl | null = null;
export function DebugHttpService(logger?: LoggerService): DebugHttpServiceImpl {
  if (!_singleton) _singleton = new DebugHttpServiceImpl();
  if (logger) _singleton.init(logger);
  return _singleton;
}
