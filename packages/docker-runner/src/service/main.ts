import './env';

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
    const grpcAddress = await new Promise<string>((resolve, reject) => {
      const onError = (err: Error) => {
        grpcServer.off('error', onError);
        reject(err);
      };
      grpcServer.once('error', onError);
      grpcServer.listen(config.grpcPort, config.grpcHost, () => {
        grpcServer.off('error', onError);
        const address = grpcServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind docker-runner server'));
          return;
        }
        resolve(`${config.grpcHost}:${address.port}`);
      });
    });
    console.info(`[docker-runner] gRPC server listening on ${grpcAddress}`);

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals | 'unknown') => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.info(`[docker-runner] shutting down (${signal ?? 'unknown'})`);
      await new Promise<void>((resolve) => {
        grpcServer.close((err) => {
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
