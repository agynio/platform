import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { GitGraphService } from '../src/services/gitGraph.service';
import { LoggerService } from '../src/services/logger.service';
import { TemplateRegistry } from '../src/graph/templateRegistry';

class NoopLogger extends LoggerService {
  info() {}
  debug() {}
  error() {}
}

describe('GitGraphService', () => {
  let tmp: string;
  let svc: GitGraphService;
  let registry: TemplateRegistry;

  beforeEach(async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'graph-git-'));
    registry = new TemplateRegistry();
    // register minimal template referenced by tests
    registry.register('noop', async () => ({ setConfig: ()=>{} } as any), { sourcePorts: {}, targetPorts: {} }, { title: 'Noop', kind: 'tool' });
    svc = new GitGraphService({ repoPath: tmp, branch: 'graph-state', defaultAuthor: { name: 'Test', email: 't@example.com' } }, new NoopLogger(), registry as any);
    await svc.initIfNeeded();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('initializes repo and seeds main', async () => {
    const g = await svc.get('main');
    expect(g).toBeTruthy();
    expect(g?.version).toBe(0);
    expect(g?.nodes.length).toBe(0);
  });

  it('upserts with optimistic locking and commits', async () => {
    const before = await svc.get('main');
    const saved = await svc.upsert({ name: 'main', version: before?.version ?? 0, nodes: [{ id: 'n1', template: 'noop' }], edges: [] });
    expect(saved.version).toBe((before?.version ?? 0) + 1);
    const again = await svc.get('main');
    expect(again?.nodes.length).toBe(1);
  });

  it('returns conflict on mismatched version', async () => {
    await svc.upsert({ name: 'main', version: 0, nodes: [{ id: 'n', template: 'noop' }], edges: [] });
    await expect(svc.upsert({ name: 'main', version: 0, nodes: [], edges: [] } as any)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});

