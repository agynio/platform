import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LoggerService } from './logger.service';
import { TemplateRegistry } from '../graph/templateRegistry';
import { PersistedGraph, PersistedGraphEdge, PersistedGraphNode, PersistedGraphUpsertRequest, PersistedGraphUpsertResponse } from '../graph/types';
import { validatePersistedGraph } from './graph.validation';

export interface GitGraphConfig {
  repoPath: string;
  branch: string; // e.g. graph-state
  defaultAuthor?: { name?: string; email?: string };
  lockTimeoutMs?: number; // advisory lock wait timeout
}

export class GitGraphService {
  constructor(
    private readonly cfg: GitGraphConfig,
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
  ) {}

  // Repo/bootstrap helpers
  async initIfNeeded(): Promise<void> {
    await fs.mkdir(this.cfg.repoPath, { recursive: true });
    const gitDir = path.join(this.cfg.repoPath, '.git');
    const exists = await this.pathExists(gitDir);
    if (!exists) {
      await this.runGit(['init', '-b', this.cfg.branch], this.cfg.repoPath);
      // Basic .gitignore
      const gi = path.join(this.cfg.repoPath, '.gitignore');
      const ignore = ['node_modules/', '*.tmp', '*.lock', '.DS_Store'];
      await fs.writeFile(gi, ignore.join('\n') + '\n', 'utf8');
      // Seed empty main graph
      const graphDir = path.join(this.cfg.repoPath, 'graphs', 'main');
      await fs.mkdir(graphDir, { recursive: true });
      const initGraph: PersistedGraph = {
        name: 'main',
        version: 0,
        updatedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
      await this.atomicWriteGraph('main', initGraph);
      await this.runGit(['add', '.'], this.cfg.repoPath);
      await this.commit('chore(graph): init repository', this.cfg.defaultAuthor);
    } else {
      // Ensure branch exists and checked out
      await this.ensureBranch(this.cfg.branch);
    }
  }

  async get(name: string): Promise<PersistedGraph | null> {
    const rel = this.relGraphPathPOSIX(name);
    try {
      const out = await this.runGitCapture(['show', `HEAD:${rel}`], this.cfg.repoPath);
      return JSON.parse(out) as PersistedGraph;
    } catch {
      return null;
    }
  }

  async upsert(
    req: PersistedGraphUpsertRequest,
    author?: { name?: string; email?: string },
  ): Promise<PersistedGraphUpsertResponse> {
    validatePersistedGraph(req, this.templateRegistry.toSchema());

    const name = req.name;
    const lock = await this.acquireLock(name);
    try {
      const existing = await this.get(name);
      const nowIso = new Date().toISOString();
      if (!existing) {
        if (req.version !== undefined && req.version !== 0) {
          const err: any = new Error('Version conflict');
          err.code = 'VERSION_CONFLICT';
          err.current = {
            name,
            version: 0,
            updatedAt: nowIso,
            nodes: [],
            edges: [],
          } satisfies PersistedGraph;
          throw err;
        }
        const created: PersistedGraph = {
          name,
          version: 1,
          updatedAt: nowIso,
          nodes: req.nodes.map(this.stripInternalNode),
          edges: req.edges.map(this.stripInternalEdge),
        };
        await this.atomicWriteGraph(name, created);
        await this.runGit(['add', this.relGraphPathPOSIX(name)], this.cfg.repoPath);
        const deltaMsg = this.deltaSummary({ nodes: [], edges: [] }, created);
        try {
          await this.commit(`chore(graph): ${name} v${created.version} ${deltaMsg}`, author ?? this.cfg.defaultAuthor);
        } catch (e: any) {
          // Rollback: unstage and remove the newly created file
          await this.safeUnstage(this.relGraphPathPOSIX(name));
          await this.rollbackFile(name, /*hadExisting*/ false);
          const err: any = e instanceof Error ? e : new Error(String(e));
          err.code = 'COMMIT_FAILED';
          throw err;
        }
        return created;
      }

      if (req.version !== undefined && req.version !== existing.version) {
        const err: any = new Error('Version conflict');
        err.code = 'VERSION_CONFLICT';
        err.current = existing;
        throw err;
      }

      const updated: PersistedGraph = {
        name,
        version: (existing?.version || 0) + 1,
        updatedAt: nowIso,
        nodes: req.nodes.map(this.stripInternalNode),
        edges: req.edges.map(this.stripInternalEdge),
      };
      await this.atomicWriteGraph(name, updated);
      await this.runGit(['add', this.relGraphPathPOSIX(name)], this.cfg.repoPath);
      const deltaMsg = this.deltaSummary(existing, updated);
      try {
        await this.commit(`chore(graph): ${name} v${updated.version} ${deltaMsg}`, author ?? this.cfg.defaultAuthor);
      } catch (e: any) {
        // Rollback: unstage and restore last committed version
        await this.safeUnstage(this.relGraphPathPOSIX(name));
        await this.rollbackFile(name, /*hadExisting*/ true);
        const err: any = e instanceof Error ? e : new Error(String(e));
        err.code = 'COMMIT_FAILED';
        throw err;
      }
      return updated;
    } finally {
      await this.releaseLock(name, lock);
    }
  }

  // Internal helpers
  // Validation is shared via validatePersistedGraph

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    return { id: n.id, template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, position: n.position };
  }
  private stripInternalEdge(e: PersistedGraphEdge): PersistedGraphEdge {
    return { source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, id: e.id };
  }

  private relGraphPathPOSIX(name: string) {
    return path.posix.join('graphs', name, 'graph.json');
  }
  private graphJsonPath(name: string) {
    return path.join(this.cfg.repoPath, 'graphs', name, 'graph.json');
  }

  private async atomicWriteGraph(name: string, data: PersistedGraph) {
    const filePath = this.graphJsonPath(name);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.graph.json.tmp-${process.pid}-${Date.now()}`);
    const fd = await fs.open(tmp, 'w');
    try {
      await fd.writeFile(JSON.stringify(data, null, 2));
      await fd.sync();
    } finally {
      await fd.close();
    }
    await fs.rename(tmp, filePath);
    // fsync directory
    try {
      const dfd = await fs.open(dir, 'r');
      try { await dfd.sync(); } finally { await dfd.close(); }
    } catch {}
  }

  private async pathExists(p: string) {
    try { await fs.stat(p); return true; } catch { return false; }
  }

  private runGit(args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()))
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
      });
    });
  }

  private runGitCapture(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd });
      let stderr = '';
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
      });
    });
  }

  private async ensureBranch(branch: string) {
    // Try to checkout branch; if missing, create
    try {
      await this.runGit(['rev-parse', '--verify', branch], this.cfg.repoPath);
    } catch {
      await this.runGit(['branch', branch], this.cfg.repoPath);
    }
    await this.runGit(['checkout', branch], this.cfg.repoPath);
  }

  private commit(message: string, author?: { name?: string; email?: string }): Promise<void> {
    const env = { ...process.env };
    if (author?.name) env.GIT_AUTHOR_NAME = author.name;
    if (author?.email) env.GIT_AUTHOR_EMAIL = author.email;
    if (author?.name) env.GIT_COMMITTER_NAME = author.name;
    if (author?.email) env.GIT_COMMITTER_EMAIL = author.email;
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['commit', '-m', message], { cwd: this.cfg.repoPath, env });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git commit failed: ${stderr}`));
      });
    });
  }

  private deltaSummary(before: Pick<PersistedGraph, 'nodes' | 'edges'>, after: Pick<PersistedGraph, 'nodes' | 'edges'>) {
    const dn = after.nodes.length - (before.nodes?.length || 0);
    const de = after.edges.length - (before.edges?.length || 0);
    const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    return `(${sign(dn)} nodes, ${sign(de)} edges)`;
  }

  private async safeUnstage(relPosix: string) {
    try { await this.runGit(['restore', '--staged', relPosix], this.cfg.repoPath); } catch {}
  }

  private async rollbackFile(name: string, hadExisting: boolean) {
    const rel = this.relGraphPathPOSIX(name);
    const abs = this.graphJsonPath(name);
    if (hadExisting) {
      // Restore worktree from HEAD
      try {
        await this.runGit(['restore', '--worktree', '--source', 'HEAD', rel], this.cfg.repoPath);
      } catch {
        // Fallback to checkout if restore unsupported
        try { await this.runGit(['checkout', '--', rel], this.cfg.repoPath); } catch {}
      }
    } else {
      // Remove the new file created before commit
      try { await fs.unlink(abs); } catch {}
    }
  }

  // Advisory lock implementation via graphs/<name>/.lock
  private async acquireLock(name: string) {
    const lockDir = path.join(this.cfg.repoPath, 'graphs', name);
    await fs.mkdir(lockDir, { recursive: true });
    const lockPath = path.join(lockDir, '.lock');
    const timeout = this.cfg.lockTimeoutMs ?? 5000;
    const start = Date.now();
    while (true) {
      try {
        const fd = await fs.open(lockPath, 'wx');
        // write pid and time for debugging
        await fd.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        await fd.close();
        return { lockPath };
      } catch (e) {
        if ((e as any).code === 'EEXIST') {
          if (Date.now() - start > timeout) {
            const err: any = new Error('Lock timeout');
            err.code = 'LOCK_TIMEOUT';
            throw err;
          }
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        throw e;
      }
    }
  }

  private async releaseLock(name: string, handle: { lockPath: string } | null | undefined) {
    if (!handle) return;
    try {
      await fs.unlink(handle.lockPath);
    } catch {}
  }
}
