import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import type {
  PersistedGraph,
  PersistedGraphEdge,
  PersistedGraphNode,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../shared/types/graph.types';
import { validatePersistedGraph } from './graphSchema.validator';
import { GraphRepository } from './graph.repository';
import { ConfigService } from '../core/services/config.service';
import { parseYaml, stringifyYaml } from './yaml.util';

// Narrow meta persisted at repo root
interface GraphMeta {
  name: string;
  version: number;
  updatedAt: string;
  format: 2;
}

type TouchedSets = {
  added: Set<string>;
  updated: Set<string>;
  deleted: Set<string>;
};

// Typed error helper to avoid any
type CodeError<T = unknown> = Error & { code: string; current?: T };
function codeError<T = unknown>(code: string, message: string, current?: T): CodeError<T> {
  const e = new Error(message) as CodeError<T>;
  e.code = code;
  if (current !== undefined) e.current = current;
  return e;
}

export class GitGraphRepository extends GraphRepository {
  constructor(
    private readonly config: ConfigService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    super();
  }

  // Cache of last successfully committed snapshot to tolerate partial/corrupt working tree reads
  private lastCommitted?: PersistedGraph;

  // Repo/bootstrap helpers
  async initIfNeeded(): Promise<void> {
    await fs.mkdir(this.config.graphRepoPath, { recursive: true });
    const gitDir = path.join(this.config.graphRepoPath, '.git');
    const exists = await this.pathExists(gitDir);
    if (!exists) {
      await this.runGit(['init', '-b', this.config.graphBranch], this.config.graphRepoPath);
      // Basic .gitignore
      const gi = path.join(this.config.graphRepoPath, '.gitignore');
      const ignore = ['node_modules/', '*.tmp', '*.lock', '.DS_Store'];
      await fs.writeFile(gi, ignore.join('\n') + '\n', 'utf8');
      // Seed root-level single-graph layout (format:2)
      await fs.mkdir(path.join(this.config.graphRepoPath, 'nodes'), { recursive: true });
      await fs.mkdir(path.join(this.config.graphRepoPath, 'edges'), { recursive: true });
      const meta = { name: 'main', version: 0, updatedAt: new Date().toISOString(), format: 2 };
      await this.atomicWriteFile(path.join(this.config.graphRepoPath, this.metaPath()), stringifyYaml(meta));
      await this.runGit(['add', '.'], this.config.graphRepoPath);
      await this.commit('chore(graph): init repository (format:2)', this.defaultAuthor());
    } else {
      // Ensure branch exists and checked out
      await this.ensureBranch(this.config.graphBranch);
    }
  }

  async get(name: string): Promise<PersistedGraph | null> {
    // Prefer root-level per-entity layout in working tree; recover from HEAD if corrupt
    try {
      const metaPath = path.join(this.config.graphRepoPath, this.metaPath());
      if (await this.pathExists(metaPath)) {
        return await this.readFromWorkingTreeRoot(name);
      }
    } catch {
      // ignore and try HEAD fallbacks
    }
    // If working tree failed or absent, prefer the last committed snapshot if available (should match HEAD)
    if (this.lastCommitted) return this.lastCommitted;
    const headRoot = await this.readFromHeadRoot(name);
    if (headRoot) return headRoot;
    const headPerGraph = await this.readFromHeadPerGraph(name);
    if (headPerGraph) return headPerGraph;
    const headMonolith = await this.readFromHeadMonolith(name);
    if (headMonolith) return headMonolith;
    return null;
  }

  async upsert(
    req: PersistedGraphUpsertRequest,
    author?: { name?: string; email?: string },
  ): Promise<PersistedGraphUpsertResponse> {
    validatePersistedGraph(req, await this.templateRegistry.toSchema());

    const name = req.name;
    const lock = await this.acquireLock();
    try {
      const existing = await this.get(name);
      const nowIso = new Date().toISOString();
      if (!existing) {
        if (req.version !== undefined && req.version !== 0) {
          throw codeError<PersistedGraph>('VERSION_CONFLICT', 'Version conflict', {
            name,
            version: 0,
            updatedAt: nowIso,
            nodes: [],
            edges: [],
          });
        }
      } else if (req.version !== undefined && req.version !== existing.version) {
        throw codeError<PersistedGraph>('VERSION_CONFLICT', 'Version conflict', existing);
      }

      // Normalize nodes and edges; enforce deterministic edge id
      // Preserve existing node.state when the incoming payload omits it
      const normalizedNodes = req.nodes.map((n) => {
        const out = this.stripInternalNode(n);
        if (out.state === undefined && existing) {
          const prev = existing.nodes.find((p) => p.id === out.id);
          if (prev && prev.state !== undefined) out.state = prev.state;
        }
        return out;
      });
      const normalizedEdges = req.edges.map((e) => {
        const base = this.stripInternalEdge(e);
        const detId = this.edgeId(base);
        if (base.id && base.id !== detId) {
          throw codeError('EDGE_ID_MISMATCH', `Edge id mismatch: expected ${detId} got ${base.id}`);
        }
        return { ...base, id: detId };
      });

      const current = existing ?? { name, version: 0, updatedAt: nowIso, nodes: [], edges: [], variables: [] };
      const target: PersistedGraph = {
        name,
        version: (current.version || 0) + 1,
        updatedAt: nowIso,
        nodes: normalizedNodes,
        edges: normalizedEdges,
        // Preserve existing variables if omitted; otherwise accept provided variables
        variables:
          req.variables === undefined
            ? current.variables
            : req.variables.map((v) => ({ key: String(v.key), value: String(v.value) })),
      };

      // Compute deltas
      const { nodeAdds, nodeUpdates, nodeDeletes } = this.diffNodes(current.nodes, target.nodes);
      const { edgeAdds, edgeUpdates, edgeDeletes } = this.diffEdges(current.edges, target.edges);

      const root = this.config.graphRepoPath;
      const nodesDir = path.join(root, 'nodes');
      const edgesDir = path.join(root, 'edges');
      await fs.mkdir(nodesDir, { recursive: true });
      await fs.mkdir(edgesDir, { recursive: true });

      const touched: TouchedSets = {
        added: new Set<string>(),
        updated: new Set<string>(),
        deleted: new Set<string>(),
      };

      const writeNode = async (n: PersistedGraphNode, isNew: boolean) => {
        const relPath = this.nodePath(n.id);
        await this.writeYamlEntity(relPath, n, isNew, touched);
      };

      const writeEdge = async (e: PersistedGraphEdge, isNew: boolean) => {
        const id = e.id!;
        const payload = { ...e, id };
        const relPath = this.edgePath(id);
        await this.writeYamlEntity(relPath, payload, isNew, touched);
      };

      const deleteNodeFiles = async (id: string) => {
        const relPath = this.nodePath(id);
        await this.removeGraphPath(relPath, touched);
      };

      const deleteEdgeFiles = async (id: string) => {
        const relPath = this.edgePath(id);
        await this.removeGraphPath(relPath, touched);
      };

      await Promise.all(nodeAdds.map((id) => writeNode(target.nodes.find((n) => n.id === id)!, true)));
      await Promise.all(nodeUpdates.map((id) => writeNode(target.nodes.find((n) => n.id === id)!, false)));
      await Promise.all(nodeDeletes.map((id) => deleteNodeFiles(id)));

      await Promise.all(edgeAdds.map((id) => writeEdge(target.edges.find((e) => e.id === id)!, true)));
      await Promise.all(edgeUpdates.map((id) => writeEdge(target.edges.find((e) => e.id === id)!, false)));
      await Promise.all(edgeDeletes.map((id) => deleteEdgeFiles(id)));

      // Write variables (root-level); compare previous vs next JSON to avoid unnecessary writes
      const prevVarsJson = JSON.stringify(current.variables ?? [], null, 2);
      const nextVarsJson = JSON.stringify(target.variables ?? [], null, 2);
      if (prevVarsJson !== nextVarsJson) {
        const relPath = this.variablesPath();
        const varsIsNew = !(await this.yamlPathExists(relPath));
        await this.writeYamlEntity(relPath, target.variables ?? [], varsIsNew, touched);
      }

      // Update meta last
      const meta = { name, version: target.version, updatedAt: target.updatedAt, format: 2 } as const;
      await this.writeYamlEntity(this.metaPath(), meta, false, touched);

      const toStage = new Set<string>();
      for (const rel of touched.added) toStage.add(rel);
      for (const rel of touched.updated) toStage.add(rel);
      for (const rel of touched.deleted) toStage.add(rel);
      if (toStage.size) await this.runGit(['add', '--all', ...toStage], root);

      // Remove legacy graphs/ directory if exists
      if (await this.pathExists(path.join(root, 'graphs'))) {
        try {
          await this.runGit(['rm', '-r', '--ignore-unmatch', 'graphs'], root);
        } catch {
          try {
            await fs.rm(path.join(root, 'graphs'), { recursive: true, force: true });
          } catch {
            // ignore fallback removal errors
          }
        }
      }

      const deltaMsg = this.deltaSummaryDetailed({ before: current, after: target });
      try {
        await this.commit(`chore(graph): v${target.version} ${deltaMsg}`, author ?? this.defaultAuthor());
        // Update in-memory snapshot after successful commit
        this.lastCommitted = JSON.parse(JSON.stringify(target)) as PersistedGraph;
      } catch (e: unknown) {
        await this.rollbackPaths(touched);
        const msg = e instanceof Error ? e.message : String(e);
        throw codeError('COMMIT_FAILED', msg);
      }
      return target;
    } finally {
      await this.releaseLock(lock);
    }
  }

  // Upsert partial state for a single node without altering other fields
  async upsertNodeState(name: string, nodeId: string, patch: Record<string, unknown>): Promise<void> {
    const current = await this.get(name);
    const base = current ?? { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] };
    const nodes = Array.from(base.nodes || []);
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) nodes[idx] = { ...nodes[idx], state: patch } as PersistedGraphNode;
    else nodes.push({ id: nodeId, template: 'unknown', state: patch } as PersistedGraphNode);
    await this.upsert({ name, version: base.version, nodes, edges: base.edges }, undefined);
  }

  // Internal helpers
  // Validation is shared via validatePersistedGraph

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    return {
      id: n.id,
      template: n.template,
      config: n.config,
      state: n.state,
      position: n.position,
    };
  }
  private stripInternalEdge(e: PersistedGraphEdge): PersistedGraphEdge {
    return { source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, id: e.id };
  }

  private async atomicWriteFile(filePath: string, content: string) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
    const fd = await fs.open(tmp, 'w');
    try {
      await fd.writeFile(content);
      await fd.sync();
    } finally {
      await fd.close();
    }
    await fs.rename(tmp, filePath);
    try {
      const dfd = await fs.open(dir, 'r');
      try {
        await dfd.sync();
      } finally {
        await dfd.close();
      }
    } catch {
      // ignore directory sync errors
    }
  }

  private async pathExists(p: string) {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private runGit(args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd });
      let stderr = '';
      child.stderr.on('data', (d: unknown) => {
        const s = Buffer.isBuffer(d) ? d.toString('utf8') : String(d);
        stderr += s;
      });
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
      child.stdout.on('data', (d: unknown) => {
        const s = Buffer.isBuffer(d) ? d.toString('utf8') : String(d);
        stdout += s;
      });
      child.stderr.on('data', (d: unknown) => {
        const s = Buffer.isBuffer(d) ? d.toString('utf8') : String(d);
        stderr += s;
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git ${args.join(' ')} failed: ${stderr}`));
      });
    });
  }

  private async ensureBranch(branch: string) {
    // Try to checkout branch; if missing, create
    const root = this.config.graphRepoPath;
    try {
      await this.runGit(['rev-parse', '--verify', branch], root);
      await this.runGit(['checkout', branch], root);
      return;
    } catch {
      // branch missing or HEAD unborn; fall through to create/attach
    }

    try {
      await this.runGit(['checkout', '-B', branch], root);
    } catch (err) {
      try {
        await this.runGit(['checkout', '--orphan', branch], root);
      } catch {
        throw err;
      }
    }
  }

  private commit(message: string, author?: { name?: string; email?: string }): Promise<void> {
    // Prefer CLI args over env: --author and -c user.name/email for committer
    const args: string[] = [];
    const defaults = this.defaultAuthor();
    const committerName = defaults.name;
    const committerEmail = defaults.email;
    if (committerName) args.push('-c', `user.name=${committerName}`);
    if (committerEmail) args.push('-c', `user.email=${committerEmail}`);
    args.push('commit');
    const resolvedAuthor = {
      name: (author?.name ?? committerName)?.trim() || committerName,
      email: (author?.email ?? committerEmail)?.trim() || committerEmail,
    };
    args.push('--author', `${resolvedAuthor.name} <${resolvedAuthor.email}>`);
    args.push('-m', message);
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd: this.config.graphRepoPath });
      let stderr = '';
      child.stderr.on('data', (d: unknown) => {
        const s = Buffer.isBuffer(d) ? d.toString('utf8') : String(d);
        stderr += s;
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git commit failed: ${stderr}`));
      });
    });
  }

  private deltaSummary(
    before: Pick<PersistedGraph, 'nodes' | 'edges'>,
    after: Pick<PersistedGraph, 'nodes' | 'edges'>,
  ) {
    const dn = after.nodes.length - (before.nodes?.length || 0);
    const de = after.edges.length - (before.edges?.length || 0);
    const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    return `(${sign(dn)} nodes, ${sign(de)} edges)`;
  }

  private deltaSummaryDetailed({ before, after }: { before: PersistedGraph; after: PersistedGraph }) {
    const nd = this.diffNodes(before.nodes, after.nodes);
    const ed = this.diffEdges(before.edges, after.edges);
    const fmt = (adds: string[], upds: string[], dels: string[]) =>
      `add:${adds.length},upd:${upds.length},del:${dels.length}`;
    return `(+${nd.nodeAdds.length}/-${nd.nodeDeletes.length} nodes, +${ed.edgeAdds.length}/-${ed.edgeDeletes.length} edges; changed: nodes=[${fmt(nd.nodeAdds, nd.nodeUpdates, nd.nodeDeletes)}], edges=[${fmt(ed.edgeAdds, ed.edgeUpdates, ed.edgeDeletes)}])`;
  }

  private async rollbackPaths(touched: TouchedSets) {
    const updated = Array.from(touched.updated);
    const deleted = Array.from(touched.deleted);
    const added = Array.from(touched.added);
    const toRestore = [...updated, ...deleted];
    await Promise.all(
      toRestore.map(async (rel) => {
        try {
          await this.runGit(['restore', '--worktree', '--source', 'HEAD', rel], this.config.graphRepoPath);
        } catch {
          // ignore restore errors
        }
        try {
          await this.runGit(['restore', '--staged', '--source', 'HEAD', rel], this.config.graphRepoPath);
        } catch {
          // ignore restore errors
        }
      }),
    );
    await Promise.all(
      added.map(async (rel) => {
        try {
          await this.runGit(['restore', '--staged', '--source', 'HEAD', rel], this.config.graphRepoPath);
        } catch {
          // ignore restore errors
        }
        try {
          await fs.unlink(path.join(this.config.graphRepoPath, rel));
        } catch {
          // ignore unlink errors
        }
      }),
    );
  }

  // Advisory lock: repo-root .graph.lock
  private async acquireLock() {
    const lockPath = path.join(this.config.graphRepoPath, '.graph.lock');
    const timeout = this.config.graphLockTimeoutMs ?? 5000;
    const start = Date.now();
    while (true) {
      try {
        const fd = await fs.open(lockPath, 'wx');
        // write pid and time for debugging
        await fd.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        await fd.close();
        return { lockPath };
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        const isExists = !!(err && err.code === 'EEXIST');
        if (!isExists) throw e;
        if (Date.now() - start > timeout) throw codeError('LOCK_TIMEOUT', 'Lock timeout');
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  private async releaseLock(handle: { lockPath: string } | null | undefined) {
    if (!handle) return;
    try {
      await fs.unlink(handle.lockPath);
    } catch {
      // ignore unlink errors on release
    }
  }

  // Root-level readers and fallbacks
  private async readFromWorkingTreeRoot(name: string): Promise<PersistedGraph> {
    try {
      const meta = await this.readMetaFromWorkingTree(name);
      const nodesRes = await this.readEntitiesFromDir<PersistedGraphNode>(
        path.join(this.config.graphRepoPath, 'nodes'),
      );
      const edgesRes = await this.readEntitiesFromDir<PersistedGraphEdge>(
        path.join(this.config.graphRepoPath, 'edges'),
      );
      const variables = await this.readVariablesFromWorkingTree();
      if (nodesRes.hadError || edgesRes.hadError) {
        // Prefer lastCommitted snapshot if available; otherwise fall back to HEAD
        if (this.lastCommitted) return this.lastCommitted;
        const head = await this.readFromHeadRoot(name);
        if (head) return head;
      }
      return {
        name: meta.name,
        version: meta.version,
        updatedAt: meta.updatedAt,
        nodes: nodesRes.items,
        edges: edgesRes.items,
        variables,
      };
    } catch {
      const head = await this.readFromHeadRoot(name);
      if (head) return head;
      throw new Error('Failed to read working tree root layout');
    }
  }

  private async readEntitiesFromDir<T extends { id?: string }>(
    dir: string,
  ): Promise<{ items: T[]; hadError: boolean }> {
    let hadError = false;
    const items: T[] = [];
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.yaml')) continue;
        const base = file.replace(/\.yaml$/i, '');
        const full = path.join(dir, file);
        try {
          const rawText = await fs.readFile(full, 'utf8');
          const parsedUnknown = parseYaml<unknown>(rawText);
          const record =
            parsedUnknown && typeof parsedUnknown === 'object'
              ? (parsedUnknown as Record<string, unknown>)
              : ({} as Record<string, unknown>);
          const candidateId = record.id;
          const decodedId = decodeURIComponent(base);
          record.id = typeof candidateId === 'string' && candidateId.length > 0 ? candidateId : decodedId;
          const casted = record as unknown as T;
          items.push(casted);
        } catch {
          hadError = true;
        }
      }
    } catch {
      // directory may not exist
    }
    return { items, hadError };
  }

  private async readFromHeadRoot(name: string): Promise<PersistedGraph | null> {
    try {
      const meta = await this.readHeadGraphMeta('graph.meta', name);
      const list = await this.runGitCapture(['ls-tree', '-r', '--name-only', 'HEAD'], this.config.graphRepoPath);
      const paths = list.split('\n').filter(Boolean);
      const nodeMap = this.collectYamlEntries(paths, 'nodes/');
      const edgeMap = this.collectYamlEntries(paths, 'edges/');

      const nodes = await Promise.all(
        Array.from(nodeMap.entries()).map(async ([encoded, relPath]) => {
          const record = await this.loadRecordFromHead(relPath, decodeURIComponent(encoded));
          return record as unknown as PersistedGraphNode;
        }),
      );

      const edges = await Promise.all(
        Array.from(edgeMap.entries()).map(async ([encoded, relPath]) => {
          const record = await this.loadRecordFromHead(relPath, decodeURIComponent(encoded));
          return record as unknown as PersistedGraphEdge;
        }),
      );

      const variables = await this.loadHeadVariables(paths);
      return {
        name: meta.name,
        version: meta.version,
        updatedAt: meta.updatedAt,
        nodes,
        edges,
        variables,
      };
    } catch {
      return null;
    }
  }

  private async readFromHeadPerGraph(name: string): Promise<PersistedGraph | null> {
    try {
      const base = path.posix.join('graphs', name);
      const metaBase = path.posix.join(base, 'graph.meta');
      const meta = await this.readHeadGraphMeta(metaBase, name);
      const list = await this.runGitCapture(['ls-tree', '-r', '--name-only', 'HEAD', base], this.config.graphRepoPath);
      const paths = list.split('\n').filter(Boolean);
      const nodeMap = this.collectYamlEntries(paths, `${base}/nodes/`);
      const edgeMap = this.collectYamlEntries(paths, `${base}/edges/`);

      const nodes = await Promise.all(
        Array.from(nodeMap.entries()).map(async ([encoded, relPath]) => {
          const record = await this.loadRecordFromHead(relPath, decodeURIComponent(encoded));
          return record as unknown as PersistedGraphNode;
        }),
      );

      const edges = await Promise.all(
        Array.from(edgeMap.entries()).map(async ([encoded, relPath]) => {
          const record = await this.loadRecordFromHead(relPath, decodeURIComponent(encoded));
          return record as unknown as PersistedGraphEdge;
        }),
      );

      return {
        name: meta.name,
        version: meta.version,
        updatedAt: meta.updatedAt,
        nodes,
        edges,
      };
    } catch {
      return null;
    }
  }

  private async readFromHeadMonolith(name: string): Promise<PersistedGraph | null> {
    try {
      const relYaml = path.posix.join('graphs', name, 'graph.yaml');
      const outYaml = await this.runGitCapture(['show', `HEAD:${relYaml}`], this.config.graphRepoPath);
      return parseYaml<PersistedGraph>(outYaml);
    } catch {
      return null;
    }
  }

  private nodePath(id: string): string {
    const encoded = encodeURIComponent(id);
    return path.posix.join('nodes', `${encoded}.yaml`);
  }

  private edgePath(id: string): string {
    const encoded = encodeURIComponent(id);
    return path.posix.join('edges', `${encoded}.yaml`);
  }

  private variablesPath(): string {
    return 'variables.yaml';
  }

  private metaPath(): string {
    return 'graph.meta.yaml';
  }

  private async writeYamlEntity(relPath: string, data: unknown, isNew: boolean, touched: TouchedSets): Promise<void> {
    const root = this.config.graphRepoPath;
    await this.atomicWriteFile(path.join(root, relPath), stringifyYaml(data));
    (isNew ? touched.added : touched.updated).add(relPath);
  }

  private async removeGraphPath(relPath: string, touched: TouchedSets): Promise<void> {
    const full = path.join(this.config.graphRepoPath, relPath);
    try {
      await fs.unlink(full);
      touched.deleted.add(relPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  private async yamlPathExists(relPath: string): Promise<boolean> {
    const abs = path.join(this.config.graphRepoPath, relPath);
    return this.pathExists(abs);
  }

  private normalizeMeta(parsed: Partial<GraphMeta>, fallbackName: string): GraphMeta {
    return {
      name: (parsed.name ?? fallbackName) as string,
      version: Number(parsed.version ?? 0),
      updatedAt: (parsed.updatedAt ?? new Date().toISOString()) as string,
      format: 2,
    };
  }

  private async readMetaFromWorkingTree(name: string): Promise<GraphMeta> {
    const relPath = this.metaPath();
    const abs = path.join(this.config.graphRepoPath, relPath);
    if (!(await this.pathExists(abs))) {
      throw new Error('Graph meta not found');
    }
    const parsed = parseYaml<Partial<GraphMeta>>(await fs.readFile(abs, 'utf8'));
    return this.normalizeMeta(parsed, name);
  }

  private normalizeVariables(raw: unknown): Array<{ key: string; value: string }> | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: Array<{ key: string; value: string }> = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const key = 'key' in entry ? String((entry as { key?: unknown }).key ?? '') : '';
      const value = 'value' in entry ? String((entry as { value?: unknown }).value ?? '') : '';
      if (!key) continue;
      out.push({ key, value });
    }
    return out.length ? out : undefined;
  }

  private async readVariablesFromWorkingTree(): Promise<Array<{ key: string; value: string }> | undefined> {
    const relPath = this.variablesPath();
    const abs = path.join(this.config.graphRepoPath, relPath);
    try {
      if (!(await this.pathExists(abs))) {
        return undefined;
      }
      const parsed = parseYaml<unknown>(await fs.readFile(abs, 'utf8'));
      return this.normalizeVariables(parsed);
    } catch {
      return undefined;
    }
  }

  private collectYamlEntries(paths: string[], prefix: string): Map<string, string> {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const result = new Map<string, string>();
    for (const filePath of paths) {
      if (!filePath.startsWith(normalizedPrefix)) continue;
      if (!filePath.endsWith('.yaml')) continue;
      const encoded = filePath.slice(normalizedPrefix.length).replace(/\.yaml$/i, '');
      result.set(encoded, filePath);
    }
    return result;
  }

  private async loadRecordFromHead(pathRef: string, fallbackId?: string): Promise<Record<string, unknown>> {
    const raw = await this.runGitCapture(['show', `HEAD:${pathRef}`], this.config.graphRepoPath);
    const parsed = parseYaml<unknown>(raw) as unknown;
    const record =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    if (fallbackId) {
      const candidate = record.id;
      record.id = typeof candidate === 'string' && candidate.length > 0 ? candidate : fallbackId;
    }
    return record;
  }

  private async readHeadGraphMeta(metaBase: string, fallbackName: string): Promise<GraphMeta> {
    const yamlRef = `${metaBase}.yaml`;
    const rawYaml = await this.runGitCapture(['show', `HEAD:${yamlRef}`], this.config.graphRepoPath);
    const parsed = parseYaml<Partial<GraphMeta>>(rawYaml);
    return this.normalizeMeta(parsed ?? {}, fallbackName);
  }

  private async loadHeadVariables(paths: string[]): Promise<Array<{ key: string; value: string }> | undefined> {
    if (!paths.includes('variables.yaml')) {
      return undefined;
    }
    const raw = await this.runGitCapture(['show', 'HEAD:variables.yaml'], this.config.graphRepoPath);
    return this.normalizeVariables(parseYaml<unknown>(raw));
  }

  private edgeId(e: PersistedGraphEdge): string {
    return String(`${e.source}-${e.sourceHandle}__${e.target}-${e.targetHandle}`);
  }

  private diffNodes(before: PersistedGraphNode[], after: PersistedGraphNode[]) {
    // Include position and state so both cause updates; encode template/config/state/position
    const normalize = (n: PersistedGraphNode) =>
      JSON.stringify({
        id: n.id,
        template: n.template,
        config: n.config,
        state: n.state,
        position: n.position,
      });
    const b = new Map(before.map((n) => [n.id, normalize(n)]));
    const a = new Map(after.map((n) => [n.id, normalize(n)]));
    const nodeAdds: string[] = [];
    const nodeUpdates: string[] = [];
    const nodeDeletes: string[] = [];
    for (const id of a.keys()) {
      if (!b.has(id)) {
        nodeAdds.push(id);
      } else if (b.get(id) !== a.get(id)) {
        nodeUpdates.push(id);
      }
    }
    for (const id of b.keys()) {
      if (!a.has(id)) {
        nodeDeletes.push(id);
      }
    }
    return { nodeAdds, nodeUpdates, nodeDeletes };
  }

  private diffEdges(before: PersistedGraphEdge[], after: PersistedGraphEdge[]) {
    const bi = new Map(
      before.map((e) => [String(e.id ?? this.edgeId(e)), JSON.stringify({ ...e, id: String(e.id ?? this.edgeId(e)) })]),
    );
    const ai = new Map(
      after.map((e) => [String(e.id ?? this.edgeId(e)), JSON.stringify({ ...e, id: String(e.id ?? this.edgeId(e)) })]),
    );
    const edgeAdds: string[] = [];
    const edgeUpdates: string[] = [];
    const edgeDeletes: string[] = [];
    for (const id of ai.keys()) {
      if (!bi.has(id)) {
        edgeAdds.push(id);
      } else if (bi.get(id) !== ai.get(id)) {
        edgeUpdates.push(id);
      }
    }
    for (const id of bi.keys()) {
      if (!ai.has(id)) {
        edgeDeletes.push(id);
      }
    }
    return { edgeAdds, edgeUpdates, edgeDeletes };
  }
  private defaultAuthor(): { name: string; email: string } {
    const fallbackName = 'CI Runner';
    const fallbackEmail = 'ci@example.com';
    const name = this.config.graphAuthorName?.trim() || fallbackName;
    const email = this.config.graphAuthorEmail?.trim() || fallbackEmail;
    return { name, email };
  }
}
