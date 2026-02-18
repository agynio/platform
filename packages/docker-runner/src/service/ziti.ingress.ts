import { type Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

import express, { type Express } from 'express';
import httpProxy from 'http-proxy';

import type { RunnerConfig } from './config';

type ZitiIngressHandle = {
  close: () => Promise<void>;
};

export async function startZitiIngress(config: RunnerConfig): Promise<ZitiIngressHandle | undefined> {
  if (!config.ziti.enabled) {
    return undefined;
  }

  const ziti = await import('@openziti/ziti-sdk-nodejs');
  await ziti.init(config.ziti.identityFile);

  const app = ziti.express(express, config.ziti.serviceName);
  const targetHost = resolveTargetHost(config.host);
  const target = `http://${targetHost}:${config.port}`;
  const proxy = httpProxy.createProxyServer({
    target,
    changeOrigin: true,
    ws: true,
  });

  app.use((req, res) => {
    proxy.web(req, res, undefined, (error) => {
      const message = error instanceof Error ? error.message : 'proxy_failed';
      res.status(502).json({ error: 'ziti_ingress_error', message });
    });
  });

  const server = await listenAsync(app);
  server.on('upgrade', (req, socket: Duplex, head) => {
    proxy.ws(req, socket, head, undefined, () => socket.destroy());
  });

  // eslint-disable-next-line no-console -- CLI startup log
  console.info(`Ziti ingress ready for service ${config.ziti.serviceName}`);

  return {
    close: async () => {
      proxy.close();
      await closeServer(server);
    },
  };
}

const listenAsync = (app: Express): Promise<HttpServer> =>
  new Promise((resolve, reject) => {
    const handleError = (error: unknown) => reject(error instanceof Error ? error : new Error('ziti ingress failed'));
    const server = app.listen(() => {
      server.off('error', handleError);
      resolve(server);
    });
    server.once('error', handleError);
  });

const closeServer = (server: HttpServer): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

const resolveTargetHost = (host: string): string => {
  const normalized = host.trim();
  if (!normalized || normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
    return '127.0.0.1';
  }
  return normalized;
};
