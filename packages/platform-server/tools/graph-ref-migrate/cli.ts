import process from 'node:process';
import type { Writable } from 'node:stream';

import { CliError, parseCliOptions } from './options';
import { runMigration } from './run';
import type { Logger, MigrationOptions, MigrationSummary } from './types';

type CliIO = {
  stdout: Writable;
  stderr: Writable;
};

const defaultIO: CliIO = {
  stdout: process.stdout,
  stderr: process.stderr,
};

const createLogger = (io: CliIO, verbose: boolean): Logger => ({
  info: (message) => {
    io.stdout.write(`${message}\n`);
  },
  warn: (message) => {
    io.stderr.write(`WARNING: ${message}\n`);
  },
  error: (message) => {
    io.stderr.write(`ERROR: ${message}\n`);
  },
  verbose: (message) => {
    if (verbose) io.stdout.write(`${message}\n`);
  },
});

const printSummary = (summary: MigrationSummary, logger: Logger): void => {
  const totalFiles = summary.files.length;
  const filesWithChanges = summary.files.filter((file) => file.changed).length;
  const appliedChanges = summary.mode === 'write' ? summary.files.filter((file) => file.changed && !file.skipped).length : 0;
  const skipped = summary.files.filter((file) => file.skipped).length;
  const totalConversions = summary.files.reduce((acc, file) => acc + file.conversions.length, 0);
  const totalErrors = summary.files.reduce((acc, file) => acc + file.errors.length, 0);

  logger.info(
    `Summary: ${totalFiles} file(s), ${filesWithChanges} with changes, ${appliedChanges} applied, ${skipped} skipped, ${totalConversions} conversions, ${totalErrors} error(s)`,
  );
};

const hasFailures = (summary: MigrationSummary): boolean => summary.files.some((file) => file.errors.length > 0);

export const main = async (argv: readonly string[] = process.argv.slice(2), io: CliIO = defaultIO): Promise<number> => {
  let options: MigrationOptions;
  try {
    options = parseCliOptions(argv, process.cwd());
  } catch (error) {
    const message = error instanceof CliError ? error.message : (error as Error).message;
    io.stderr.write(`ERROR: ${message}\n`);
    return 1;
  }

  const logger = createLogger(io, options.verbose);

  try {
    const summary = await runMigration(options, logger);
    printSummary(summary, logger);
    if (hasFailures(summary)) {
      logger.error('Migration completed with errors');
      return 1;
    }
    logger.info('Migration completed successfully');
    return 0;
  } catch (error) {
    const message = error instanceof CliError ? error.message : (error as Error).message;
    logger.error(message);
    return 1;
  }
};
