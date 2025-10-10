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
    const lockDir = path.join(tmp, 'graphs', 'main');
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(path.join(lockDir, '.lock'), 'held');
    await expect(short.upsert({ name: 'main', version: 0, nodes: [], edges: [] } as any)).rejects.toMatchObject({ code: 'LOCK_TIMEOUT' });
  });

  it('recovers from a corrupt write by restoring last committed version on read', async () => {
    // Ensure we have a committed state
    const before = await svc.get('main');
    const fs = await import('fs/promises');
    const corruptPath = path.join(tmp, 'graphs', 'main', 'graph.json');
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
});
