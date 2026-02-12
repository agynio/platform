import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { FsGraphRepository } from '../src/graph/fsGraph.repository';
import type { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { ConfigService } from '../src/core/services/config.service';

const schema = [
  { name: 'trigger', title: 'Trigger', kind: 'trigger', sourcePorts: ['out'], targetPorts: [] },
  { name: 'agent', title: 'Agent', kind: 'agent', sourcePorts: [], targetPorts: ['in'] },
] as const;

const defaultGraph = {
  name: 'main',
  version: 0,
  nodes: [
    { id: 'trigger', template: 'trigger', position: { x: 0, y: 0 } },
    { id: 'agent', template: 'agent', position: { x: 1, y: 1 } },
  ],
  edges: [{ source: 'trigger', sourceHandle: 'out', target: 'agent', targetHandle: 'in' }],
  variables: [{ key: 'env', value: 'prod' }],
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function createTemplateRegistry(): TemplateRegistry {
  return {
    toSchema: vi.fn().mockResolvedValue(schema),
  } as unknown as TemplateRegistry;
}

function createConfig(graphRepoPath: string): ConfigService {
  const base = {
    graphRepoPath,
    graphLockTimeoutMs: 1000,
  } as const;
  return base as unknown as ConfigService;
}

describe('FsGraphRepository YAML storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-yaml-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function repoPath(...segments: string[]): string {
    return path.join(tempDir, ...segments);
  }

  it('writes YAML files by default', async () => {
    const repo = new FsGraphRepository(createConfig(tempDir), createTemplateRegistry());

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    const metaYaml = repoPath('graph.meta.yaml');
    const metaJson = repoPath('graph.meta.json');
    const nodeYaml = repoPath('nodes', 'trigger.yaml');
    const nodeJson = repoPath('nodes', 'trigger.json');
    const edgeYaml = repoPath('edges', `${encodeURIComponent('trigger-out__agent-in')}.yaml`);
    const edgeJson = repoPath('edges', `${encodeURIComponent('trigger-out__agent-in')}.json`);
    const varsYaml = repoPath('variables.yaml');
    const varsJson = repoPath('variables.json');

    expect(await pathExists(metaYaml)).toBe(true);
    expect(await pathExists(metaJson)).toBe(false);
    expect(await pathExists(nodeYaml)).toBe(true);
    expect(await pathExists(nodeJson)).toBe(false);
    expect(await pathExists(edgeYaml)).toBe(true);
    expect(await pathExists(edgeJson)).toBe(false);
    expect(await pathExists(varsYaml)).toBe(true);
    expect(await pathExists(varsJson)).toBe(false);

    const stored = await repo.get('main');
    expect(stored?.nodes).toHaveLength(2);
    expect(stored?.edges).toHaveLength(1);
    expect(stored?.variables?.[0]).toEqual({ key: 'env', value: 'prod' });
  });

  it('ignores legacy JSON files in working tree', async () => {
    const repo = new FsGraphRepository(createConfig(tempDir), createTemplateRegistry());

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    await fs.writeFile(repoPath('graph.meta.json'), '{ invalid json', 'utf8');
    await fs.writeFile(repoPath('nodes', 'trigger.json'), '{ invalid json', 'utf8');

    const stored = await repo.get('main');
    expect(stored?.version).toBeGreaterThan(0);
    expect(stored?.nodes).toHaveLength(2);
    expect(await pathExists(repoPath('graph.meta.yaml'))).toBe(true);
  });
});
