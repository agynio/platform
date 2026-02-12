#!/usr/bin/env tsx
import path from 'path';
import { migrateLegacyWorkingTree } from '../src/graph/fsGraph.migrator';

type Options = {
  source: string;
  target: string;
  dataset: string;
  force: boolean;
};

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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = path.resolve(opts.source);
  const target = path.resolve(opts.target);
  await migrateLegacyWorkingTree({
    source,
    target,
    dataset: opts.dataset,
    force: opts.force,
    log: (message) => console.log(message),
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
