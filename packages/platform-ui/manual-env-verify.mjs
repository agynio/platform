#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scenario = process.argv[2];
if (!scenario || !['main', 'fix'].includes(scenario)) {
  console.error('Usage: node manual-env-verify.mjs <main|fix>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storybookBin = path.resolve(__dirname, 'node_modules', '.bin', 'storybook');

const port = scenario === 'main' ? 7106 : 7206;
const baseUrl = `http://127.0.0.1:${port}`;
const storyUrl = `${baseUrl}/?path=/story/manual-workspaceenvgraph--default`;
const outputDir = path.resolve('/tmp/issue-1309', scenario);
await fs.mkdir(outputDir, { recursive: true });

const env = {
  ...process.env,
  PATH: `${process.env.HOME}/.nix-profile/bin:${process.env.PATH ?? ''}`,
  BROWSER: 'none',
  STORYBOOK_DISABLE_TELEMETRY: '1',
};

const staticDir = path.resolve(__dirname, `.manual-storybook-${scenario}`);
await fs.rm(staticDir, { recursive: true, force: true });
await runCommand(storybookBin, ['build', '--output-dir', staticDir], {
  cwd: __dirname,
  env,
});

const server = spawn('pnpm', ['dlx', 'http-server', staticDir, '-p', String(port), '--silent'], {
  cwd: __dirname,
  env,
  stdio: 'inherit',
});

let shuttingDown = false;

process.on('SIGINT', () => {
  shuttingDown = true;
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  server.kill('SIGTERM');
});

try {
  await waitForServer(baseUrl, server);
  const videoPath = await recordScenario(storyUrl, outputDir);
  console.log(JSON.stringify({ scenario, videoPath }));
} finally {
  await shutdownStorybook(server);
  await fs.rm(staticDir, { recursive: true, force: true });
}

async function waitForServer(url, childProcess) {
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    if (childProcess.exitCode !== null) {
      throw new Error('Storybook exited before it became ready.');
    }

    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return;
    } catch {
      // ignore until timeout
    }

    await sleep(1000);
  }

  throw new Error('Timed out waiting for Storybook readiness');
}

async function recordScenario(url, outputDir) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  const frame = page.frameLocator('#storybook-preview-iframe');
  await frame.locator('body').first().waitFor({ state: 'visible' });

  let workspaceNode = frame.locator('[data-id="workspace-root"]').first();
  if ((await workspaceNode.count()) === 0) {
    workspaceNode = frame.locator('.react-flow__node').filter({ hasText: 'Ops Workspace' }).first();
  }
  await workspaceNode.waitFor({ state: 'visible', timeout: 60000 });
  await workspaceNode.click();

  const valueInput = frame.getByPlaceholder('Value or reference...').first();
  await valueInput.click();
  await sleep(500);
  await page.keyboard.type('abc123', { delay: 120 });
  await sleep(800);
  await valueInput.click();
  await valueInput.fill('');
  await sleep(300);
  await page.keyboard.press('Backspace');
  await sleep(800);
  await page.keyboard.press('Backspace');
  await sleep(800);
  await page.keyboard.press('Backspace');
  await sleep(800);

  await page.waitForTimeout(1200);

  const video = page.video();
  await context.close();
  const rawVideoPath = await video.path();
  await browser.close();
  return rawVideoPath;
}

async function shutdownStorybook(child) {
  if (child.exitCode !== null || shuttingDown) {
    return;
  }
  child.kill('SIGTERM');
  const completed = await Promise.race([
    once(child, 'exit').then(() => true),
    sleep(5000).then(() => false),
  ]);
  if (!completed && child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function once(child, event) {
  return new Promise((resolve) => {
    child.once(event, resolve);
  });
}

function runCommand(bin, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${bin} exited with code ${code}`));
      }
    });
  });
}
