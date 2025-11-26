import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { GitGraphRepository } from '../src/graph/gitGraph.repository';
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
  edges: [
    { source: 'trigger', sourceHandle: 'out', target: 'agent', targetHandle: 'in' },
  ],
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

function createConfig(
  graphRepoPath: string,
  overrides?: Partial<Pick<ConfigService, 'graphBranch'>>,
): ConfigService {
  const base = {
    graphRepoPath,
    graphBranch: overrides?.graphBranch ?? 'graph-state',
    graphAuthorName: 'Casey Quinn',
    graphAuthorEmail: 'casey@example.com',
    graphLockTimeoutMs: 1000,
  } as const;
  return base as unknown as ConfigService;
}

describe('GitGraphRepository YAML storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-yaml-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('writes YAML files by default', async () => {
    const repo = new GitGraphRepository(createConfig(tempDir), createTemplateRegistry());

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    const metaYaml = path.join(tempDir, 'graph.meta.yaml');
    const metaJson = path.join(tempDir, 'graph.meta.json');
    const nodeYaml = path.join(tempDir, 'nodes', 'trigger.yaml');
    const nodeJson = path.join(tempDir, 'nodes', 'trigger.json');
    const edgeYaml = path.join(tempDir, 'edges', `${encodeURIComponent('trigger-out__agent-in')}.yaml`);
    const edgeJson = path.join(tempDir, 'edges', `${encodeURIComponent('trigger-out__agent-in')}.json`);
    const varsYaml = path.join(tempDir, 'variables.yaml');
    const varsJson = path.join(tempDir, 'variables.json');

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
    const repo = new GitGraphRepository(createConfig(tempDir), createTemplateRegistry());

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    // Drop malformed JSON files; repository should ignore them entirely
    await fs.writeFile(path.join(tempDir, 'graph.meta.json'), '{ invalid json', 'utf8');
    await fs.writeFile(path.join(tempDir, 'nodes', 'trigger.json'), '{ invalid json', 'utf8');

    const stored = await repo.get('main');
    expect(stored?.version).toBeGreaterThan(0);
    expect(stored?.nodes).toHaveLength(2);
    expect(await pathExists(path.join(tempDir, 'graph.meta.yaml'))).toBe(true);
  });
});
