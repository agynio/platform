#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
dotenv.config();

import { MongoClient, Collection } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface PersistedGraphNode {
  id: string;
  template: string;
  config?: unknown;
  // dynamicConfig removed
  position?: { x: number; y: number };
}
interface PersistedGraphEdge {
  id?: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PersistedGraph = {
  name: string;
  version: number;
  updatedAt: string;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
};
interface GraphDocument {
  _id: string;
  version: number;
  updatedAt: Date;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
}

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
  try {
    await fs.stat(path.join(repoPath, '.git'));
  } catch {
    await runGit(['init', '-b', branch], repoPath);
  }
  // ensure branch checkout
  try {
    await runGit(['rev-parse', '--verify', branch], repoPath);
  } catch {
    await runGit(['branch', branch], repoPath);
  }
  await runGit(['checkout', branch], repoPath);
}

async function hasStagedChanges(repoPath: string): Promise<boolean> {
  try {
    await runGit(['diff', '--cached', '--quiet'], repoPath);
    return false; // exit 0 => no changes
  } catch {
    return true; // non-zero => changes present
  }
}

// Helpers
const edgeId = (e: { source: string; sourceHandle: string; target: string; targetHandle: string }) =>
  `${e.source}-${e.sourceHandle}__${e.target}-${e.targetHandle}`;

async function atomicWrite(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(content);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, filePath);
  try {
    const dfd = await fs.open(dir, 'r');
    try { await dfd.sync(); } finally { await dfd.close(); }
  } catch {}
}

async function pathExists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function main() {
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/agents';
  const repoPath = process.env.GRAPH_REPO_PATH || './data/graph';
  const branch = process.env.GRAPH_BRANCH || 'graph-state';
  const authorName = process.env.GRAPH_AUTHOR_NAME || 'Graph Migrator';
  const authorEmail = process.env.GRAPH_AUTHOR_EMAIL || 'graph-migrator@example.com';
  const onlyGraphName = process.env.GRAPH_NAME || '';

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db();
  const col: Collection<GraphDocument> = db.collection('graphs');

  await ensureRepo(repoPath, branch);

  // Selection rules: require exactly one target graph
  let selected: GraphDocument | null = null;
  if (onlyGraphName) {
    selected = await col.findOne({ _id: onlyGraphName });
    if (!selected) {
      console.error(`Graph not found: ${onlyGraphName}. Set GRAPH_NAME to a valid graph.`);
      process.exit(2);
    }
  } else {
    const names = await col.find({}, { projection: { _id: 1 } }).toArray();
    if (names.length === 0) {
      console.error('No graphs found in Mongo. Nothing to migrate.');
      process.exit(2);
    }
    if (names.length > 1) {
      const list = names.map((n) => n._id).join(', ');
      console.error(`Multiple graphs found (${names.length}): ${list}. Set GRAPH_NAME to select one.`);
      process.exit(2);
    }
    selected = await col.findOne({ _id: names[0]._id });
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: authorName,
    GIT_AUTHOR_EMAIL: authorEmail,
    GIT_COMMITTER_NAME: authorName,
    GIT_COMMITTER_EMAIL: authorEmail,
  };
  if (!selected) {
    console.error('No graph selected for migration.');
    process.exit(2);
  }

  const name = selected._id;
  // Normalize edges to deterministic ids
  const normalizedEdges = (selected.edges || []).map((e) => {
    const det = edgeId(e);
    return { ...e, id: det };
  });
  const normalizedNodes = (selected.nodes || []).map((n) => ({ id: n.id, template: n.template, config: n.config, position: n.position }));

  // Ensure root layout
  await fs.mkdir(path.join(repoPath, 'nodes'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'edges'), { recursive: true });

  // Write nodes/edges in parallel
  const nodeWrites = normalizedNodes.map((n) => {
    const rel = path.posix.join('nodes', `${encodeURIComponent(n.id)}.json`);
    return atomicWrite(path.join(repoPath, rel), JSON.stringify(n, null, 2));
  });
  const edgeWrites = normalizedEdges.map((e) => {
    const rel = path.posix.join('edges', `${encodeURIComponent(e.id!)}.json`);
    return atomicWrite(path.join(repoPath, rel), JSON.stringify(e, null, 2));
  });
  await Promise.all([...nodeWrites, ...edgeWrites]);
  // meta last
  const meta = { name, version: selected.version, updatedAt: selected.updatedAt.toISOString(), format: 2 as const };
  await atomicWrite(path.join(repoPath, 'graph.meta.json'), JSON.stringify(meta, null, 2));

  // Stage files
  await runGit(['add', '--all', 'graph.meta.json', path.posix.join('nodes'), path.posix.join('edges')], repoPath);
  // Remove legacy graphs/ directory
  if (await pathExists(path.join(repoPath, 'graphs'))) {
    try { await runGit(['rm', '-r', '--ignore-unmatch', 'graphs'], repoPath); } catch {
      try { await fs.rm(path.join(repoPath, 'graphs'), { recursive: true, force: true }); } catch {}
    }
  }
  const nodeCount = normalizedNodes.length;
  const edgeCount = normalizedEdges.length;
  if (await hasStagedChanges(repoPath)) {
    await runGit(['commit', '-m', `chore(graph): migrate to single-graph root layout: ${name} v${selected.version} (+${nodeCount} nodes, +${edgeCount} edges)`], repoPath, env);
  }

  await client.close();
  console.log('Migration complete.');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
