import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runMigration } from '../../tools/graph-ref-migrate/run';
import type { Logger, MigrationOptions } from '../../tools/graph-ref-migrate/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../__fixtures__/graph-migration');

const createLogger = (): Logger => ({
  info() {},
  warn() {},
  error() {},
  verbose() {},
});

const tempDirs: string[] = [];

const copyFixture = async (fixtureName: string): Promise<string> => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-ref-'));
  tempDirs.push(base);
  await fs.cp(path.join(fixturesDir, fixtureName), base, { recursive: true });
  return base;
};

const createOptions = (overrides: Partial<MigrationOptions> & { cwd: string }): MigrationOptions => ({
  input: path.join(overrides.cwd, '**/*.json'),
  includes: [],
  excludes: [],
  mode: 'dry-run',
  backup: true,
  defaultMount: 'secret',
  knownMounts: ['secret'],
  validateSchema: true,
  verbose: false,
  cwd: overrides.cwd,
  ...overrides,
});

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('graph-ref-migrate integration', () => {
  it('reports conversions without modifying files in dry-run mode', async () => {
    const cwd = await copyFixture('legacy');
    const options = createOptions({ cwd, mode: 'dry-run', backup: true });

    const summary = await runMigration(options, createLogger());

    expect(summary.files.length).toBe(4);
    const slackNode = summary.files.find((file) => file.path.endsWith('nodes/slack%2Ftrigger.json'));
    expect(slackNode).toBeDefined();
    expect(slackNode?.changed).toBe(true);
    expect(slackNode?.conversions).toContainEqual({
      pointer: '/config/auth/bot',
      kind: 'vault',
      legacy: 'vault',
      usedDefaultMount: true,
    });
    expect(slackNode?.errors).toContainEqual({
      pointer: '/config/auth/app',
      message: 'Legacy vault reference missing path segment between mount and key',
    });
    expect(slackNode?.errors).toContainEqual({ pointer: '/config/auth/app', message: 'Legacy reference remains after migration' });
    expect(slackNode?.skipped).toBe(true);

    const githubNode = summary.files.find((file) => file.path.endsWith('nodes/github%2Fclone.json'));
    expect(githubNode).toBeDefined();
    expect(githubNode?.errors).toEqual([]);
    expect(githubNode?.changed).toBe(true);
    expect(githubNode?.conversions.length).toBeGreaterThan(0);

    // Ensure files remain unmodified (legacy refs still present)
    const sample = await fs.readFile(path.join(cwd, 'nodes/slack%2Ftrigger.json'), 'utf8');
    expect(sample).toContain('"source": "vault"');
    const backups = await fs.readdir(path.join(cwd, 'nodes'));
    expect(backups.some((name) => name.includes('.backup-'))).toBe(false);
  });

  it('writes migrations with backups and produces idempotent output', async () => {
    const cwd = await copyFixture('legacy');
    const writeSummary = await runMigration(createOptions({ cwd, mode: 'write', backup: true }), createLogger());

    const slackNode = writeSummary.files.find((file) => file.path.endsWith('nodes/slack%2Ftrigger.json'));
    expect(slackNode?.skipped).toBe(true);
    expect(slackNode?.conversions).toContainEqual({
      pointer: '/config/auth/bot',
      kind: 'vault',
      legacy: 'vault',
      usedDefaultMount: true,
    });
    expect(slackNode?.errors).toContainEqual({
      pointer: '/config/auth/app',
      message: 'Legacy vault reference missing path segment between mount and key',
    });

    const githubNode = writeSummary.files.find((file) => file.path.endsWith('nodes/github%2Fclone.json'));
    expect(githubNode?.skipped).not.toBe(true);
    expect(githubNode?.errors).toEqual([]);
    expect(githubNode?.changed).toBe(true);

    const nodePath = path.join(cwd, 'nodes/github%2Fclone.json');
    const updated = JSON.parse(await fs.readFile(nodePath, 'utf8')) as Record<string, unknown>;
    const token = (updated.config as { token: Record<string, unknown> }).token as Record<string, unknown>;
    expect(token).toEqual({ kind: 'vault', mount: 'workflows', path: 'github', key: 'token' });

    const dirEntries = await fs.readdir(path.join(cwd, 'nodes'));
    expect(dirEntries.filter((name) => name.includes('.backup-')).length).toBeGreaterThan(0);
    expect(dirEntries.some((name) => name.startsWith('slack%2Ftrigger.json.backup-'))).toBe(false);

    const secondSummary = await runMigration(createOptions({ cwd, mode: 'dry-run', backup: false }), createLogger());
    const secondSlack = secondSummary.files.find((file) => file.path.endsWith('nodes/slack%2Ftrigger.json'));
    expect(secondSlack?.skipped).toBe(true);
    expect(secondSlack?.errors).toContainEqual({
      pointer: '/config/auth/app',
      message: 'Legacy vault reference missing path segment between mount and key',
    });
    expect(secondSlack?.conversions).toContainEqual({
      pointer: '/config/auth/bot',
      kind: 'vault',
      legacy: 'vault',
      usedDefaultMount: true,
    });
    expect(secondSummary.files.filter((file) => file.errors.length === 0 && file.changed).length).toBe(0);
  });

  it('flags errors and skips writes when migration fails', async () => {
    const cwd = await copyFixture('invalid');
    const summary = await runMigration(createOptions({ cwd, mode: 'write' }), createLogger());

    expect(summary.files.some((file) => file.errors.length > 0)).toBe(true);
    expect(summary.files.every((file) => file.skipped === true)).toBe(true);

    const raw = await fs.readFile(path.join(cwd, 'nodes/broken.json'), 'utf8');
    expect(raw).toContain('"source": "vault"');
    const backups = await fs.readdir(path.join(cwd, 'nodes'));
    expect(backups.some((name) => name.includes('.backup-'))).toBe(false);
  });
});
