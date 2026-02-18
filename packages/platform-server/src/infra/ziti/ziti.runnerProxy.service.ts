import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  createServer,
  request as httpRequest,
  type Agent as HttpAgent,
  type IncomingMessage,
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

@Injectable()
export class ZitiRunnerProxyService {
  private readonly logger = new Logger(ZitiRunnerProxyService.name);
  private server?: HttpServer;
  private proxy?: HttpProxyServer;
  private started = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async start(): Promise<void> {
    if (!this.config.isZitiEnabled()) {
      return;
    }
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
    await this.waitForService(agent);

    const proxy = httpProxy.createProxyServer({
      target: `http://${this.config.getZitiServiceName()}`,
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

    this.server = createServer((req, res) => {
      if (!this.proxy) {
        res.statusCode = 502;
        res.end('Ziti proxy unavailable');
        return;
      }
      const activeProxy = this.proxy!;
      activeProxy.web(req, res, undefined, (error: Error | null) => this.handleProxyFailure(error, res));
    });

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
