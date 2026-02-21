import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  createServer,
  request as httpRequest,
  type Agent as HttpAgent,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import httpProxy from 'http-proxy';

import { ConfigService } from '../../core/services/config.service';

type ZitiSdk = typeof import('@openziti/ziti-sdk-nodejs');
type HttpProxyServer = ReturnType<typeof httpProxy.createProxyServer>;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'proxy-connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

@Injectable()
export class ZitiRunnerProxyService {
  private readonly logger = new Logger(ZitiRunnerProxyService.name);
  private server?: HttpServer;
  private proxy?: HttpProxyServer;
  private agent?: (HttpAgent & EventEmitter) | null;
  private serviceHost?: string;
  private started = false;
  private requestSequence = 0;
  private readonly traceEnabled = (process.env.ZITI_PROXY_TRACE ?? '').trim() === '1';

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const identity = this.config.getZitiPlatformIdentity();
    const identityFile = path.resolve(identity.file);
    await this.ensureIdentityReadable(identityFile);
    const tmpDir = path.resolve(this.config.getZitiTmpDirectory());
    await this.ensureWritableDirectory(tmpDir);
    const ziti = (await import('@openziti/ziti-sdk-nodejs')) as ZitiSdk;
    await ziti.init(identityFile);
    const agent = ziti.httpAgent() as HttpAgent & EventEmitter;
    agent.on('error', (error: Error) => {
      this.logger.error({ error: error.message }, 'Ziti HTTP agent error');
    });
    this.agent = agent;
    this.serviceHost = this.config.getZitiServiceName();
    await this.waitForService(agent);

    if (this.traceEnabled) {
      this.logger.log('Ziti runner proxy request tracing enabled');
    }

    const proxy = httpProxy.createProxyServer({
      target: `http://${this.serviceHost}`,
      agent,
      changeOrigin: true,
      ws: true,
    });
    this.proxy = proxy;

    proxy.on('error', (error: Error, req?: IncomingMessage) => {
      const context = { error: error.message, url: req?.url };
      this.logger.error(context, 'Ziti proxy error');
    });

    const host = this.config.getZitiRunnerProxyHost();
    const port = this.config.getZitiRunnerProxyPort();

    this.server = createServer((req, res) => this.handleHttpRequest(req, res));

    this.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!this.proxy) {
        socket.destroy();
        return;
      }
      const activeProxy = this.proxy!;
      activeProxy.ws(req, socket, head, undefined, (error: Error | null) => {
        if (error) {
          this.logger.error({ error: error.message, url: req.url }, 'Ziti proxy websocket failure');
        }
        socket.destroy();
      });
    });

    this.logger.log(`Starting Ziti runner proxy on http://${host}:${port}`);
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Ziti proxy server missing'));
        return;
      }
      this.server.once('error', reject);
      this.server.listen({ host, port }, () => {
        this.server?.off('error', reject);
        resolve();
      });
    });

    this.started = true;
    this.logger.log(`Ziti runner proxy listening on http://${host}:${port}`);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await Promise.all([
      this.closeServer(),
      this.closeProxy(),
    ]);
    this.agent = null;
    this.serviceHost = undefined;
    this.started = false;
  }

  private async closeServer(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = undefined;
  }

  private async closeProxy(): Promise<void> {
    if (!this.proxy) return;
    const proxy = this.proxy!;
    proxy.close();
    this.proxy = undefined;
  }

  private handleProxyFailure(error: Error | null | undefined, res: ServerResponse): void {
    if (res.headersSent) {
      res.end();
      return;
    }
    this.logger.error({ error: error?.message }, 'Ziti proxy HTTP failure');
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'ziti_proxy_error' }));
  }

  private async ensureIdentityReadable(file: string): Promise<void> {
    try {
      await fs.access(file, fsConstants.R_OK);
    } catch (error) {
      this.logger.error({ file, error: (error as Error).message }, 'Ziti identity file missing or unreadable');
      throw new Error(`Ziti identity file missing or unreadable: ${file}`);
    }
  }

  private async ensureWritableDirectory(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fsConstants.W_OK);
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!this.agent || !this.serviceHost) {
      this.handleProxyFailure(new Error('Ziti HTTP agent unavailable'), res);
      return;
    }
    const requestId = this.nextRequestId();
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    req.setTimeout(0);
    res.setTimeout(0);
    this.logTrace('proxy request', { id: requestId, method, url });

    const headers = this.buildUpstreamRequestHeaders(req.headers);
    this.logTrace('proxy forward', {
      id: requestId,
      method,
      url,
      'content-length': req.headers['content-length'] ?? 'n/a',
      'upstream-content-length': headers['content-length'] ?? 'n/a',
    });
    const upstreamReq = httpRequest(
      {
        host: this.serviceHost,
        agent: this.agent,
        method,
        path: url,
        headers,
      },
      (upstreamRes) => {
        this.logTrace('proxy response', {
          id: requestId,
          method,
          url,
          status: upstreamRes.statusCode ?? 0,
        });
        const responseHeaders = this.buildDownstreamHeaders(upstreamRes.headers);
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
        upstreamRes.once('close', () => {
          this.logTrace('proxy upstream closed', { id: requestId, method, url });
        });
      },
    );

    upstreamReq.on('error', (error) => {
      this.logTrace('proxy error', { id: requestId, method, url, error: error.message });
      this.handleProxyFailure(error, res);
    });

    req.pipe(upstreamReq);
    res.once('close', () => {
      upstreamReq.destroy(new Error('downstream_closed'));
    });
    req.once('aborted', () => {
      upstreamReq.destroy(new Error('downstream_aborted'));
    });
  }

  private buildUpstreamRequestHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
    const normalized: OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key) continue;
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        continue;
      }
      normalized[key] = value as string | string[];
    }
    normalized.connection = 'close';
    if (this.serviceHost) {
      normalized.host = this.serviceHost;
    }
    return normalized;
  }

  private buildDownstreamHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
    const normalized: OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key) continue;
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        continue;
      }
      normalized[key] = value as string | string[];
    }
    return normalized;
  }

  private nextRequestId(): number {
    this.requestSequence += 1;
    return this.requestSequence;
  }

  private logTrace(message: string, metadata: Record<string, unknown>): void {
    if (!this.traceEnabled) {
      return;
    }
    this.logger.log(metadata, message);
  }

  private async waitForService(agent: HttpAgent): Promise<void> {
    const serviceHost = this.config.getZitiServiceName();
    const maxAttempts = 10;
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await new Promise<void>((resolve, reject) => {
          const handleError = (error: Error) => {
            reject(error);
          };
          const req = httpRequest(
            {
              host: serviceHost,
              agent,
              method: 'HEAD',
              timeout: 5000,
            },
            (res) => {
              res.resume();
              res.once('end', resolve);
              res.once('error', handleError);
            },
          );
          req.on('error', handleError);
          req.on('timeout', () => {
            req.destroy(new Error('timeout'));
          });
          req.on('socket', (socket) => {
            socket.on('error', handleError);
          });
          req.end();
        });
        this.logger.log(`Ziti service reachable (${serviceHost})`);
        return;
      } catch (error) {
        this.logger.warn(
          { attempt, error: (error as Error).message },
          'Ziti service not reachable yet; retrying',
        );
        await delay(delayMs);
      }
    }
    throw new Error(`Ziti service ${serviceHost} did not become reachable`);
  }
}
