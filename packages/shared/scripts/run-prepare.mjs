#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const raw = process.env.SKIP_SHARED_PREPARE;
const shouldSkip = typeof raw === 'string' && ['1', 'true', 'yes'].includes(raw.toLowerCase());

if (shouldSkip) {
  console.log('Skipping @agyn/shared prepare script.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['run', 'build'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('Failed to run shared build:', result.error.message);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
