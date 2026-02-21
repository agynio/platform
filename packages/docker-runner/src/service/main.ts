import './env.js';

import type { FastifyInstance } from 'fastify';

import { loadRunnerConfig } from './config.js';
import { createRunnerApp } from './app.js';
import { startZitiIngress } from './ziti.ingress.js';

async function bootstrap(): Promise<void> {
  let app: FastifyInstance | undefined;
  let closeZiti: (() => Promise<void>) | undefined;

  try {
    const config = loadRunnerConfig();
    app = createRunnerApp(config);
    await app.listen({ port: config.port, host: config.host });
    const ingress = await startZitiIngress(config);
    closeZiti = ingress.close;

    const shutdown = async () => {
      await closeZiti?.();
      if (app) {
        await app.close();
      }
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error('docker-runner failed to start', error);
    await closeZiti?.();
    if (app) {
      await app.close();
    }
    process.exit(1);
  }
}

void bootstrap();
