import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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

describe('FsGraphRepository without git directory', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-fs-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function datasetPath(...segments: string[]): string {
    return path.join(tempDir, 'datasets', 'fs-test', ...segments);
  }

  it('initializes, upserts, and reads graph data without .git present', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphDataPath: tempDir,
        graphDataset: 'fs-test',
      }),
      { graphDatasetExplicit: true },
    );
    const repo = new FsGraphRepository(cfg, templateRegistryStub);

    expect(await pathExists(path.join(tempDir, '.git'))).toBe(false);

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
        graphDataPath: tempDir,
        graphDataset: 'fs-test',
      }),
      { graphDatasetExplicit: true },
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

    const snapshotEntries = await fs.readdir(datasetPath('snapshots'));
    expect(snapshotEntries).toEqual(['1']);
    const journalContents = await fs.readFile(datasetPath('journal.ndjson'), 'utf8');
    const lines = journalContents.trim().length ? journalContents.trim().split('\n') : [];
    expect(lines).toHaveLength(1);
  });

  it('falls back to journal when snapshot read fails', async () => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        ...baseConfigEnv,
        graphDataPath: tempDir,
        graphDataset: 'fs-test',
      }),
      { graphDatasetExplicit: true },
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

    // Corrupt working tree and snapshot
    await fs.writeFile(datasetPath('nodes', 'start.yaml'), '{ not: yaml');
    await fs.writeFile(datasetPath('snapshots', '2', 'nodes', 'branch.yaml'), '{ invalid');

    const repoAfterRestart = new FsGraphRepository(cfg, templateRegistryStub);
    await repoAfterRestart.initIfNeeded();
    const loaded = await repoAfterRestart.get('main');
    expect(loaded?.version).toBe(2);
    expect(loaded?.nodes).toHaveLength(2);
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
