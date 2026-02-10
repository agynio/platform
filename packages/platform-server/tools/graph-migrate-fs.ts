#!/usr/bin/env tsx
import { promises as fs } from 'fs';
import path from 'path';
import { parseYaml } from '../src/graph/yaml.util';

type Options = {
  source: string;
  target: string;
  dataset: string;
  force: boolean;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { source: './data/graph', target: './data/graph', dataset: 'main', force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source' && argv[i + 1]) {
      opts.source = argv[++i];
      continue;
    }
    if (arg === '--target' && argv[i + 1]) {
      opts.target = argv[++i];
      continue;
    }
    if (arg === '--dataset' && argv[i + 1]) {
      opts.dataset = argv[++i];
      continue;
    }
    if (arg === '--force') {
      opts.force = true;
      continue;
    }
    if (arg === '--help') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  opts.dataset = opts.dataset.trim() || 'main';
  return opts;
}

function printUsage(): void {
  console.log(`Usage: pnpm --filter @agyn/platform-server graph:migrate-fs -- [--source <legacyPath>] [--target <graphDataPath>] [--dataset <name>] [--force]

Copies the legacy Git-backed graph layout into the filesystem dataset layout.
- source: path to the legacy working tree (default ./data/graph)
- target: path to the new GRAPH_DATA_PATH root (default ./data/graph)
- dataset: dataset name under target/datasets (default main)
- force: overwrite existing dataset contents if present
`);
}

async function ensureDatasetRoot(root: string, force: boolean): Promise<void> {
  if (await pathExists(root)) {
    if (!force) {
      const entries = await fs.readdir(root);
      if (entries.length) {
        throw new Error(`Dataset path ${root} already exists and is not empty. Re-run with --force to overwrite.`);
      }
    } else {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, 'nodes'), { recursive: true });
  await fs.mkdir(path.join(root, 'edges'), { recursive: true });
  await fs.mkdir(path.join(root, 'snapshots'), { recursive: true });
}

async function copyIfExists(src: string, dest: string): Promise<void> {
  if (!(await pathExists(src))) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDirIfExists(src: string, dest: string): Promise<void> {
  if (!(await pathExists(src))) {
    await fs.mkdir(dest, { recursive: true });
    return;
  }
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(src, dest, { recursive: true });
}

async function createSnapshot(datasetRoot: string, version: number): Promise<void> {
  const snapshotsRoot = path.join(datasetRoot, 'snapshots');
  await fs.mkdir(snapshotsRoot, { recursive: true });
  const versionDir = path.join(snapshotsRoot, String(version));
  await fs.rm(versionDir, { recursive: true, force: true });
  await fs.mkdir(path.join(versionDir, 'nodes'), { recursive: true });
  await fs.mkdir(path.join(versionDir, 'edges'), { recursive: true });
  await copyIfExists(path.join(datasetRoot, 'graph.meta.yaml'), path.join(versionDir, 'graph.meta.yaml'));
  await copyIfExists(path.join(datasetRoot, 'variables.yaml'), path.join(versionDir, 'variables.yaml'));
  await copyDirIfExists(path.join(datasetRoot, 'nodes'), path.join(versionDir, 'nodes'));
  await copyDirIfExists(path.join(datasetRoot, 'edges'), path.join(versionDir, 'edges'));
}

async function archiveGitDir(source: string): Promise<string | null> {
  const gitDir = path.join(source, '.git');
  if (!(await pathExists(gitDir))) return null;
  const backupName = `.git.backup-${Date.now()}`;
  const backupPath = path.join(source, backupName);
  await fs.rename(gitDir, backupPath);
  return backupPath;
}

async function writePointer(targetRoot: string, dataset: string): Promise<void> {
  const pointerPath = path.join(targetRoot, 'active-dataset.txt');
  await fs.mkdir(path.dirname(pointerPath), { recursive: true });
  await fs.writeFile(pointerPath, `${dataset}\n`, 'utf8');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = path.resolve(opts.source);
  const target = path.resolve(opts.target);
  const datasetRoot = path.join(target, 'datasets', opts.dataset);

  console.log(`Migrating graph data from ${source} -> ${datasetRoot}`);
  await ensureDatasetRoot(datasetRoot, opts.force);

  await copyIfExists(path.join(source, 'graph.meta.yaml'), path.join(datasetRoot, 'graph.meta.yaml'));
  await copyIfExists(path.join(source, 'variables.yaml'), path.join(datasetRoot, 'variables.yaml'));
  await copyDirIfExists(path.join(source, 'nodes'), path.join(datasetRoot, 'nodes'));
  await copyDirIfExists(path.join(source, 'edges'), path.join(datasetRoot, 'edges'));

  let version = 0;
  try {
    const metaRaw = await fs.readFile(path.join(datasetRoot, 'graph.meta.yaml'), 'utf8');
    const parsed = parseYaml<{ version?: number }>(metaRaw);
    version = Number(parsed?.version ?? 0);
  } catch {
    // leave version at 0
  }
  await createSnapshot(datasetRoot, version);
  await fs.writeFile(path.join(datasetRoot, 'journal.ndjson'), '', 'utf8');

  const archivedGit = await archiveGitDir(source);
  if (archivedGit) {
    console.log(`Archived legacy .git directory to ${archivedGit}`);
  }

  await writePointer(target, opts.dataset);

  console.log('Migration complete. Review datasets directory and restart the server.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
