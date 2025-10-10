import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    // Provide explicit ports so edges using sourceHandle 'out' and targetHandle 'in' validate
    registry.register(
      'noop',
      async () => ({ setConfig: () => {} } as any),
      { sourcePorts: { out: { kind: 'instance' } }, targetPorts: { in: { kind: 'instance' } } },
      { title: 'Noop', kind: 'tool' },
    );
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
    const saved = await svc.upsert(
      { name: 'main', version: before?.version ?? 0, nodes: [{ id: 'n1', template: 'noop' }], edges: [] },
      { name: 'Tester', email: 'tester@example.com' },
    );
    expect(saved.version).toBe((before?.version ?? 0) + 1);
    const again = await svc.get('main');
    expect(again?.nodes.length).toBe(1);
    // Verify commit author and branch reflect configuration
    const { spawn } = await import('child_process');
    const exec = (args: string[]) => new Promise<string>((resolve, reject) => {
      const child = spawn('git', args, { cwd: tmp });
      let out = '';
      child.stdout?.on('data', (d) => (out += d.toString()));
      child.on('exit', (c) => (c === 0 ? resolve(out) : reject(new Error('git failed'))));
    });
    const branch = (await exec(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    expect(branch).toBe('graph-state');
    const lastAuthor = (await exec(['log', '-1', '--pretty=%an <%ae>'])).trim();
    expect(lastAuthor).toBe('Tester <tester@example.com>');
  });

  it('returns conflict on mismatched version', async () => {
    await svc.upsert({ name: 'main', version: 0, nodes: [{ id: 'n', template: 'noop' }], edges: [] });
    await expect(svc.upsert({ name: 'main', version: 0, nodes: [], edges: [] } as any)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('advisory lock times out when held by another writer', async () => {
    // Create a service with short lock timeout
    const short = new GitGraphService({ repoPath: tmp, branch: 'graph-state', lockTimeoutMs: 200, defaultAuthor: { name: 'T', email: 't@example.com' } }, new NoopLogger(), registry as any);
    await short.initIfNeeded();
    // Simulate another holder by manually creating lock file
    const fs = await import('fs/promises');
    await fs.writeFile(path.join(tmp, '.graph.lock'), 'held');
    await expect(short.upsert({ name: 'main', version: 0, nodes: [], edges: [] } as any)).rejects.toMatchObject({ code: 'LOCK_TIMEOUT' });
  });

  it('recovers from a corrupt write by restoring last committed version on read', async () => {
    // Ensure we have a committed state
    const before = await svc.get('main');
    const fs = await import('fs/promises');
    const corruptPath = path.join(tmp, 'graph.meta.json');
    await fs.writeFile(corruptPath, '{ not-json');
    const recovered = await svc.get('main');
    // Should fallback to last committed version (initial v0)
    expect(recovered?.version).toBe(before?.version);
  });

  it('rolls back working tree when commit fails', async () => {
    // Spy on commit to simulate failure
    const spy = vi.spyOn<any, any>(svc as any, 'commit').mockImplementation(() => {
      const err: any = new Error('simulated commit failure');
      err.code = 'COMMIT_FAILED';
      return Promise.reject(err);
    });
    const before = await svc.get('main');
    await expect(
      svc.upsert({ name: 'main', version: before?.version ?? 0, nodes: [{ id: 'x', template: 'noop' }], edges: [] }),
    ).rejects.toMatchObject({ code: 'COMMIT_FAILED' });
    // File should still reflect last committed state
    const after = await svc.get('main');
    expect(after?.version).toBe(before?.version);
    spy.mockRestore();
  });

  it('writes per-entity files and encodes deterministic edge id in filename', async () => {
    const before = await svc.get('main');
    const saved = await svc.upsert({
      name: 'main',
      version: before?.version ?? 0,
      nodes: [
        { id: 'A node', template: 'noop' },
        { id: 'B/node', template: 'noop' },
      ],
      edges: [
        { source: 'A node', sourceHandle: 'out', target: 'B/node', targetHandle: 'in' },
      ],
    });
    expect(saved.nodes.length).toBe(2);
    expect(saved.edges.length).toBe(1);
    const fs = await import('fs/promises');
    const hasFile = async (rel: string) => !!(await fs.stat(path.join(tmp, rel)).catch(() => null));
    // Node filenames are encodeURIComponent(id)
    expect(await hasFile(path.join('nodes', `${encodeURIComponent('A node')}.json`))).toBeTruthy();
    expect(await hasFile(path.join('nodes', `${encodeURIComponent('B/node')}.json`))).toBeTruthy();
    // Edge filename uses deterministic id `${src}-${srcH}__${tgt}-${tgtH}` and is encoded
    const edgeId = `${'A node'}-${'out'}__${'B/node'}-${'in'}`;
    const edgeFile = path.join('edges', `${encodeURIComponent(edgeId)}.json`);
    expect(await hasFile(edgeFile)).toBeTruthy();
  });

  it('round-trips ids with special characters via encodeURIComponent/ decodeURIComponent', async () => {
    const before = await svc.get('main');
    const ids = ['A%20B', 'C?D#E'];
    const saved = await svc.upsert({
      name: 'main',
      version: before?.version ?? 0,
      nodes: ids.map((id) => ({ id, template: 'noop' })),
      edges: [
        { source: ids[0], sourceHandle: 'out', target: ids[1], targetHandle: 'in' },
      ],
    });
    expect(saved.nodes.map((n) => n.id)).toEqual(ids);
    const fs = await import('fs/promises');
    // files should exist and decode back to ids
    for (const id of ids) {
      const f = path.join(tmp, 'nodes', `${encodeURIComponent(id)}.json`);
      const data = JSON.parse(await fs.readFile(f, 'utf8'));
      expect(data.id).toBe(id);
    }
    const eid = `${ids[0]}-out__${ids[1]}-in`;
    const ef = path.join(tmp, 'edges', `${encodeURIComponent(eid)}.json`);
    const eData = JSON.parse(await fs.readFile(ef, 'utf8'));
    expect(eData.id).toBe(eid);
  });

  it('falls back to HEAD when an entity file is corrupt', async () => {
    // seed graph with two nodes so partial read would be detectable
    const before = await svc.upsert({ name: 'main', version: 0, nodes: [
      { id: 'nA', template: 'noop' },
      { id: 'nB', template: 'noop' },
    ], edges: [] });
    // corrupt one node file
    const fs = await import('fs/promises');
    await fs.writeFile(path.join(tmp, 'nodes', `${encodeURIComponent('nA')}.json`), '{ bad-json');
    const recovered = await svc.get('main');
    // Should fallback to last committed snapshot (before)
    expect(recovered?.nodes.length).toBe(before.nodes.length);
    expect(recovered?.version).toBe(before.version);
  });

  it('bumps version and stages only deltas', async () => {
    const first = await svc.upsert({ name: 'main', version: 0, nodes: [{ id: 'n1', template: 'noop' }], edges: [] });
    const second = await svc.upsert({ name: 'main', version: first.version, nodes: [{ id: 'n1', template: 'noop', position: { x: 1, y: 2 } }], edges: [] });
    expect(second.version).toBe(first.version + 1);
    // Confirm meta exists and node file updated
    const fs = await import('fs/promises');
    const nPath = path.join(tmp, 'nodes', `${encodeURIComponent('n1')}.json`);
    const node = JSON.parse(await fs.readFile(nPath, 'utf8'));
    expect(node.position).toEqual({ x: 1, y: 2 });
  });
});
