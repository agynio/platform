import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { waitForServices } from './wait-for-services.mjs';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const COMPOSE_FILE = path.join(ROOT_DIR, 'e2e/ziti/docker-compose.ci.yml');
const PROJECT_NAME = process.env.ZITI_E2E_PROJECT ?? 'ziti_e2e';
const HOME_DIR = process.env.HOME ?? os.homedir();
const HOME_DOCKER_CONFIG = path.join(HOME_DIR, '.docker');
const WORKSPACE_DOCKER_CONFIG = path.resolve(ROOT_DIR, '..', '.docker');
const HOST_WORKSPACE_ROOT = '/workspace/platform';
const HOST_CONTAINER_WORKSPACE = path.posix.join('/host', path.posix.relative('/workspace', HOST_WORKSPACE_ROOT));
const STATE_DIR = path.join(ROOT_DIR, '.ziti');
process.env.ZITI_E2E_STATE_DIR = STATE_DIR;
const UTILITY_IMAGE = process.env.ZITI_E2E_UTILITY_IMAGE ?? 'public.ecr.aws/docker/library/alpine:3.20';
const STATE_PATHS = {
  root: STATE_DIR,
  controller: path.join(STATE_DIR, 'controller'),
  identities: path.join(STATE_DIR, 'identities'),
  tmp: path.join(STATE_DIR, 'tmp'),
};
const DEFAULT_DOCKER_CONFIG =
  process.env.DOCKER_CONFIG
  ?? (hasComposePlugin(HOME_DOCKER_CONFIG) ? HOME_DOCKER_CONFIG : undefined)
  ?? (hasComposePlugin(WORKSPACE_DOCKER_CONFIG) ? WORKSPACE_DOCKER_CONFIG : undefined)
  ?? HOME_DOCKER_CONFIG;
const MAIN_TIMEOUT_MS = Number(process.env.ZITI_E2E_TIMEOUT_MS ?? 300_000);
const REQUEST_TIMEOUT_MS = 15_000;

if (!process.env.DOCKER_CONFIG) {
  process.env.DOCKER_CONFIG = DEFAULT_DOCKER_CONFIG;
}

console.log('[ziti-e2e] DOCKER_CONFIG', process.env.DOCKER_CONFIG);
console.log('[ziti-e2e] state dir', STATE_DIR);

const SERVICES_TO_WAIT = [
  { name: 'agents-db', requireHealth: true },
  { name: 'litellm-db', requireHealth: true },
  { name: 'litellm', requireHealth: true },
  { name: 'ziti-controller', requireHealth: true },
  { name: 'ziti-controller-init', completed: true },
  { name: 'ziti-edge-router', requireHealth: false },
  { name: 'dind', requireHealth: true },
  { name: 'docker-runner', requireHealth: true },
  { name: 'platform-server', requireHealth: true },
];

main().catch((error) => {
  console.error('[ziti-e2e] failed', error);
  process.exitCode = 1;
});

async function main() {
  await withTimeout(runFlow(), MAIN_TIMEOUT_MS, `Ziti E2E timed out after ${MAIN_TIMEOUT_MS}ms`);
}

async function runFlow() {
  await ensureWorkspaceAvailableOnDockerHost();
  const composeRunner = await createComposeRunner();
  registerSignalHandlers(composeRunner);
  await composeRunner.down({ quiet: true });
  try {
    await composeRunner.run(
      ['up', '-d', 'agents-db', 'litellm-db', 'litellm', 'ziti-controller', 'ziti-controller-init', 'ziti-edge-router', 'dind', 'docker-runner', 'platform-server'],
      { streamOutput: true },
    );
    await waitForServices({
      compose: composeRunner.run,
      inspect: (containerId) => runCommand('docker', ['inspect', containerId], { cwd: ROOT_DIR }),
      services: SERVICES_TO_WAIT,
      timeoutMs: 180_000,
    });
    await ensureWorkspaceNetwork(composeRunner.run);
    await waitForHttpReady('http://127.0.0.1:3010/api/containers?limit=1');
    await runWorkspaceLifecycle();
  } catch (error) {
    await dumpDiagnostics(composeRunner.run);
    throw error;
  } finally {
    if (process.env.ZITI_E2E_KEEP_STACK === '1') {
      console.warn('[ziti-e2e] skipping docker compose down (ZITI_E2E_KEEP_STACK=1)');
    } else {
      await composeRunner.down();
    }
  }
}

async function createComposeRunner() {
  const binary = await detectComposeBinary();
  const env = {
    ...process.env,
    DOCKER_CONFIG: DEFAULT_DOCKER_CONFIG,
    COMPOSE_PROJECT_NAME: PROJECT_NAME,
    ZITI_E2E_ROOT: ROOT_DIR,
    ZITI_E2E_STATE_DIR: STATE_DIR,
  };

  const run = async (args, options = {}) => {
    const fullArgs = [...binary.args, '-f', COMPOSE_FILE, ...args];
    return runCommand(binary.command, fullArgs, {
      cwd: ROOT_DIR,
      env,
      streamOutput: options.streamOutput ?? false,
      quiet: options.quiet ?? false,
    });
  };

  const down = async (options = {}) => {
    try {
      await run(['down', '-v', '--remove-orphans'], { streamOutput: options.streamOutput, quiet: options.quiet });
    } catch (error) {
      if (!(options.quiet ?? false)) {
        console.warn('[ziti-e2e] compose down failed', error);
      }
    }
  };

  return { command: binary.command, run, down };
}

async function detectComposeBinary() {
  const dockerEnv = { ...process.env, DOCKER_CONFIG: DEFAULT_DOCKER_CONFIG };
  try {
    await runCommand('docker', ['compose', 'version'], { quiet: true, env: dockerEnv });
    return { command: 'docker', args: ['compose'] };
  } catch (error) {
    console.warn('[ziti-e2e] docker compose plugin unavailable, falling back to docker-compose');
    if (error?.stderr) {
      console.warn(error.stderr);
    }
    await runCommand('docker-compose', ['version'], { quiet: true });
    return { command: 'docker-compose', args: [] };
  }
}

function registerSignalHandlers(composeRunner) {
  let cleaning = false;
  const handler = async (signal) => {
    if (cleaning) {
      return;
    }
    cleaning = true;
    console.warn(`[ziti-e2e] received ${signal}, stopping stack...`);
    await composeRunner.down({ quiet: true });
    process.exit(1);
  };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}

async function prepareLocalZitiDirectories() {
  await fs.mkdir(STATE_PATHS.root, { recursive: true });
  await fs.chmod(STATE_PATHS.root, 0o777);
  const dirs = ['controller', 'identities', 'tmp'];
  for (const dir of dirs) {
    const target = STATE_PATHS[dir];
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
    await fs.chmod(target, 0o777);
  }
}

async function verifyZitiDirectories() {
  const dirs = ['controller', 'identities', 'tmp'];
  for (const dir of dirs) {
    const target = STATE_PATHS[dir];
    try {
      await fs.stat(target);
    } catch (error) {
      throw new Error(`Missing Ziti directory: ${target} (${error.message})`);
    }
  }
}

async function ensureWorkspaceAvailableOnDockerHost() {
  const shared = await isWorkspaceSharedWithDockerHost();
  if (shared) {
    console.log('[ziti-e2e] docker host shares workspace; preparing local .ziti state');
    await prepareLocalZitiDirectories();
    await verifyZitiDirectories();
    return;
  }
  console.log('[ziti-e2e] docker host cannot read workspace directly; syncing repository snapshot');
  await syncWorkspaceToDockerHost();
}

async function isWorkspaceSharedWithDockerHost() {
  const probeName = `.ziti-host-probe-${Date.now()}`;
  const probePath = path.join(ROOT_DIR, probeName);
  await fs.writeFile(probePath, 'probe', 'utf8');
  try {
    await runCommand('docker', ['run', '--rm', '-v', `${ROOT_DIR}:/host`, UTILITY_IMAGE, 'test', '-f', `/host/${probeName}`], {
      quiet: true,
    });
    return true;
  } catch {
    return false;
  } finally {
    await fs.rm(probePath, { force: true }).catch(() => {});
  }
}

async function syncWorkspaceToDockerHost() {
  const containerName = `${PROJECT_NAME}_host_sync`;
  await runCommand('docker', ['rm', '-f', containerName], { quiet: true }).catch(() => {});
  await runCommand('docker', ['run', '-d', '--name', containerName, '-v', '/workspace:/host', UTILITY_IMAGE, 'sleep', '3600'], {
    quiet: true,
  });
  try {
    await runCommand(
      'docker',
      ['exec', containerName, 'sh', '-c', `rm -rf ${HOST_CONTAINER_WORKSPACE} && mkdir -p ${HOST_CONTAINER_WORKSPACE}`],
      { quiet: true },
    );
    await streamRepoToHost(containerName);
    const initScript = [
      `mkdir -p ${HOST_CONTAINER_WORKSPACE}/.ziti/controller ${HOST_CONTAINER_WORKSPACE}/.ziti/identities ${HOST_CONTAINER_WORKSPACE}/.ziti/tmp`,
      `chmod -R 0777 ${HOST_CONTAINER_WORKSPACE}/.ziti`,
    ].join(' && ');
    await runCommand('docker', ['exec', containerName, 'sh', '-c', initScript], { quiet: true });
  } finally {
    await runCommand('docker', ['rm', '-f', containerName], { quiet: true }).catch(() => {});
  }
}

function streamRepoToHost(containerName) {
  return new Promise((resolve, reject) => {
    const excludes = ['.git', 'node_modules', '.turbo', '.tmp', '.ziti', '.pnpm-store', '.cache', 'coverage'];
    const tarArgs = [
      '-C',
      ROOT_DIR,
      ...excludes.flatMap((pattern) => ['--exclude', pattern]),
      '-cf',
      '-',
      '.',
    ];
    console.log('[ziti-e2e] syncing repository snapshot to docker host');
    const tarProc = spawn('tar', tarArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
    const dockerProc = spawn('docker', ['exec', '-i', containerName, 'sh', '-c', `cd ${HOST_CONTAINER_WORKSPACE} && tar xf -`], {
      quiet: true,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    tarProc.stdout.pipe(dockerProc.stdin);
    let settled = false;
    const cleanup = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      tarProc.stdout.unpipe(dockerProc.stdin);
      dockerProc.stdin.end();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    tarProc.on('error', cleanup);
    tarProc.on('close', (code) => {
      if (code !== 0) {
        cleanup(new Error(`tar exited with code ${code}`));
      }
    });
    dockerProc.on('error', cleanup);
    dockerProc.on('close', (code) => {
      if (code === 0) {
        cleanup();
      } else {
        cleanup(new Error(`docker exec tar exited with code ${code}`));
      }
    });
  });
}

async function ensureWorkspaceNetwork(compose) {
  try {
    await compose(['exec', '-T', 'dind', 'docker', 'network', 'inspect', 'agents_net'], { quiet: true });
  } catch {
    await compose(['exec', '-T', 'dind', 'docker', 'network', 'create', '--driver', 'bridge', 'agents_net'], {
      streamOutput: true,
    });
  }
}

async function waitForHttpReady(url) {
  await waitUntil(async () => {
    try {
      const response = await fetchWithTimeout(url, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }, {
    timeoutMs: 120_000,
    intervalMs: 2_000,
    description: 'platform-server readiness',
  });
}

async function runWorkspaceLifecycle() {
  console.log('[ziti-e2e] creating workspace');
  const { containerId, threadId } = await createWorkspace();
  console.log(`[ziti-e2e] workspace created container=${containerId} thread=${threadId}`);
  await waitUntil(async () => {
    const state = await findContainer(containerId, false);
    return state?.status === 'running';
  }, { timeoutMs: 60_000, intervalMs: 2_000, description: 'workspace running state' });

  console.log('[ziti-e2e] deleting workspace');
  await deleteWorkspace(containerId);
  await waitUntil(async () => {
    const state = await findContainer(containerId, true);
    return !!state && state.status === 'stopped';
  }, { timeoutMs: 90_000, intervalMs: 2_000, description: 'workspace cleanup state' });
  console.log('[ziti-e2e] workspace lifecycle verified');
}

async function createWorkspace() {
  const response = await fetchWithTimeout('http://127.0.0.1:3010/test/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias: 'ziti-e2e' }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create workspace (${response.status})`);
  }
  const payload = await response.json();
  if (!payload?.containerId || !payload?.threadId) {
    throw new Error('Workspace response missing containerId or threadId');
  }
  return payload;
}

async function deleteWorkspace(containerId) {
  const response = await fetchWithTimeout(`http://127.0.0.1:3010/api/containers/${containerId}`, {
    method: 'DELETE',
  });
  if (response.status !== 204) {
    throw new Error(`Failed to delete workspace container (${response.status})`);
  }
}

async function findContainer(containerId, includeStopped) {
  const url = new URL('http://127.0.0.1:3010/api/containers');
  url.searchParams.set('limit', '200');
  if (includeStopped) {
    url.searchParams.set('includeStopped', 'true');
  }
  const response = await fetchWithTimeout(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to list containers (${response.status})`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.items)
    ? payload.items.find((item) => item.containerId === containerId)
    : undefined;
}

async function dumpDiagnostics(compose) {
  console.warn('[ziti-e2e] collecting diagnostics');
  try {
    await compose(['ps'], { streamOutput: true, quiet: true });
    await compose(
      [
        'logs',
        '--tail',
        '200',
        'ziti-controller',
        'ziti-controller-init',
        'ziti-edge-router',
        'docker-runner',
        'platform-server',
      ],
      { streamOutput: true, quiet: true },
    );
  } catch (error) {
    console.warn('[ziti-e2e] failed to collect diagnostics', error);
  }
}

async function fetchWithTimeout(resource, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS).unref();
  try {
    const response = await fetch(resource, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitUntil(check, options) {
  const { timeoutMs, intervalMs, description } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await delay(intervalMs, { ref: false });
  }
  throw new Error(`Timeout waiting for ${description ?? 'condition'}`);
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs).unref();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (!(options.quiet ?? false)) {
      console.log(`[ziti-e2e] > ${command} ${args.join(' ')}`);
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (options.streamOutput) {
        process.stdout.write(chunk);
      }
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (options.streamOutput) {
        process.stderr.write(chunk);
      }
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

function hasComposePlugin(dir) {
  if (!dir) {
    return false;
  }
  const pluginPath = path.join(dir, 'cli-plugins', 'docker-compose');
  return existsSync(pluginPath);
}
