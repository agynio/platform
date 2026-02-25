#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

if (process.env.SKIP_WORKSPACE_PREPARE === '1') {
  console.info('[workspace] skipping prepare scripts (SKIP_WORKSPACE_PREPARE=1)');
  process.exit(0);
}

const result = spawnSync('pnpm', ['-r', '--if-present', 'run', 'prepare'], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
