import { promises as fs, constants as fsConstants } from 'node:fs';
import { type Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

import express, { type Express } from 'express';
import httpProxy from 'http-proxy';

import type { RunnerConfig } from './config.js';

type ZitiIngressHandle = {
  close: () => Promise<void>;
};

type ZitiExpressListenerModule = {
  Server?: {
    prototype: {
      listen: (...args: unknown[]) => unknown;
    };
  };
  default?: ZitiExpressListenerModule;
};

let zitiExpressPatched = false;

export async function startZitiIngress(config: RunnerConfig): Promise<ZitiIngressHandle> {
  const ziti = await import('@openziti/ziti-sdk-nodejs');
  const identityPath = ensureIdentityPath(config.ziti.identityFile);
  const serviceName = ensureServiceName(config.ziti.serviceName);
  await ensureIdentityReadable(identityPath);
  console.info(`Initializing OpenZiti ingress (identity=${identityPath}, service=${serviceName})`);
  await ziti.init(identityPath);
  console.info(`OpenZiti SDK initialized for service ${serviceName}`);
  await ensureZitiExpressServerPatch();

  const app = ziti.express(express, serviceName);
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

  console.info(`Ziti ingress ready for service ${serviceName} (target=${target})`);

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
    let server: HttpServer | undefined;
    try {
      server = app.listen(() => {
        server?.off('error', handleError);
        if (!server) {
          reject(new Error('ziti express server unavailable'));
          return;
        }
        resolve(server);
      }) as HttpServer | undefined;
    } catch (error) {
      handleError(error);
      return;
    }
    if (!server) {
      handleError(new Error('ziti express listener did not return a server instance'));
      return;
    }
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

async function ensureZitiExpressServerPatch(): Promise<void> {
  if (zitiExpressPatched) {
    return;
  }
  const module = (await import('@openziti/ziti-sdk-nodejs/lib/express-listener.js')) as unknown as ZitiExpressListenerModule;
  const listener = module.Server ?? module.default?.Server;
  if (!listener) {
    throw new Error('Failed to load OpenZiti express listener');
  }
  const originalListen = listener.prototype.listen;
  if (typeof originalListen !== 'function') {
    throw new Error('OpenZiti express listener missing listen implementation');
  }
  if ((originalListen as { __agynReturnsServer?: boolean }).__agynReturnsServer) {
    zitiExpressPatched = true;
    return;
  }
  listener.prototype.listen = function patchedListen(this: unknown, ...args: unknown[]) {
    originalListen.apply(this, args as []);
    return this;
  };
  Object.defineProperty(listener.prototype.listen, '__agynReturnsServer', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  zitiExpressPatched = true;
}

async function ensureIdentityReadable(file: string): Promise<void> {
  try {
    await fs.access(file, fsConstants.R_OK);
  } catch (error) {
    throw new Error(`Ziti identity file missing or unreadable: ${file}`);
  }
}

const ensureIdentityPath = (file: string | undefined): string => {
  const trimmed = file?.trim();
  if (!trimmed) {
    throw new Error('Ziti identity file path missing (ZITI_IDENTITY_FILE)');
  }
  return trimmed;
};

const ensureServiceName = (service: string | undefined): string => {
  const trimmed = service?.trim();
  if (!trimmed) {
    throw new Error('Ziti service name missing (ZITI_SERVICE_NAME)');
  }
  return trimmed;
};
