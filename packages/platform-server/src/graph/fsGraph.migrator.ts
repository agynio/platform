import { promises as fs } from 'fs';
import path from 'path';
import { parseYaml } from './yaml.util';

export type FsGraphMigrationOptions = {
  source: string;
  target: string;
  dataset: string;
  force?: boolean;
  log?: (message: string) => void;
};

type MigrationResult = {
  datasetRoot: string;
  archivedGit?: string | null;
};

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.stat(candidate);
    return true;
  } catch {
    return false;
  }
}

async function ensureDatasetRoot(root: string, force: boolean | undefined): Promise<void> {
  if (await pathExists(root)) {
    if (!force) {
      const entries = await fs.readdir(root);
      if (entries.length) {
        throw new Error(`Dataset path ${root} already exists and is not empty. Re-run with --force/GRAPH_AUTO_MIGRATE=1 to overwrite.`);
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

export async function migrateLegacyWorkingTree(options: FsGraphMigrationOptions): Promise<MigrationResult> {
  const { source, target, dataset, force, log } = options;
  const datasetRoot = path.join(target, 'datasets', dataset.trim() || 'main');

  log?.(`Migrating legacy graph from ${source} -> ${datasetRoot}`);
  await ensureDatasetRoot(datasetRoot, force);

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
    // leave default version
  }

  await createSnapshot(datasetRoot, version);
  await fs.writeFile(path.join(datasetRoot, 'journal.ndjson'), '', 'utf8');

  const archivedGit = await archiveGitDir(source);
  if (archivedGit) {
    log?.(`Archived legacy .git directory to ${archivedGit}`);
  }

  await writePointer(target, dataset);
  log?.('Migration complete. Review datasets directory and restart the server.');
  return { datasetRoot, archivedGit };
}
