import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

import fg from 'fast-glob';
import picomatch from 'picomatch';

import { migrateValue } from './transform';
import type { FileOutcome, Logger, MigrationOptions, MigrationSummary } from './types';

const detectIndent = (raw: string): string => {
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\s+)"/);
    if (match) return match[1];
  }
  return '  ';
};

const detectNewline = (raw: string): '\n' | '\r\n' => (raw.includes('\r\n') ? '\r\n' : '\n');

const formatJson = (value: unknown, indent: string, newline: '\n' | '\r\n', hadTrailingNewline: boolean): string => {
  const json = JSON.stringify(value, null, indent);
  const normalized = newline === '\n' ? json : json.replace(/\n/g, newline);
  if (hadTrailingNewline) return normalized.endsWith(newline) ? normalized : normalized + newline;
  return normalized.endsWith(newline) ? normalized.slice(0, -newline.length) : normalized;
};

const randomSuffix = (): string => Math.random().toString(16).slice(2, 10);

const atomicWriteFile = async (targetPath: string, contents: string): Promise<void> => {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tempPath = path.join(dir, `.${base}.tmp-${randomSuffix()}`);
  await fs.writeFile(tempPath, contents, 'utf8');
  await fs.rename(tempPath, targetPath);
};

const createBackup = async (targetPath: string, timestamp: string): Promise<string> => {
  const backupPath = `${targetPath}.backup-${timestamp}`;
  await fs.copyFile(targetPath, backupPath, fsConstants.COPYFILE_EXCL).catch(async (error: unknown) => {
    if ((error as { code?: string }).code === 'EEXIST') return;
    throw error;
  });
  return backupPath;
};

const writeFileWithOptionalBackup = async (params: {
  filePath: string;
  contents: string;
  backup: boolean;
  timestamp: string;
}): Promise<void> => {
  const { filePath, contents, backup, timestamp } = params;
  if (backup) await createBackup(filePath, timestamp);
  await atomicWriteFile(filePath, contents);
};

const persistChanges = async (params: {
  filePath: string;
  raw: string;
  value: unknown;
  backup: boolean;
  timestamp: string;
  logger: Logger;
  relativePath: string;
}): Promise<void> => {
  const { filePath, raw, value, backup, timestamp, logger, relativePath } = params;
  const indent = detectIndent(raw);
  const newline = detectNewline(raw);
  const hadTrailingNewline = raw.endsWith(newline);
  const next = formatJson(value, indent, newline, hadTrailingNewline);
  if (next === raw) {
    logger.verbose(`No serialized diff for ${relativePath}`);
    return;
  }
  await writeFileWithOptionalBackup({ filePath, contents: next, backup, timestamp });
  logger.info(`Updated ${relativePath}`);
};

const resolveFiles = async (options: MigrationOptions): Promise<string[]> => {
  const { input, cwd } = options;
  const result: string[] = [];
  try {
    const stat = await fs.stat(input);
    if (stat.isDirectory()) {
      const pattern = path.join(input, '**/*.json');
      const matches = await fg(pattern, { dot: false, onlyFiles: true, absolute: true, followSymbolicLinks: false });
      result.push(...matches);
      return result;
    }
    if (stat.isFile()) {
      result.push(input);
      return result;
    }
  } catch {
    // Treat as glob below
  }

  const matches = await fg(input, { dot: false, onlyFiles: true, absolute: true, followSymbolicLinks: false, cwd });
  result.push(...matches);
  return result;
};

const applyIncludesExcludes = (files: string[], options: MigrationOptions): string[] => {
  if (files.length === 0) return files;
  const relative = files.map((file) => ({ absolute: file, relative: path.relative(options.cwd, file) }));

  const includeMatchers = options.includes.map((pattern) => picomatch(pattern));
  const excludeMatchers = options.excludes.map((pattern) => picomatch(pattern));

  return relative
    .filter(({ relative: rel }) => {
      if (includeMatchers.length > 0 && !includeMatchers.some((match) => match(rel))) return false;
      if (excludeMatchers.some((match) => match(rel))) return false;
      return true;
    })
    .map(({ absolute }) => absolute);
};

export const runMigration = async (options: MigrationOptions, logger: Logger): Promise<MigrationSummary> => {
  const files = applyIncludesExcludes(await resolveFiles(options), options);
  if (files.length === 0) throw new Error('No files matched the provided input patterns');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results: FileOutcome[] = [];
  const knownMounts = new Set(options.knownMounts);

  for (const filePath of files) {
    const relativePath = path.relative(options.cwd, filePath);
    logger.info(`Processing ${relativePath}`);
    const outcome: FileOutcome = { path: filePath, changed: false, conversions: [], errors: [] };

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      outcome.errors.push({ pointer: '/', message: `Failed to read file: ${(error as Error).message}` });
      outcome.skipped = true;
      results.push(outcome);
      logger.error(`Read failed for ${relativePath}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      outcome.errors.push({ pointer: '/', message: `Invalid JSON: ${(error as Error).message}` });
      outcome.skipped = true;
      results.push(outcome);
      logger.error(`Invalid JSON in ${relativePath}`);
      continue;
    }

    const migrated = migrateValue(
      parsed,
      { defaultMount: options.defaultMount, knownMounts },
      { validate: options.validateSchema },
    );
    outcome.changed = migrated.changed;
    outcome.conversions = migrated.conversions;
    outcome.errors.push(...migrated.errors);

    if (outcome.conversions.length > 0) {
      for (const conversion of outcome.conversions) {
        const detail = conversion.usedDefaultMount ? ' (default mount applied)' : '';
        logger.verbose(`Converted ${conversion.legacy} -> ${conversion.kind} at ${conversion.pointer}${detail}`);
      }
    }

    if (outcome.errors.length > 0) {
      outcome.skipped = true;
      for (const error of outcome.errors) logger.error(`${error.pointer}: ${error.message}`);
    }

    if (!outcome.changed || outcome.skipped) {
      results.push(outcome);
      continue;
    }

    if (options.mode === 'write') {
      await persistChanges({
        filePath,
        raw,
        value: migrated.value,
        backup: options.backup,
        timestamp,
        logger,
        relativePath,
      });
    } else if (options.mode === 'dry-run') {
      logger.info(`Would update ${relativePath}`);
    }

    results.push(outcome);
  }

  return { files: results, mode: options.mode };
};
