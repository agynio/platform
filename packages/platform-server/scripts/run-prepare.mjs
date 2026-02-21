#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const raw = process.env.SKIP_PLATFORM_SERVER_PREPARE;
const shouldSkip = typeof raw === 'string' && ['1', 'true', 'yes'].includes(raw.toLowerCase());

if (shouldSkip) {
  console.log('Skipping @agyn/platform-server prepare script.');
  process.exit(0);
}

const result = spawnSync('prisma', ['generate'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('Failed to run prisma generate:', result.error.message);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
