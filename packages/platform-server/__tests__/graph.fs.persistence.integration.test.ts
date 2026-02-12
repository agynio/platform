import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { FsGraphRepository } from '../src/graph/fsGraph.repository';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import type { TemplateRegistry } from '../src/graph-core/templateRegistry';

const schema = [
  { name: 'trigger', title: 'Trigger', kind: 'trigger', sourcePorts: ['out'], targetPorts: [] },
] as const;

const templateRegistryStub: TemplateRegistry = {
  register: () => templateRegistryStub,
  getClass: () => undefined,
  getMeta: () => undefined,
  toSchema: async () => schema as unknown as typeof schema,
} as unknown as TemplateRegistry;

const baseConfigEnv = {
  llmProvider: 'openai',
  githubAppId: 'app',
  githubAppPrivateKey: 'key',
  githubInstallationId: 'inst',
  githubToken: 'token',
  agentsDatabaseUrl: 'postgres://localhost:5432/agents',
  litellmBaseUrl: 'http://localhost:4000',
  litellmMasterKey: 'sk-test',
  dockerMirrorUrl: 'http://registry-mirror:5000',
  nixAllowedChannels: 'nixpkgs-unstable',
};

describe('FsGraphRepository filesystem persistence', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-fs-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function repoPath(...segments: string[]): string {
    return path.join(tempDir, ...segments);
  }

  it('initializes, upserts, and reads graph data without git involvement', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphRepoPath: tempDir,
      }),
    );
    const repo = new FsGraphRepository(cfg, templateRegistryStub);

    await repo.initIfNeeded();
    const saved = await repo.upsert(
      {
        name: 'main',
        version: 0,
        nodes: [{ id: 'start', template: 'trigger' }],
        edges: [],
      },
      undefined,
    );

    expect(saved.version).toBe(1);
    const loaded = await repo.get('main');
    expect(loaded?.nodes.map((n) => n.id)).toEqual(['start']);
    expect(await pathExists(path.join(tempDir, '.git'))).toBe(false);
  });

  it('does not create recovery directories when graph changes', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphRepoPath: tempDir,
      }),
    );
    const repo = new FsGraphRepository(cfg, templateRegistryStub);
    await repo.initIfNeeded();

    await repo.upsert(
      {
        name: 'main',
        version: 0,
        nodes: [{ id: 'start', template: 'trigger' }],
        edges: [],
      },
      undefined,
    );

    await repo.upsert(
      {
        name: 'main',
        version: 1,
        nodes: [
          { id: 'start', template: 'trigger' },
          { id: 'branch', template: 'trigger' },
        ],
        edges: [],
      },
      undefined,
    );

    expect(await pathExists(repoPath('snapshots'))).toBe(false);
    expect(await pathExists(repoPath('journal'))).toBe(false);
    expect(await pathExists(repoPath('journal.ndjson'))).toBe(false);
    const artifacts = await listTempArtifacts(tempDir);
    expect(artifacts.staging).toHaveLength(0);
    expect(artifacts.backups).toHaveLength(0);
  });

  it('restores the previous tree if a staged swap fails', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphRepoPath: tempDir,
      }),
    );
    const repo = new FsGraphRepository(cfg, templateRegistryStub);
    await repo.initIfNeeded();

    await repo.upsert(
      {
        name: 'main',
        version: 0,
        nodes: [{ id: 'start', template: 'trigger' }],
        edges: [],
      },
      undefined,
    );

    const realRename = fs.rename;
    let shouldFail = true;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (shouldFail && typeof to === 'string' && to === repoPath()) {
        shouldFail = false;
        throw new Error('rename-fail');
      }
      return realRename.call(fs, from, to);
    });

    await expect(
      repo.upsert(
        {
          name: 'main',
          version: 1,
          nodes: [
            { id: 'start', template: 'trigger' },
            { id: 'next', template: 'trigger' },
          ],
          edges: [],
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'PERSIST_FAILED' });

    renameSpy.mockRestore();

    const loaded = await repo.get('main');
    expect(loaded?.version).toBe(1);
    expect(loaded?.nodes).toHaveLength(1);
    const artifacts = await listTempArtifacts(tempDir);
    expect(artifacts.staging).toHaveLength(0);
    expect(artifacts.backups).toHaveLength(0);
  });

  it('repairs orphaned staging artifacts on startup', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphRepoPath: tempDir,
      }),
    );
    const repo = new FsGraphRepository(cfg, templateRegistryStub);
    await repo.initIfNeeded();

    await repo.upsert(
      {
        name: 'main',
        version: 0,
        nodes: [{ id: 'start', template: 'trigger' }],
        edges: [],
      },
      undefined,
    );

    await repo.upsert(
      {
        name: 'main',
        version: 1,
        nodes: [
          { id: 'start', template: 'trigger' },
          { id: 'branch', template: 'trigger' },
        ],
        edges: [],
      },
      undefined,
    );

    const parent = path.dirname(tempDir);
    const orphanBackup = path.join(parent, `.graph-backup-test-${Date.now().toString(36)}`);
    const orphanStaging = path.join(parent, `.graph-staging-test-${Date.now().toString(36)}`);
    await fs.rename(tempDir, orphanBackup);
    await fs.mkdir(orphanStaging, { recursive: true });

    const repoAfterCrash = new FsGraphRepository(cfg, templateRegistryStub);
    await repoAfterCrash.initIfNeeded();
    const loaded = await repoAfterCrash.get('main');
    expect(loaded?.version).toBe(2);
    expect(loaded?.nodes).toHaveLength(2);

    const artifacts = await listTempArtifacts(tempDir);
    expect(artifacts.staging).toHaveLength(0);
    expect(artifacts.backups).toHaveLength(0);
  });

  it('ignores leftover git directories in the repo path', async () => {
    await fs.mkdir(path.join(tempDir, '.git', 'objects'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main');

    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphRepoPath: tempDir,
        graphBranch: 'feature/x',
      }),
    );
    const repo = new FsGraphRepository(cfg, templateRegistryStub);

    await repo.initIfNeeded();
    await repo.upsert(
      {
        name: 'main',
        version: 0,
        nodes: [{ id: 'start', template: 'trigger' }],
        edges: [],
      },
      undefined,
    );

    const loaded = await repo.get('main');
    expect(loaded?.nodes).toHaveLength(1);
    expect(await pathExists(path.join(tempDir, '.git', 'HEAD'))).toBe(true);
  });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listTempArtifacts(root: string): Promise<{ staging: string[]; backups: string[] }> {
  const parent = path.dirname(root);
  const baseName = path.basename(root).replace(/[^a-zA-Z0-9.-]/g, '_');
  const stagingPrefix = `.graph-staging-${baseName}-`;
  const backupPrefix = `.graph-backup-${baseName}-`;
  try {
    const entries = await fs.readdir(parent);
    return {
      staging: entries.filter((name) => name.startsWith(stagingPrefix)),
      backups: entries.filter((name) => name.startsWith(backupPrefix)),
    };
  } catch {
    return { staging: [], backups: [] };
  }
}
