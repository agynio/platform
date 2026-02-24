import './env';

import { ServerCredentials } from '@grpc/grpc-js';
import { ContainerService, NonceCache } from '..';
import { loadRunnerConfig } from './config';
import { createRunnerApp } from './app';
import { createRunnerGrpcServer } from './grpc/server';

async function bootstrap(): Promise<void> {
  try {
    const config = loadRunnerConfig();
    process.env.DOCKER_SOCKET = config.dockerSocket;
    const containers = new ContainerService();
    const nonceCache = new NonceCache({ ttlMs: config.signatureTtlMs });

    const app = createRunnerApp(config, { containers, nonceCache });
    await app.listen({ port: config.port, host: config.host });
    app.log.info({ port: config.port, host: config.host }, 'docker-runner HTTP server listening');

    const grpcServer = createRunnerGrpcServer({ config, containers, nonceCache });
    const grpcAddress = `${config.grpcHost}:${config.grpcPort}`;
    await new Promise<void>((resolve, reject) => {
      grpcServer.bindAsync(grpcAddress, ServerCredentials.createInsecure(), (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    grpcServer.start();
    app.log.info({ address: grpcAddress }, 'docker-runner gRPC server listening');

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals | 'unknown') => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info({ signal }, 'docker-runner shutting down');
      try {
        await app.close();
      } catch (httpErr) {
        app.log.error({ err: httpErr }, 'failed to close HTTP server');
      }
      await new Promise<void>((resolve) => {
        grpcServer.tryShutdown((err) => {
          if (err) {
            app.log.error({ err }, 'failed to shutdown gRPC server');
          }
          resolve();
        });
      });
      process.exit(0);
    };

    process.on('SIGINT', (signal) => {
      void shutdown(signal);
    });
    process.on('SIGTERM', (signal) => {
      void shutdown(signal);
    });
  } catch (error) {
    console.error('docker-runner failed to start', error);
    process.exit(1);
  }
}

void bootstrap();
