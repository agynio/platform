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

describe('FsGraphRepository storage layout detection', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-layout-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('loads a populated dataset when GRAPH_DATA_PATH points to the dataset root', async () => {
    const datasetRoot = await seedGraph(workDir, 'fs-test');
    const repo = new FsGraphRepository(makeConfig(datasetRoot, { dataset: 'fs-test' }), templateRegistryStub);
    await repo.initIfNeeded();

    const loaded = await repo.get('main');
    expect(loaded?.version).toBe(1);
    expect(loaded?.nodes).toHaveLength(1);
  });

  it('fails fast with migration instructions for legacy working trees without auto-migrate', async () => {
    const datasetRoot = await seedGraph(workDir, 'fs-test');
    const legacyPath = path.join(workDir, 'legacy');
    await fs.mkdir(legacyPath, { recursive: true });
    await fs.cp(datasetRoot, legacyPath, { recursive: true });
    await fs.mkdir(path.join(legacyPath, '.git'));

    const repo = new FsGraphRepository(makeConfig(legacyPath, { dataset: 'fs-test' }), templateRegistryStub);
    await expect(repo.initIfNeeded()).rejects.toMatchObject({
      code: 'LEGACY_GRAPH_REPO',
      message: expect.stringContaining('graph:migrate-fs'),
    });
  });

  it('auto-migrates legacy working trees when GRAPH_AUTO_MIGRATE is enabled', async () => {
    const datasetRoot = await seedGraph(workDir, 'fs-test');
    const legacyPath = path.join(workDir, 'legacy-auto');
    await fs.mkdir(legacyPath, { recursive: true });
    await fs.cp(datasetRoot, legacyPath, { recursive: true });
    await fs.mkdir(path.join(legacyPath, '.git'));

    const repo = new FsGraphRepository(
      makeConfig(legacyPath, { dataset: 'fs-test', autoMigrate: true }),
      templateRegistryStub,
    );
    await repo.initIfNeeded();
    const loaded = await repo.get('main');

    expect(loaded?.version).toBe(1);
    expect(await pathExists(path.join(legacyPath, '.git'))).toBe(false);
    expect(await pathExists(path.join(legacyPath, 'datasets', 'fs-test', 'graph.meta.yaml'))).toBe(true);
  });

  it('continues reading from the canonical dataset after migration restarts', async () => {
    const datasetRoot = await seedGraph(workDir, 'fs-restart');
    const legacyPath = path.join(workDir, 'legacy-restart');
    await fs.mkdir(legacyPath, { recursive: true });
    await fs.cp(datasetRoot, legacyPath, { recursive: true });
    await fs.mkdir(path.join(legacyPath, '.git'));

    const repo = new FsGraphRepository(
      makeConfig(legacyPath, { dataset: 'fs-restart', autoMigrate: true }),
      templateRegistryStub,
    );
    await repo.initIfNeeded();
    const migrated = await repo.get('main');
    expect(migrated?.version).toBe(1);

    await fs.writeFile(path.join(legacyPath, 'nodes', 'start.yaml'), 'id: start\ntemplate: legacy\n');

    const restartRepo = new FsGraphRepository(
      makeConfig(legacyPath, { dataset: 'fs-restart', autoMigrate: false }),
      templateRegistryStub,
    );
    await restartRepo.initIfNeeded();
    const loaded = await restartRepo.get('main');

    expect(loaded?.nodes).toEqual([{ id: 'start', template: 'trigger' }]);
    expect(await pathExists(path.join(legacyPath, 'datasets', 'fs-restart', 'nodes', 'start.yaml'))).toBe(true);
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

function makeConfig(
  graphPath: string,
  opts: { dataset?: string; autoMigrate?: boolean; explicit?: boolean } = {},
): ConfigService {
  const dataset = opts.dataset ?? 'fs-test';
  const parsed = configSchema.parse({
    ...baseConfigEnv,
    graphDataPath: graphPath,
    graphDataset: dataset,
    graphAutoMigrate: opts.autoMigrate ?? false,
  });
  return new ConfigService().init(parsed, { graphDatasetExplicit: opts.explicit ?? true });
}

async function seedGraph(basePath: string, dataset = 'fs-test'): Promise<string> {
  const repo = new FsGraphRepository(makeConfig(basePath, { dataset }), templateRegistryStub);
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
  return path.join(basePath, 'datasets', dataset);
}
