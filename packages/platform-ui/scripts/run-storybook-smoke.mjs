#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const HOST = process.env.STORYBOOK_SMOKE_HOST ?? '127.0.0.1';
const PORT = process.env.STORYBOOK_SMOKE_PORT ?? '7080';
const URL = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 60_000;

const env = {
  ...process.env,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://localhost:4173/api',
};

const BIN_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../node_modules/.bin',
);
const require = createRequire(import.meta.url);

function ensureBin(name) {
  const candidate = tryResolveBin(name);
  if (candidate !== null) {
    return candidate;
  }

  throw new Error(`Unable to locate executable for ${name} at ${formatBinPath(name)}`);
}

function resolveTestRunnerInvocation() {
  const direct = tryResolveBin('test-storybook');
  if (direct !== null) {
    return { command: direct, args: [] };
  }

  const moduleEntry = resolveModuleEntry('@storybook/test-runner/dist/test-storybook.js');
  return { command: process.execPath, args: [moduleEntry] };
}

function resolveModuleEntry(specifier) {
  try {
    return require.resolve(specifier);
  } catch (error) {
    throw new Error(`Unable to resolve module entry for ${specifier}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function tryResolveBin(name) {
  const candidate = formatBinPath(name);
  try {
    accessSync(candidate, fsConstants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function formatBinPath(name) {
  const extension = process.platform === 'win32' ? '.cmd' : '';
  return path.join(BIN_DIRECTORY, `${name}${extension}`);
}

const storybookProcess = spawn(ensureBin('storybook'), ['dev', '--ci', '--host', HOST, '--port', PORT, '--no-open'], {
  env,
  stdio: 'inherit',
});

process.on('SIGINT', () => {
  void cleanup().finally(() => process.exit(1));
});

process.on('SIGTERM', () => {
  void cleanup().finally(() => process.exit(1));
});

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  try {
    await Promise.all([waitForServer(), ensurePlaywrightBrowsers()]);
    await runTests();
  } finally {
    await cleanup();
  }
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    if (storybookProcess.exitCode !== null) {
      throw new Error('Storybook dev server exited before becoming ready.');
    }

    try {
      const response = await fetch(URL, { method: 'HEAD' });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore fetch errors until timeout expires
    }

    await sleep(1000);
  }

  throw new Error('Storybook dev server did not become ready within 60 seconds.');
}

async function runTests() {
  await new Promise((resolve, reject) => {
    const { command, args: prefixArgs } = resolveTestRunnerInvocation();
    const runner = spawn(
      command,
      [...prefixArgs, '--ci', '--maxWorkers=2', '--testTimeout=60000', '--url', URL],
      { env, stdio: 'inherit' },
    );

    runner.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason =
        signal !== null
          ? `terminated by signal ${signal}`
          : `exited with code ${code}`;
      reject(new Error(`Storybook smoke tests failed: ${reason}`));
    });

    runner.on('error', (error) => {
      reject(error);
    });
  });
}

async function ensurePlaywrightBrowsers() {
  const cacheDir = getPlaywrightCacheDir();
  if (hasChromiumInstall(cacheDir)) {
    return;
  }

  await new Promise((resolve, reject) => {
    const installer = spawn(ensureBin('playwright'), ['install', 'chromium'], {
      env,
      stdio: 'inherit',
    });

    installer.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason =
        signal !== null
          ? `terminated by signal ${signal}`
          : `exited with code ${code}`;
      reject(new Error(`Failed to install Playwright browsers: ${reason}`));
    });

    installer.on('error', (error) => {
      reject(error);
    });
  });
}

function getPlaywrightCacheDir() {
  return env.PLAYWRIGHT_BROWSERS_PATH ?? path.resolve(process.cwd(), '.playwright');
}

function hasChromiumInstall(cacheDir) {
  try {
    const entries = readdirSync(cacheDir, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.startsWith('chromium-') || entry.name.startsWith('chromium_headless_shell-')),
    );
  } catch {
    return false;
  }
}

async function cleanup() {
  if (storybookProcess.exitCode !== null) {
    return;
  }

  storybookProcess.kill('SIGTERM');

  const exited = new Promise((resolve) => {
    storybookProcess.once('exit', () => resolve(true));
  });

  const timedOut = sleep(5_000).then(() => false);

  const completed = await Promise.race([exited, timedOut]);

  if (!completed && storybookProcess.exitCode === null) {
    storybookProcess.kill('SIGKILL');
  }
}
