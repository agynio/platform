import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const isProduction = () => process.env.NODE_ENV?.toLowerCase() === 'production';

function resolveCandidatePaths(): string[] {
  const moduleDir = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
  const repoEnv = path.resolve(process.cwd(), '.env');
  const packageEnv = path.resolve(moduleDir, '../../.env');
  return [repoEnv, packageEnv];
}

function loadDotenv(): void {
  const tried = new Set<string>();

  for (const candidate of resolveCandidatePaths()) {
    const normalized = path.normalize(candidate);
    if (tried.has(normalized)) continue;
    tried.add(normalized);

    if (!fs.existsSync(normalized)) continue;

    config({
      path: normalized,
      override: false,
    });
    return;
  }
}

if (!isProduction()) {
  loadDotenv();
}
