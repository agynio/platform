import { Injectable, Logger } from '@nestjs/common';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
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

  constructor(private readonly config: ConfigService) {}

  async start(): Promise<void> {
    if (!this.config.isZitiEnabled()) {
      return;
    }
    if (this.started) {
      return;
    }

    const identity = this.config.getZitiPlatformIdentity();
    const ziti = (await import('@openziti/ziti-sdk-nodejs')) as ZitiSdk;
    await ziti.init(identity.file);
    const agent = ziti.httpAgent();

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
}
