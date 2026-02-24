#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.SKIP_PLATFORM_SERVER_PREPARE === '1') {
  console.info('[platform-server] skipping prisma generate (SKIP_PLATFORM_SERVER_PREPARE=1)');
  process.exit(0);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const prismaBin = path.resolve(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

if (!existsSync(prismaBin)) {
  console.warn('[platform-server] prisma CLI not installed; skipping prisma generate');
  process.exit(0);
}

const result = spawnSync(prismaBin, ['generate'], { stdio: 'inherit' });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
