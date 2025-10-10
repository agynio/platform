#!/usr/bin/env tsx
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

type PersistedGraphNode = { id: string; template: string; config?: unknown; dynamicConfig?: unknown; position?: { x: number; y: number } };
type PersistedGraphEdge = { id?: string; source: string; sourceHandle: string; target: string; targetHandle: string };
type PersistedGraph = { name: string; version: number; updatedAt: string; nodes: PersistedGraphNode[]; edges: PersistedGraphEdge[] };

async function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, env });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} failed: ${stderr}`))));
  });
}

async function ensureRepo(repoPath: string, branch: string) {
  await fs.mkdir(repoPath, { recursive: true });
  try { await fs.stat(path.join(repoPath, '.git')); } catch { await runGit(['init', '-b', branch], repoPath); }
  try { await runGit(['rev-parse', '--verify', branch], repoPath); } catch { await runGit(['branch', branch], repoPath); }
  await runGit(['checkout', branch], repoPath);
}

function edgeId(e: PersistedGraphEdge): string {
  return `${e.source}-${e.sourceHandle}__${e.target}-${e.targetHandle}`;
}

async function readLegacyMonolith(repoPath: string, name: string): Promise<PersistedGraph | null> {
  const rel = path.join('graphs', name, 'graph.json');
  const abs = path.join(repoPath, rel);
  try {
    const raw = await fs.readFile(abs, 'utf8');
    const g = JSON.parse(raw) as PersistedGraph;
    return g;
  } catch {
    return null;
  }
}

async function readLegacyPerGraph(repoPath: string, name: string): Promise<PersistedGraph | null> {
  const base = path.join(repoPath, 'graphs', name);
  try { await fs.stat(base); } catch { return null; }
  // meta
  let version = 0; let updatedAt = new Date().toISOString();
  try {
    const metaRaw = await fs.readFile(path.join(base, 'graph.meta.json'), 'utf8');
    const meta = JSON.parse(metaRaw) as Partial<PersistedGraph>;
    if (typeof meta.version === 'number') version = meta.version;
    if (typeof meta.updatedAt === 'string') updatedAt = meta.updatedAt;
  } catch {}
  // nodes/edges
  const nodes: PersistedGraphNode[] = [];
  const edges: PersistedGraphEdge[] = [];
  try {
    const nd = path.join(base, 'nodes');
    const nf = (await fs.readdir(nd)).filter((f) => f.endsWith('.json'));
    for (const f of nf) {
      const n = JSON.parse(await fs.readFile(path.join(nd, f), 'utf8')) as PersistedGraphNode;
      if (!n.id) n.id = decodeURIComponent(f.replace(/\.json$/, ''));
      nodes.push(n);
    }
  } catch {}
  try {
    const ed = path.join(base, 'edges');
    const ef = (await fs.readdir(ed)).filter((f) => f.endsWith('.json'));
    for (const f of ef) {
      const e = JSON.parse(await fs.readFile(path.join(ed, f), 'utf8')) as PersistedGraphEdge;
      if (!e.id) e.id = decodeURIComponent(f.replace(/\.json$/, ''));
      edges.push(e);
    }
  } catch {}
  return { name, version, updatedAt, nodes, edges };
}

async function discoverGraphNames(repoPath: string): Promise<string[]> {
  const graphsDir = path.join(repoPath, 'graphs');
  try {
    const entries = await fs.readdir(graphsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function migrateRepo(opts?: { repoPath?: string; branch?: string; graphName?: string; authorName?: string; authorEmail?: string }) {
  const repoPath = opts?.repoPath ?? process.env.GRAPH_REPO_PATH ?? './data/graph';
  const branch = opts?.branch ?? process.env.GRAPH_BRANCH ?? 'graph-state';
  const authorName = opts?.authorName ?? process.env.GRAPH_AUTHOR_NAME ?? 'Graph Migrator';
  const authorEmail = opts?.authorEmail ?? process.env.GRAPH_AUTHOR_EMAIL ?? 'graph-migrator@example.com';
  await ensureRepo(repoPath, branch);

  // Already migrated?
  try { await fs.stat(path.join(repoPath, 'graph.meta.json')); return { skipped: true }; } catch {}

  let name = opts?.graphName ?? process.env.GRAPH_NAME ?? 'main';
  const names = await discoverGraphNames(repoPath);
  if (!names.includes(name)) {
    if (names.length === 1) name = names[0];
    else if (names.length > 1) throw new Error(`Multiple graphs found: ${names.join(', ')}. Specify GRAPH_NAME.`);
  }

  let source = await readLegacyPerGraph(repoPath, name);
  if (!source) source = await readLegacyMonolith(repoPath, name);
  if (!source) throw new Error('No legacy graph found to migrate.');

  // Write new layout
  await fs.mkdir(path.join(repoPath, 'nodes'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'edges'), { recursive: true });
  // Write entities
  await Promise.all(source.nodes.map(async (n) => {
    const rel = path.join('nodes', `${encodeURIComponent(n.id)}.json`);
    await fs.writeFile(path.join(repoPath, rel), JSON.stringify(n, null, 2));
  }));
  await Promise.all(source.edges.map(async (e) => {
    const id = e.id ?? edgeId(e);
    const rel = path.join('edges', `${encodeURIComponent(id)}.json`);
    await fs.writeFile(path.join(repoPath, rel), JSON.stringify({ ...e, id }, null, 2));
  }));
  // meta last
  const meta = { name, version: source.version, updatedAt: source.updatedAt, format: 2 as const };
  await fs.writeFile(path.join(repoPath, 'graph.meta.json'), JSON.stringify(meta, null, 2));

  // Stage and commit
  const env = { ...process.env, GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: authorEmail, GIT_COMMITTER_NAME: authorName, GIT_COMMITTER_EMAIL: authorEmail };
  await runGit(['add', '--all', 'graph.meta.json', 'nodes', 'edges'], repoPath, env);
  // Try to remove legacy graphs dir
  try { await runGit(['rm', '-r', '--ignore-unmatch', 'graphs'], repoPath, env); } catch {}
  await runGit(['commit', '-m', `chore(graph): migrate to format:2 (${name} v${source.version})`], repoPath, env);
  return { migrated: true, name };
}

async function main() {
  await migrateRepo();
  console.log('Migration complete.');
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main().catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  });
}

