import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LoggerService } from './logger.service';
import { TemplateRegistry } from '../graph/templateRegistry';
import {
  PersistedGraph,
  PersistedGraphEdge,
  PersistedGraphNode,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
  TemplateNodeSchema,
} from '../graph/types';

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
    const p = this.graphJsonPath(name);
    if (!(await this.pathExists(p))) return null;
    try {
      const txt = await fs.readFile(p, 'utf8');
      const parsed = JSON.parse(txt) as PersistedGraph;
      return parsed;
    } catch (e) {
      this.logger.error('Failed reading graph json: %s', (e as Error).message);
      // Attempt last committed version via git checkout -- or simply surface null
      return null;
    }
  }

  async upsert(req: PersistedGraphUpsertRequest & { authorName?: string; authorEmail?: string }): Promise<PersistedGraphUpsertResponse> {
    const schema = this.templateRegistry.toSchema();
    this.validate(req, schema);

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
        await this.runGit(['add', this.relGraphPath(name)], this.cfg.repoPath);
        const deltaMsg = this.deltaSummary({ nodes: [], edges: [] }, created);
        await this.commit(`chore(graph): ${name} v${created.version} ${deltaMsg}`, this.authorFrom(req));
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
      await this.runGit(['add', this.relGraphPath(name)], this.cfg.repoPath);
      const deltaMsg = this.deltaSummary(existing, updated);
      await this.commit(`chore(graph): ${name} v${updated.version} ${deltaMsg}`, this.authorFrom(req));
      return updated;
    } finally {
      await this.releaseLock(name, lock);
    }
  }

  // Internal helpers
  private validate(req: PersistedGraphUpsertRequest, schema: TemplateNodeSchema[]) {
    const templateSet = new Set(schema.map((s) => s.name));
    const schemaMap = new Map(schema.map((s) => [s.name, s] as const));
    const nodeIds = new Set<string>();
    for (const n of req.nodes) {
      if (!n.id) throw new Error(`Node missing id`);
      if (nodeIds.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
      nodeIds.add(n.id);
      if (!templateSet.has(n.template)) throw new Error(`Unknown template ${n.template}`);
    }
    for (const e of req.edges) {
      if (!nodeIds.has(e.source)) throw new Error(`Edge source missing node ${e.source}`);
      if (!nodeIds.has(e.target)) throw new Error(`Edge target missing node ${e.target}`);
      const sourceNode = req.nodes.find((n) => n.id === e.source)!;
      const targetNode = req.nodes.find((n) => n.id === e.target)!;
      const sourceSchema = schemaMap.get(sourceNode.template)!;
      const targetSchema = schemaMap.get(targetNode.template)!;
      if (!sourceSchema.sourcePorts.includes(e.sourceHandle)) {
        throw new Error(`Invalid source handle ${e.sourceHandle} on template ${sourceNode.template}`);
      }
      if (!targetSchema.targetPorts.includes(e.targetHandle)) {
        throw new Error(`Invalid target handle ${e.targetHandle} on template ${targetNode.template}`);
      }
    }
  }

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    return { id: n.id, template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, position: n.position };
  }
  private stripInternalEdge(e: PersistedGraphEdge): PersistedGraphEdge {
    return { source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, id: e.id };
  }

  private relGraphPath(name: string) {
    return path.join('graphs', name, 'graph.json');
  }
  private graphJsonPath(name: string) {
    return path.join(this.cfg.repoPath, this.relGraphPath(name));
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

  private authorFrom(req: { authorName?: string; authorEmail?: string }): { name?: string; email?: string } {
    return {
      name: req.authorName || this.cfg.defaultAuthor?.name,
      email: req.authorEmail || this.cfg.defaultAuthor?.email,
    };
  }

  private deltaSummary(before: Pick<PersistedGraph, 'nodes' | 'edges'>, after: Pick<PersistedGraph, 'nodes' | 'edges'>) {
    const dn = after.nodes.length - (before.nodes?.length || 0);
    const de = after.edges.length - (before.edges?.length || 0);
    const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    return `(${sign(dn)} nodes, ${sign(de)} edges)`;
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

