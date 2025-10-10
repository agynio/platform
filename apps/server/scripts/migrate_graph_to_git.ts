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
  dynamicConfig?: unknown;
  position?: { x: number; y: number };
}
interface PersistedGraphEdge {
  id?: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
interface PersistedGraph {
  name: string;
  version: number;
  updatedAt: string;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
}
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
  const flattenToRoot = String(process.env.FLATTEN_TO_ROOT || '').toLowerCase() === 'true';
  const onlyGraphName = process.env.GRAPH_NAME || '';

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db();
  const col: Collection<GraphDocument> = db.collection('graphs');

  await ensureRepo(repoPath, branch);

  const cursor = flattenToRoot && onlyGraphName ? col.find({ _id: onlyGraphName }) : col.find({});
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: authorName,
    GIT_AUTHOR_EMAIL: authorEmail,
    GIT_COMMITTER_NAME: authorName,
    GIT_COMMITTER_EMAIL: authorEmail,
  };
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) break;
    const name = doc._id;
    // Normalize edges to deterministic ids
    const normalizedEdges = (doc.edges || []).map((e) => {
      const det = edgeId(e);
      return { ...e, id: det };
    });
    const normalizedNodes = (doc.nodes || []).map((n) => ({ id: n.id, template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, position: n.position }));

    // Default mode: per-graph per-file under graphs/<name>/
    if (!flattenToRoot) {
      const base = path.posix.join('graphs', name);
      const targetBase = path.join(repoPath, base);
      // write nodes/edges in parallel
      const nodeWrites = normalizedNodes.map((n) => {
        const rel = path.posix.join(base, 'nodes', `${encodeURIComponent(n.id)}.json`);
        return atomicWrite(path.join(repoPath, rel), JSON.stringify(n, null, 2));
      });
      const edgeWrites = normalizedEdges.map((e) => {
        const rel = path.posix.join(base, 'edges', `${encodeURIComponent(e.id!)}.json`);
        return atomicWrite(path.join(repoPath, rel), JSON.stringify(e, null, 2));
      });
      await Promise.all([...nodeWrites, ...edgeWrites]);
      // meta last
      const meta = { name, version: doc.version, updatedAt: doc.updatedAt.toISOString(), format: 2 as const };
      await atomicWrite(path.join(targetBase, 'graph.meta.json'), JSON.stringify(meta, null, 2));
      // Stage new/updated files
      await runGit(['add', '--all', path.posix.join(base, 'graph.meta.json'), path.posix.join(base, 'nodes'), path.posix.join(base, 'edges')], repoPath);
      // Remove legacy monolith if present
      try { await runGit(['rm', '-f', '--ignore-unmatch', path.posix.join('graphs', name, 'graph.json')], repoPath); } catch {}
      const nodeCount = normalizedNodes.length;
      const edgeCount = normalizedEdges.length;
      if (await hasStagedChanges(repoPath)) {
        await runGit(['commit', '-m', `chore(graph): migrate ${name} to per-file v${doc.version} (+${nodeCount} nodes, +${edgeCount} edges)`], repoPath, env);
      }
    } else {
      // Flatten-to-root mode for a single graph
      if (!onlyGraphName || onlyGraphName !== name) {
        // Skip non-target graphs in flatten mode
        continue;
      }
      // write nodes/edges in parallel
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
      const meta = { name, version: doc.version, updatedAt: doc.updatedAt.toISOString(), format: 2 as const };
      await atomicWrite(path.join(repoPath, 'graph.meta.json'), JSON.stringify(meta, null, 2));
      // Stage files and deletion of graphs/
      await runGit(['add', '--all', 'graph.meta.json', path.posix.join('nodes'), path.posix.join('edges')], repoPath);
      if (await pathExists(path.join(repoPath, 'graphs'))) {
        try { await runGit(['rm', '-r', '--ignore-unmatch', 'graphs'], repoPath); } catch {}
      }
      if (await hasStagedChanges(repoPath)) {
        await runGit(['commit', '-m', `chore(graph): migrate ${name} to per-file root layout v${doc.version}`], repoPath, env);
      }
    }
  }

  await client.close();
  console.log('Migration complete.');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
