import { parseArgs } from 'node:util';
import path from 'node:path';

import type { MigrationMode, MigrationOptions } from './types';

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

type RawOptionValues = {
  input?: string;
  include?: string[] | string;
  exclude?: string[] | string;
  'dry-run'?: boolean;
  write?: boolean;
  backup?: boolean;
  'default-mount'?: string;
  'known-mounts'?: string;
  'validate-schema'?: boolean;
  verbose?: boolean;
};

const toArray = (value: string[] | string | undefined): string[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const sanitizePatterns = (patterns: string[], flag: '--include' | '--exclude'): string[] => {
  const sanitized: string[] = [];
  for (const raw of patterns) {
    const value = raw.trim();
    if (!value) throw new CliError(`${flag} cannot be empty`);
    sanitized.push(value);
  }
  return sanitized;
};

const resolveMode = (values: RawOptionValues): MigrationMode => {
  const dryRun = values['dry-run'];
  const write = values.write;
  if (dryRun && write) throw new CliError('Cannot use --dry-run and --write together');
  if (write) return 'write';
  return 'dry-run';
};

const normalizeArgv = (argv: readonly string[]): {
  args: string[];
  backupNegated: boolean;
  validateSchemaNegated: boolean;
} => {
  let backupNegated = false;
  let validateSchemaNegated = false;
  const args: string[] = [];

  for (const arg of argv) {
    if (arg === '--no-backup') {
      backupNegated = true;
      continue;
    }
    if (arg === '--no-validate-schema') {
      validateSchemaNegated = true;
      continue;
    }
    args.push(arg);
  }

  return { args, backupNegated, validateSchemaNegated };
};

export const parseCliOptions = (argv: readonly string[], cwd: string): MigrationOptions => {
  const normalized = normalizeArgv(argv);
  const { values, positionals } = parseArgs({
    args: normalized.args,
    options: {
      input: { type: 'string' },
      include: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean' },
      write: { type: 'boolean' },
      backup: { type: 'boolean' },
      'default-mount': { type: 'string' },
      'known-mounts': { type: 'string' },
      'validate-schema': { type: 'boolean' },
      verbose: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) throw new CliError(`Unexpected arguments: ${positionals.join(' ')}`);

  const input = (values.input ?? '').trim();
  if (!input) throw new CliError('--input <path|glob> is required');

  const includes = sanitizePatterns(toArray(values.include), '--include');
  const excludes = sanitizePatterns(toArray(values.exclude), '--exclude');

  const defaultMount = (values['default-mount'] ?? 'secret').trim();
  if (!defaultMount) throw new CliError('--default-mount cannot be empty');

  const knownMountsInput = values['known-mounts'] ?? 'secret';
  const knownMounts = knownMountsInput
    .split(',')
    .map((mount) => mount.trim())
    .filter((mount) => mount.length > 0);
  if (knownMounts.length === 0) throw new CliError('--known-mounts must include at least one mount');

  const dedupedKnownMounts = Array.from(new Set(knownMounts));

  const mode = resolveMode(values);

  if (normalized.backupNegated && values.backup === true)
    throw new CliError('Cannot use --backup and --no-backup together');
  if (normalized.validateSchemaNegated && values['validate-schema'] === true)
    throw new CliError('Cannot use --validate-schema and --no-validate-schema together');

  const backup = normalized.backupNegated ? false : values.backup ?? true;
  const validateSchema = normalized.validateSchemaNegated ? false : values['validate-schema'] ?? true;
  const verbose = values.verbose ?? false;

  return {
    input: path.resolve(cwd, input),
    includes,
    excludes,
    mode,
    backup,
    defaultMount,
    knownMounts: dedupedKnownMounts,
    validateSchema,
    verbose,
    cwd,
  };
};
