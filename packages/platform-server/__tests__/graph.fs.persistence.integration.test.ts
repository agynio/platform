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

  it('rolls back snapshot artifacts when persistence fails', async () => {
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

    const appendSpy = vi.spyOn(repo as any, 'appendJournal').mockImplementation(async () => {
      throw new Error('fail-journal');
    });

    await expect(
      repo.upsert(
        {
          name: 'main',
          version: 1,
          nodes: [
            { id: 'start', template: 'trigger', position: { x: 1, y: 1 } },
            { id: 'next', template: 'trigger' },
          ],
          edges: [],
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'PERSIST_FAILED' });

    appendSpy.mockRestore();

    const snapshotEntries = await fs.readdir(repoPath('snapshots'));
    expect(snapshotEntries).toEqual(['1']);
    const journalContents = await fs.readFile(repoPath('journal.ndjson'), 'utf8');
    const lines = journalContents.trim().length ? journalContents.trim().split('\n') : [];
    expect(lines).toHaveLength(1);
  });

  it('falls back to journal when snapshot read fails', async () => {
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

    await fs.writeFile(repoPath('nodes', 'start.yaml'), '{ not: yaml');
    await fs.writeFile(repoPath('snapshots', '2', 'nodes', 'branch.yaml'), '{ invalid');

    const repoAfterRestart = new FsGraphRepository(cfg, templateRegistryStub);
    await repoAfterRestart.initIfNeeded();
    const loaded = await repoAfterRestart.get('main');
    expect(loaded?.version).toBe(2);
    expect(loaded?.nodes).toHaveLength(2);
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
