import './env';

import { ServerCredentials } from '@grpc/grpc-js';
import { ContainerService, NonceCache } from '..';
import { loadRunnerConfig } from './config';
import { createRunnerGrpcServer } from './grpc/server';

async function bootstrap(): Promise<void> {
  try {
    const config = loadRunnerConfig();
    process.env.DOCKER_SOCKET = config.dockerSocket;
    if (!process.env.LOG_LEVEL && config.logLevel) {
      process.env.LOG_LEVEL = config.logLevel;
    }

    const containers = new ContainerService();
    const nonceCache = new NonceCache({ ttlMs: config.signatureTtlMs });
    const grpcServer = createRunnerGrpcServer({ config, containers, nonceCache });
    const grpcAddress = `${config.grpcHost}:${config.grpcPort}`;
    await new Promise<void>((resolve, reject) => {
      grpcServer.bindAsync(grpcAddress, ServerCredentials.createInsecure(), (err) => {
        if (err) return reject(err);
        grpcServer.start();
        resolve();
      });
    });
    console.info(`[docker-runner] gRPC server listening on ${grpcAddress}`);

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals | 'unknown') => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.info(`[docker-runner] shutting down (${signal ?? 'unknown'})`);
      await new Promise<void>((resolve) => {
        grpcServer.tryShutdown((err) => {
          if (err) {
            console.error('[docker-runner] failed to shutdown gRPC server', err);
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
