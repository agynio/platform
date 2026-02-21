import './env.js';

import { loadRunnerConfig } from './config.js';
import { createRunnerApp } from './app.js';

async function bootstrap(): Promise<void> {
  try {
    const config = loadRunnerConfig();
    const app = createRunnerApp(config);
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    console.error('docker-runner failed to start', error);
    process.exit(1);
  }
}

void bootstrap();
