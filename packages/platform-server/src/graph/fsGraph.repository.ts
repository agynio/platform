import { promises as fs } from 'fs';
import path from 'path';
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
import type { GraphAuthor } from './graph.repository';
import { ConfigService } from '../core/services/config.service';
import { parseYaml, stringifyYaml } from './yaml.util';
import { migrateLegacyWorkingTree } from './fsGraph.migrator';

interface GraphMeta {
  name: string;
  version: number;
  updatedAt: string;
  format: 2;
}

type CodeError<T = unknown> = Error & { code: string; current?: T };
function codeError<T = unknown>(code: string, message: string, current?: T): CodeError<T> {
  const err = new Error(message) as CodeError<T>;
  err.code = code;
  if (current !== undefined) err.current = current;
  return err;
}

type LockHandle = { lockPath: string } | null;

type StorageLayout =
  | { kind: 'standard' }
  | { kind: 'legacy-working-tree'; legacyPath: string }
  | { kind: 'dataset-root'; datasetPath: string; datasetName?: string };

export class FsGraphRepository extends GraphRepository {
  constructor(
    private readonly config: ConfigService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    super();
  }

  private datasetName?: string;
  private lastCommitted?: PersistedGraph;
  private datasetRootOverride?: string;
  private skipPointerUpdate = false;

  async initIfNeeded(): Promise<void> {
    let dataset = await this.resolveDatasetName();
    this.datasetName = dataset;

    const layout = await this.detectStorageLayout(dataset);

    if (layout.kind === 'dataset-root') {
      this.datasetRootOverride = layout.datasetPath;
      this.skipPointerUpdate = true;
      if (layout.datasetName) {
        this.datasetName = layout.datasetName;
        dataset = layout.datasetName;
      }
    } else if (layout.kind === 'legacy-working-tree') {
      if (!this.config.graphAutoMigrate) {
        const command = `pnpm --filter @agyn/platform-server graph:migrate-fs -- --source ${layout.legacyPath} --target ${this.config.graphDataPath} --dataset ${dataset}`;
        throw codeError(
          'LEGACY_GRAPH_REPO',
          `Legacy git-backed graph detected at ${layout.legacyPath}. Run "${command}" or set GRAPH_AUTO_MIGRATE=1 to auto-migrate during bootstrap.`,
        );
      }
      await migrateLegacyWorkingTree({
        source: layout.legacyPath,
        target: this.config.graphDataPath,
        dataset,
        force: true,
        log: (message) => console.info(`[FsGraphRepository] ${message}`),
      });
    }

    if (!this.skipPointerUpdate) {
      await fs.mkdir(this.config.graphDataPath, { recursive: true });
      await this.writeActiveDatasetPointer(this.datasetName);
    }

    const root = this.datasetRoot();
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.join(root, 'nodes'), { recursive: true });
    await fs.mkdir(path.join(root, 'edges'), { recursive: true });
    await fs.mkdir(path.join(root, 'snapshots'), { recursive: true });

    const metaPath = path.join(root, this.metaPath());
    if (!(await this.pathExists(metaPath))) {
      const now = new Date().toISOString();
      const meta: GraphMeta = { name: 'main', version: 0, updatedAt: now, format: 2 };
      await this.atomicWriteFile(metaPath, stringifyYaml(meta));
    }
  }

  async get(name: string): Promise<PersistedGraph | null> {
    this.assertReady();
    try {
      const working = await this.readFromWorkingTree(name);
      if (working) {
        this.lastCommitted = this.cloneGraph(working);
        return working;
      }
    } catch {
      // fall through to snapshot/journal
    }

    if (this.lastCommitted) return this.cloneGraph(this.lastCommitted);

    const snapshot = await this.readLatestSnapshot(name);
    if (snapshot) {
      this.lastCommitted = this.cloneGraph(snapshot);
      return snapshot;
    }

    const fromJournal = await this.readLatestJournalEntry();
    if (fromJournal && fromJournal.name === name) {
      this.lastCommitted = this.cloneGraph(fromJournal);
      return fromJournal;
    }

    return null;
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
        this.lastCommitted = this.cloneGraph(target);
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

  private async persistGraph(current: PersistedGraph, target: PersistedGraph): Promise<void> {
    const root = this.datasetRoot();
    const nodesDir = path.join(root, 'nodes');
    const edgesDir = path.join(root, 'edges');
    await fs.mkdir(nodesDir, { recursive: true });
    await fs.mkdir(edgesDir, { recursive: true });

    const { nodeAdds, nodeUpdates, nodeDeletes } = this.diffNodes(current.nodes, target.nodes);
    const { edgeAdds, edgeUpdates, edgeDeletes } = this.diffEdges(current.edges, target.edges);

    const writeNode = async (node: PersistedGraphNode) => {
      await this.writeYamlEntity(this.nodePath(node.id), node);
    };
    const writeEdge = async (edge: PersistedGraphEdge) => {
      await this.writeYamlEntity(this.edgePath(edge.id!), edge);
    };

    for (const id of nodeAdds) {
      const node = target.nodes.find((n) => n.id === id);
      if (node) await writeNode(node);
    }
    for (const id of nodeUpdates) {
      const node = target.nodes.find((n) => n.id === id);
      if (node) await writeNode(node);
    }
    for (const id of nodeDeletes) {
      await this.removeGraphPath(this.nodePath(id));
    }

    for (const id of edgeAdds) {
      const edge = target.edges.find((e) => e.id === id);
      if (edge) await writeEdge(edge);
    }
    for (const id of edgeUpdates) {
      const edge = target.edges.find((e) => e.id === id);
      if (edge) await writeEdge(edge);
    }
    for (const id of edgeDeletes) {
      await this.removeGraphPath(this.edgePath(id));
    }

    const prevVars = JSON.stringify(current.variables ?? []);
    const nextVars = JSON.stringify(target.variables ?? []);
    if (prevVars !== nextVars) {
      await this.writeYamlEntity(this.variablesPath(), target.variables ?? []);
    }

    const meta: GraphMeta = {
      name: target.name,
      version: target.version,
      updatedAt: target.updatedAt,
      format: 2,
    };
    await this.writeYamlEntity(this.metaPath(), meta);

    const cleanupTasks: Array<() => Promise<void>> = [];
    try {
      const snapshotHandle = await this.writeSnapshot(target);
      cleanupTasks.push(snapshotHandle.rollback);

      const revertJournal = await this.appendJournal(target);
      cleanupTasks.push(revertJournal);

      try {
        await snapshotHandle.pruneOlder();
      } catch {
        // best effort; leftover historical snapshots are acceptable
      }

      cleanupTasks.length = 0;
    } catch (err) {
      await Promise.allSettled(cleanupTasks.map((task) => task()));
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
    const variables = await this.readVariablesFromBase(this.datasetRoot());
    return {
      name: meta.name,
      version: meta.version,
      updatedAt: meta.updatedAt,
      nodes: nodesRes.items,
      edges: edgesRes.items,
      variables,
    };
  }

  private async readLatestSnapshot(name: string): Promise<PersistedGraph | null> {
    const snapshotsDir = path.join(this.datasetRoot(), 'snapshots');
    let entries: string[] = [];
    try {
      entries = await fs.readdir(snapshotsDir);
    } catch {
      return null;
    }
    let latest: { version: number; dir: string } | null = null;
    for (const entry of entries) {
      const version = Number(entry);
      if (!Number.isFinite(version)) continue;
      if (!latest || version > latest.version) {
        latest = { version, dir: path.join(snapshotsDir, entry) };
      }
    }
    if (!latest) return null;
    try {
      return await this.readGraphFromBase(latest.dir, name);
    } catch {
      return null;
    }
  }

  private async readGraphFromBase(baseDir: string, fallbackName: string): Promise<PersistedGraph | null> {
    const meta = await this.readMetaAt(path.join(baseDir, this.metaPath()), fallbackName);
    if (!meta) return null;
    const nodesRes = await this.readEntitiesFromDir<PersistedGraphNode>(path.join(baseDir, 'nodes'));
    const edgesRes = await this.readEntitiesFromDir<PersistedGraphEdge>(path.join(baseDir, 'edges'));
    if (nodesRes.hadError || edgesRes.hadError) {
      throw new Error('Snapshot read error');
    }
    const variables = await this.readVariablesFromBase(baseDir);
    return {
      name: meta.name,
      version: meta.version,
      updatedAt: meta.updatedAt,
      nodes: nodesRes.items,
      edges: edgesRes.items,
      variables,
    };
  }

  private async readLatestJournalEntry(): Promise<PersistedGraph | null> {
    const journalPath = path.join(this.datasetRoot(), 'journal.ndjson');
    let raw: string;
    try {
      raw = await fs.readFile(journalPath, 'utf8');
    } catch {
      return null;
    }
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(lines[i]) as { graph?: PersistedGraph };
        if (parsed?.graph) return parsed.graph;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async writeSnapshot(graph: PersistedGraph): Promise<{ rollback: () => Promise<void>; pruneOlder: () => Promise<void> }> {
    const snapshotsDir = path.join(this.datasetRoot(), 'snapshots');
    await fs.mkdir(snapshotsDir, { recursive: true });
    const tempDir = path.join(
      snapshotsDir,
      `.tmp-${graph.version}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`,
    );
    await fs.mkdir(path.join(tempDir, 'nodes'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'edges'), { recursive: true });

    const meta: GraphMeta = { name: graph.name, version: graph.version, updatedAt: graph.updatedAt, format: 2 };
    await this.writeYamlAtBase(tempDir, this.metaPath(), meta);
    await this.writeYamlAtBase(tempDir, this.variablesPath(), graph.variables ?? []);

    for (const node of graph.nodes) {
      await this.writeYamlAtBase(tempDir, this.nodePath(node.id), node);
    }
    for (const edge of graph.edges) {
      await this.writeYamlAtBase(tempDir, this.edgePath(edge.id!), edge);
    }

    const finalDir = path.join(snapshotsDir, String(graph.version));
    await fs.rm(finalDir, { recursive: true, force: true });
    try {
      await fs.rename(tempDir, finalDir);
    } catch (err) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }

    const rollback = async () => {
      await fs.rm(finalDir, { recursive: true, force: true }).catch(() => undefined);
    };
    const pruneOlder = async () => {
      const entries = await fs.readdir(snapshotsDir);
      await Promise.all(
        entries
          .filter((entry) => entry !== String(graph.version))
          .map((entry) => fs.rm(path.join(snapshotsDir, entry), { recursive: true, force: true }).catch(() => undefined)),
      );
    };
    return { rollback, pruneOlder };
  }

  private async appendJournal(graph: PersistedGraph): Promise<() => Promise<void>> {
    const journalPath = path.join(this.datasetRoot(), 'journal.ndjson');
    await fs.mkdir(path.dirname(journalPath), { recursive: true });
    const fd = await fs.open(journalPath, 'a+');
    try {
      const { size: previousSize } = await fd.stat();
      const record = { version: graph.version, timestamp: graph.updatedAt, graph };
      await fd.writeFile(`${JSON.stringify(record)}\n`);
      await fd.sync();
      return async () => {
        const rollbackFd = await fs.open(journalPath, 'r+');
        try {
          await rollbackFd.truncate(previousSize);
          await rollbackFd.sync();
        } finally {
          await rollbackFd.close();
        }
      };
    } finally {
      await fd.close();
    }
  }

  private async detectStorageLayout(activeDataset: string): Promise<StorageLayout> {
    const graphPath = this.config.graphDataPath;
    const datasetCandidate = path.join(graphPath, 'datasets', activeDataset);
    if (await this.pathExists(datasetCandidate)) {
      return { kind: 'standard' };
    }

    const datasetsDir = path.join(graphPath, 'datasets');
    if (await this.pathExists(datasetsDir)) {
      return { kind: 'standard' };
    }

    const metaPath = path.join(graphPath, this.metaPath());
    const nodesPath = path.join(graphPath, 'nodes');
    const edgesPath = path.join(graphPath, 'edges');
    const hasMeta = await this.pathExists(metaPath);
    const hasNodes = await this.pathExists(nodesPath);
    const hasEdges = await this.pathExists(edgesPath);
    const datasetNameFromPath = this.detectDatasetNameFromPath(graphPath);

    if (hasMeta && hasNodes && hasEdges) {
      const gitDir = path.join(graphPath, '.git');
      if (await this.pathExists(gitDir)) {
        return { kind: 'legacy-working-tree', legacyPath: graphPath };
      }
      return { kind: 'dataset-root', datasetPath: graphPath, datasetName: datasetNameFromPath };
    }

    if (datasetNameFromPath) {
      return { kind: 'dataset-root', datasetPath: graphPath, datasetName: datasetNameFromPath };
    }

    return { kind: 'standard' };
  }

  private detectDatasetNameFromPath(candidate: string): string | undefined {
    const normalized = path.normalize(candidate);
    const segments = normalized.split(path.sep).filter((segment) => segment.length > 0);
    const idx = segments.lastIndexOf('datasets');
    if (idx >= 0 && idx + 1 < segments.length) {
      return segments[idx + 1];
    }
    return undefined;
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
    await this.writeYamlAtBase(this.datasetRoot(), relPath, data);
  }

  private async writeYamlAtBase(baseDir: string, relPath: string, data: unknown): Promise<void> {
    const abs = path.join(baseDir, relPath);
    await this.atomicWriteFile(abs, stringifyYaml(data));
  }

  private async removeGraphPath(relPath: string): Promise<void> {
    const abs = this.absolutePath(relPath);
    try {
      await fs.unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
  }

  private diffNodes(before: PersistedGraphNode[], after: PersistedGraphNode[]) {
    const encode = (node: PersistedGraphNode) =>
      JSON.stringify({ id: node.id, template: node.template, config: node.config, state: node.state, position: node.position });
    const b = new Map(before.map((n) => [n.id, encode(n)]));
    const a = new Map(after.map((n) => [n.id, encode(n)]));
    const nodeAdds: string[] = [];
    const nodeUpdates: string[] = [];
    const nodeDeletes: string[] = [];
    for (const id of a.keys()) {
      if (!b.has(id)) nodeAdds.push(id);
      else if (b.get(id) !== a.get(id)) nodeUpdates.push(id);
    }
    for (const id of b.keys()) {
      if (!a.has(id)) nodeDeletes.push(id);
    }
    return { nodeAdds, nodeUpdates, nodeDeletes };
  }

  private diffEdges(before: PersistedGraphEdge[], after: PersistedGraphEdge[]) {
    const encode = (edge: PersistedGraphEdge) =>
      JSON.stringify({ ...edge, id: String(edge.id ?? this.edgeId(edge)) });
    const b = new Map(before.map((e) => [String(e.id ?? this.edgeId(e)), encode(e)]));
    const a = new Map(after.map((e) => [String(e.id ?? this.edgeId(e)), encode(e)]));
    const edgeAdds: string[] = [];
    const edgeUpdates: string[] = [];
    const edgeDeletes: string[] = [];
    for (const id of a.keys()) {
      if (!b.has(id)) edgeAdds.push(id);
      else if (b.get(id) !== a.get(id)) edgeUpdates.push(id);
    }
    for (const id of b.keys()) {
      if (!a.has(id)) edgeDeletes.push(id);
    }
    return { edgeAdds, edgeUpdates, edgeDeletes };
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

  private datasetRoot(dataset?: string): string {
    if (this.datasetRootOverride) {
      return this.datasetRootOverride;
    }
    const name = dataset ?? this.datasetName;
    if (!name) throw new Error('FsGraphRepository not initialized');
    return path.join(this.config.graphDataPath, 'datasets', name);
  }

  private absolutePath(relPath: string): string {
    return path.join(this.datasetRoot(), relPath);
  }

  private pointerPath(): string {
    return path.join(this.config.graphDataPath, 'active-dataset.txt');
  }

  private async resolveDatasetName(): Promise<string> {
    const configured = (this.config.graphDataset ?? 'main').trim() || 'main';
    if (this.config.graphDatasetIsExplicit) return configured;
    const pointer = await this.readActiveDatasetPointer();
    return pointer ?? configured;
  }

  private async readActiveDatasetPointer(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.pointerPath(), 'utf8');
      const value = raw.trim();
      return value.length ? value : null;
    } catch {
      return null;
    }
  }

  private async writeActiveDatasetPointer(dataset: string): Promise<void> {
    await this.atomicWriteFile(this.pointerPath(), `${dataset}\n`);
  }

  private assertReady(): void {
    if (!this.datasetName) {
      throw new Error('FsGraphRepository used before initialization');
    }
  }

  private async acquireLock(): Promise<LockHandle> {
    const lockPath = path.join(this.datasetRoot(), '.graph.lock');
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
        if (code !== 'EEXIST') throw err;
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
