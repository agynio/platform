#!/usr/bin/env tsx
import { MongoClient, Db, Collection } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface PersistedGraphNode { id: string; template: string; config?: any; dynamicConfig?: any; position?: { x: number; y: number } }
interface PersistedGraphEdge { id?: string; source: string; sourceHandle: string; target: string; targetHandle: string }
interface PersistedGraph { name: string; version: number; updatedAt: string; nodes: PersistedGraphNode[]; edges: PersistedGraphEdge[] }
interface GraphDocument { _id: string; version: number; updatedAt: Date; nodes: PersistedGraphNode[]; edges: PersistedGraphEdge[] }

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
  try { await runGit(['rev-parse', '--verify', branch], repoPath); } catch { await runGit(['branch', branch], repoPath); }
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

async function main() {
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/agents';
  const repoPath = process.env.GRAPH_REPO_PATH || './data/graph';
  const branch = process.env.GRAPH_BRANCH || 'graph-state';
  const authorName = process.env.GRAPH_AUTHOR_NAME || 'Graph Migrator';
  const authorEmail = process.env.GRAPH_AUTHOR_EMAIL || 'graph-migrator@example.com';

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db();
  const col: Collection<GraphDocument> = db.collection('graphs');

  await ensureRepo(repoPath, branch);

  const cursor = col.find({});
  const env = { ...process.env, GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: authorEmail, GIT_COMMITTER_NAME: authorName, GIT_COMMITTER_EMAIL: authorEmail };
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) break;
    const name = doc._id;
    const out: PersistedGraph = {
      name,
      version: doc.version,
      updatedAt: doc.updatedAt.toISOString(),
      nodes: doc.nodes,
      edges: doc.edges,
    };
    const dir = path.join(repoPath, 'graphs', name);
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, 'graph.json');
    const tmp = dest + `.tmp-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(out, null, 2));
    await fs.rename(tmp, dest);
    await runGit(['add', path.join('graphs', name, 'graph.json')], repoPath);
    if (await hasStagedChanges(repoPath)) {
      await runGit(['commit', '-m', `chore(graph): migrate ${name} v${out.version}`], repoPath, env);
    }
  }

  await client.close();
  console.log('Migration complete.');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
