import { Dirent, promises as fs } from 'fs';
import path from 'path';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import type {
  PersistedGraph,
  PersistedGraphEdge,
  PersistedGraphNode,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '@agyn/shared';
import { validatePersistedGraph } from './graphSchema.validator';
import { GraphRepository } from './graph.repository';
import type { GraphAuthor } from './graph.repository';
import { ConfigService } from '../core/services/config.service';
import { parseYaml, stringifyYaml } from './yaml.util';

interface GraphMeta {
  name: string;
  version: number;
  updatedAt: string;
  format: 2;
}

const STAGING_PREFIX = '.graph-staging-';
const BACKUP_PREFIX = '.graph-backup-';

type CodeError<T = unknown> = Error & { code: string; current?: T };
function codeError<T = unknown>(code: string, message: string, current?: T): CodeError<T> {
  const err = new Error(message) as CodeError<T>;
  err.code = code;
  if (current !== undefined) err.current = current;
  return err;
}

type LockHandle = { lockPath: string } | null;

export class FsGraphRepository extends GraphRepository {
  constructor(
    private readonly config: ConfigService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    super();
  }

  private graphRoot?: string;

  async initIfNeeded(): Promise<void> {
    this.graphRoot = this.config.graphRepoPath;
    await this.cleanupSwapArtifacts();
    const root = this.ensureGraphRoot();
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.join(root, 'nodes'), { recursive: true });
    await fs.mkdir(path.join(root, 'edges'), { recursive: true });
    const metaPath = path.join(root, this.metaPath());
    if (!(await this.pathExists(metaPath))) {
      const now = new Date().toISOString();
      const meta: GraphMeta = { name: 'main', version: 0, updatedAt: now, format: 2 };
      await this.atomicWriteFile(metaPath, stringifyYaml(meta));
    }
  }

  async get(name: string): Promise<PersistedGraph | null> {
    this.assertReady();
    const working = await this.readFromWorkingTree(name);
    return working ? this.cloneGraph(working) : null;
  }

  async upsert(req: PersistedGraphUpsertRequest, _author?: GraphAuthor): Promise<PersistedGraphUpsertResponse> {
    this.assertReady();
    validatePersistedGraph(req, await this.templateRegistry.toSchema());

    const lock = await this.acquireLock();
    try {
      const existing = await this.get(req.name);
      const nowIso = new Date().toISOString();

      if (!existing) {
        if (req.version !== undefined && req.version !== 0) {
          throw codeError<PersistedGraph>('VERSION_CONFLICT', 'Version conflict', {
            name: req.name,
            version: 0,
            updatedAt: nowIso,
            nodes: [],
            edges: [],
          });
        }
      } else if (req.version !== undefined && req.version !== existing.version) {
        throw codeError<PersistedGraph>('VERSION_CONFLICT', 'Version conflict', existing);
      }

      const normalizedNodes = req.nodes.map((node) => {
        const stripped = this.stripInternalNode(node);
        if (stripped.state === undefined && existing) {
          const prev = existing.nodes.find((n) => n.id === stripped.id);
          if (prev && prev.state !== undefined) stripped.state = prev.state;
        }
        return stripped;
      });
      const normalizedEdges = req.edges.map((edge) => {
        const stripped = this.stripInternalEdge(edge);
        const deterministicId = this.edgeId(stripped);
        if (stripped.id && stripped.id !== deterministicId) {
          throw codeError('EDGE_ID_MISMATCH', `Edge id mismatch: expected ${deterministicId} got ${stripped.id}`);
        }
        return { ...stripped, id: deterministicId };
      });

      const current =
        existing ?? ({ name: req.name, version: 0, updatedAt: nowIso, nodes: [], edges: [], variables: [] } as PersistedGraph);

      const target: PersistedGraph = {
        name: req.name,
        version: (current.version || 0) + 1,
        updatedAt: nowIso,
        nodes: normalizedNodes,
        edges: normalizedEdges,
        variables:
          req.variables === undefined
            ? current.variables
            : req.variables.map((v) => ({ key: String(v.key), value: String(v.value) })),
      };

      try {
        await this.persistGraph(current, target);
      } catch (err) {
        await this.restoreWorkingTree(existing ?? null);
        const msg = err instanceof Error ? err.message : String(err);
        throw codeError('PERSIST_FAILED', msg);
      }

      return target;
    } finally {
      await this.releaseLock(lock);
    }
  }

  async upsertNodeState(name: string, nodeId: string, patch: Record<string, unknown>): Promise<void> {
    const current = await this.get(name);
    const base = current ?? ({ name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] } as PersistedGraph);
    const nodes = Array.from(base.nodes || []);
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) nodes[idx] = { ...nodes[idx], state: patch } as PersistedGraphNode;
    else nodes.push({ id: nodeId, template: 'unknown', state: patch } as PersistedGraphNode);
    await this.upsert({ name, version: base.version, nodes, edges: base.edges }, undefined);
  }

  private async persistGraph(_current: PersistedGraph, target: PersistedGraph): Promise<void> {
    const stagingDir = await this.createStagingTree(target);
    try {
      await this.swapWorkingTree(stagingDir);
    } catch (err) {
      await this.discardTempDir(stagingDir);
      throw err;
    }
  }

  private async readFromWorkingTree(name: string): Promise<PersistedGraph | null> {
    const meta = await this.readMetaAt(this.absolutePath(this.metaPath()), name);
    if (!meta) return null;
    const nodesRes = await this.readEntitiesFromDir<PersistedGraphNode>(this.absolutePath('nodes'));
    const edgesRes = await this.readEntitiesFromDir<PersistedGraphEdge>(this.absolutePath('edges'));
    if (nodesRes.hadError || edgesRes.hadError) {
      throw new Error('Working tree read error');
    }
    const variables = await this.readVariablesFromBase(this.ensureGraphRoot());
    return {
      name: meta.name,
      version: meta.version,
      updatedAt: meta.updatedAt,
      nodes: nodesRes.items,
      edges: edgesRes.items,
      variables,
    };
  }

  private async createStagingTree(graph: PersistedGraph): Promise<string> {
    const stagingDir = this.tempDirPath(this.stagingDirPrefix());
    await fs.mkdir(path.dirname(stagingDir), { recursive: true });
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.mkdir(path.join(stagingDir, 'nodes'), { recursive: true });
    await fs.mkdir(path.join(stagingDir, 'edges'), { recursive: true });

    for (const node of graph.nodes) {
      await this.writeYamlAtBase(stagingDir, this.nodePath(node.id), node);
    }
    for (const edge of graph.edges) {
      await this.writeYamlAtBase(stagingDir, this.edgePath(edge.id!), edge);
    }
    await this.writeYamlAtBase(stagingDir, this.variablesPath(), graph.variables ?? []);
    const meta: GraphMeta = {
      name: graph.name,
      version: graph.version,
      updatedAt: graph.updatedAt,
      format: 2,
    };
    await this.writeYamlAtBase(stagingDir, this.metaPath(), meta);

    await this.syncDirectory(path.join(stagingDir, 'nodes'));
    await this.syncDirectory(path.join(stagingDir, 'edges'));
    await this.syncDirectory(stagingDir);
    await this.syncDirectory(path.dirname(stagingDir));
    return stagingDir;
  }

  private async swapWorkingTree(stagingDir: string): Promise<void> {
    const root = this.ensureGraphRoot();
    const parent = this.repoParentDir();
    const backupDir = this.tempDirPath(this.backupDirPrefix());
    let rootRenamed = false;
    let newTreeActive = false;
    try {
      await fs.mkdir(parent, { recursive: true });
      await fs.rename(root, backupDir);
      rootRenamed = true;
      await fs.rename(stagingDir, root);
      newTreeActive = true;
      await this.restoreAuxiliaryEntries(backupDir, root);
      await this.syncDirectory(parent);
    } catch (err) {
      if (newTreeActive) {
        await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
      }
      if (rootRenamed) {
        await fs.rename(backupDir, root).catch(() => undefined);
      }
      throw err;
    } finally {
      await this.discardTempDir(stagingDir);
      await this.discardTempDir(backupDir);
    }
  }

  private stripInternalNode(node: PersistedGraphNode): PersistedGraphNode {
    return {
      id: node.id,
      template: node.template,
      config: node.config,
      state: node.state,
      position: node.position,
    };
  }

  private stripInternalEdge(edge: PersistedGraphEdge): PersistedGraphEdge {
    return { source: edge.source, sourceHandle: edge.sourceHandle, target: edge.target, targetHandle: edge.targetHandle, id: edge.id };
  }

  private nodePath(id: string): string {
    return path.posix.join('nodes', `${encodeURIComponent(id)}.yaml`);
  }

  private edgePath(id: string): string {
    return path.posix.join('edges', `${encodeURIComponent(id)}.yaml`);
  }

  private variablesPath(): string {
    return 'variables.yaml';
  }

  private metaPath(): string {
    return 'graph.meta.yaml';
  }

  private async writeYamlEntity(relPath: string, data: unknown): Promise<void> {
    await this.writeYamlAtBase(this.ensureGraphRoot(), relPath, data);
  }

  private async writeYamlAtBase(baseDir: string, relPath: string, data: unknown): Promise<void> {
    const abs = path.join(baseDir, relPath);
    await this.atomicWriteFile(abs, stringifyYaml(data));
  }

  private edgeId(edge: PersistedGraphEdge): string {
    return `${edge.source}-${edge.sourceHandle}__${edge.target}-${edge.targetHandle}`;
  }

  private async readEntitiesFromDir<T extends { id?: string }>(dir: string): Promise<{ items: T[]; hadError: boolean }> {
    const items: T[] = [];
    let hadError = false;
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return { items, hadError };
    }
    for (const file of files) {
      if (!file.endsWith('.yaml')) continue;
      const abs = path.join(dir, file);
      try {
        const raw = await fs.readFile(abs, 'utf8');
        const record = parseYaml<unknown>(raw) as Record<string, unknown>;
        const fallbackId = decodeURIComponent(file.replace(/\.yaml$/i, ''));
        const candidateId = record?.id;
        (record as Record<string, unknown>).id = typeof candidateId === 'string' && candidateId.length > 0 ? candidateId : fallbackId;
        items.push(record as unknown as T);
      } catch {
        hadError = true;
      }
    }
    return { items, hadError };
  }

  private async readMetaAt(absPath: string, fallbackName: string): Promise<GraphMeta | null> {
    try {
      const parsed = parseYaml<Partial<GraphMeta>>(await fs.readFile(absPath, 'utf8'));
      return this.normalizeMeta(parsed ?? {}, fallbackName);
    } catch {
      return null;
    }
  }

  private normalizeMeta(parsed: Partial<GraphMeta>, fallbackName: string): GraphMeta {
    return {
      name: (parsed.name ?? fallbackName) as string,
      version: Number(parsed.version ?? 0),
      updatedAt: (parsed.updatedAt ?? new Date().toISOString()) as string,
      format: 2,
    };
  }

  private async readVariablesFromBase(baseDir: string): Promise<Array<{ key: string; value: string }> | undefined> {
    const abs = path.join(baseDir, this.variablesPath());
    try {
      const raw = await fs.readFile(abs, 'utf8');
      return this.normalizeVariables(parseYaml<unknown>(raw));
    } catch {
      return undefined;
    }
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
  private async restoreAuxiliaryEntries(backupDir: string, root: string): Promise<void> {
    const preserve = ['.git'];
    for (const entry of preserve) {
      const source = path.join(backupDir, entry);
      if (!(await this.pathExists(source))) continue;
      const dest = path.join(root, entry);
      await fs.rm(dest, { recursive: true, force: true }).catch(() => undefined);
      await fs.rename(source, dest).catch(() => undefined);
    }
  }

  private tempDirPath(prefix: string): string {
    const parent = this.repoParentDir();
    const uniqueId = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    return path.join(parent, `${prefix}${uniqueId}`);
  }

  private repoParentDir(): string {
    return path.dirname(this.ensureGraphRoot());
  }

  private repoBaseName(): string {
    const base = path.basename(this.ensureGraphRoot()).replace(/[^a-zA-Z0-9.-]/g, '_');
    return base.length ? base : 'graph';
  }

  private stagingDirPrefix(): string {
    return `${STAGING_PREFIX}${this.repoBaseName()}-`;
  }

  private backupDirPrefix(): string {
    return `${BACKUP_PREFIX}${this.repoBaseName()}-`;
  }

  private lockFilePath(): string {
    return path.join(this.repoParentDir(), `.${this.repoBaseName()}.graph.lock`);
  }

  private async discardTempDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private async cleanupSwapArtifacts(): Promise<void> {
    const root = this.ensureGraphRoot();
    const parent = this.repoParentDir();
    await fs.mkdir(parent, { recursive: true });
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(parent, { withFileTypes: true });
    } catch {
      return;
    }
    const stagingPrefix = this.stagingDirPrefix();
    const backupPrefix = this.backupDirPrefix();
    const stagingDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(stagingPrefix));
    const backupDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(backupPrefix));
    const rootExists = await this.pathExists(root);
    if (!rootExists && backupDirs.length) {
      const candidate = await this.selectNewestDir(parent, backupDirs);
      if (candidate) {
        await fs.rename(path.join(parent, candidate.name), root).catch(() => undefined);
        const idx = backupDirs.findIndex((entry) => entry.name === candidate.name);
        if (idx >= 0) backupDirs.splice(idx, 1);
      }
    }
    await Promise.all(stagingDirs.map((entry) => this.discardTempDir(path.join(parent, entry.name))));
    await Promise.all(backupDirs.map((entry) => this.discardTempDir(path.join(parent, entry.name))));
  }

  private async selectNewestDir(base: string, entries: Dirent[]): Promise<Dirent | null> {
    let newest: { entry: Dirent; mtime: number } | null = null;
    for (const entry of entries) {
      try {
        const stat = await fs.stat(path.join(base, entry.name));
        if (!newest || stat.mtimeMs > newest.mtime) {
          newest = { entry, mtime: stat.mtimeMs };
        }
      } catch {
        // ignore
      }
    }
    return newest?.entry ?? null;
  }

  private async syncDirectory(dir: string): Promise<void> {
    try {
      const fd = await fs.open(dir, 'r');
      try {
        await fd.sync();
      } finally {
        await fd.close();
      }
    } catch {
      // ignore
    }
  }

  private async appendDefaultMeta(name: string): Promise<void> {
    const meta: GraphMeta = { name, version: 0, updatedAt: new Date().toISOString(), format: 2 };
    await this.writeYamlEntity(this.metaPath(), meta);
  }

  private async restoreWorkingTree(graph: PersistedGraph | null): Promise<void> {
    try {
      if (!graph) {
        await this.clearDirectory(this.absolutePath('nodes'));
        await this.clearDirectory(this.absolutePath('edges'));
        await this.writeYamlEntity(this.variablesPath(), []);
        await this.appendDefaultMeta('main');
        return;
      }
      await this.clearDirectory(this.absolutePath('nodes'));
      await this.clearDirectory(this.absolutePath('edges'));
      for (const node of graph.nodes) {
        await this.writeYamlEntity(this.nodePath(node.id), node);
      }
      for (const edge of graph.edges) {
        await this.writeYamlEntity(this.edgePath(edge.id!), edge);
      }
      await this.writeYamlEntity(this.variablesPath(), graph.variables ?? []);
      await this.writeYamlEntity(this.metaPath(), {
        name: graph.name,
        version: graph.version,
        updatedAt: graph.updatedAt,
        format: 2,
      } satisfies GraphMeta);
    } catch {
      // best-effort rollback
    }
  }

  private async clearDirectory(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  }

  private cloneGraph(graph: PersistedGraph): PersistedGraph {
    return JSON.parse(JSON.stringify(graph)) as PersistedGraph;
  }

  private ensureGraphRoot(): string {
    if (!this.graphRoot) {
      throw new Error('FsGraphRepository not initialized');
    }
    return this.graphRoot;
  }

  private absolutePath(relPath: string): string {
    return path.join(this.ensureGraphRoot(), relPath);
  }

  private assertReady(): void {
    if (!this.graphRoot) {
      throw new Error('FsGraphRepository used before initialization');
    }
  }

  private async acquireLock(): Promise<LockHandle> {
    const lockPath = this.lockFilePath();
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    const timeout = this.config.graphLockTimeoutMs ?? 5000;
    const start = Date.now();
    while (true) {
      try {
        const fd = await fs.open(lockPath, 'wx');
        await fd.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        await fd.close();
        return { lockPath };
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'EEXIST' && code !== 'ENOENT') throw err;
        if (Date.now() - start > timeout) throw codeError('LOCK_TIMEOUT', 'Lock timeout');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  private async releaseLock(handle: LockHandle): Promise<void> {
    if (!handle) return;
    try {
      await fs.unlink(handle.lockPath);
    } catch {
      // ignore
    }
  }

  private async atomicWriteFile(filePath: string, content: string): Promise<void> {
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
      // ignore
    }
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }
}
