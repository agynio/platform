import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CliError, parseCliOptions } from '../../tools/graph-ref-migrate/options';

const cwd = process.cwd();

describe('parseCliOptions', () => {
  it('parses required input with defaults', () => {
    const options = parseCliOptions(['--input', 'graphs/*.json'], cwd);

    expect(options.mode).toBe('dry-run');
    expect(options.backup).toBe(true);
    expect(options.defaultMount).toBe('secret');
    expect(options.knownMounts).toEqual(['secret']);
    expect(options.validateSchema).toBe(true);
    expect(options.verbose).toBe(false);
    expect(options.includes).toEqual([]);
    expect(options.excludes).toEqual([]);
    expect(options.input).toBe(path.resolve(cwd, 'graphs/*.json'));
  });

  it('honors overrides and negated flags', () => {
    const options = parseCliOptions(
      [
        '--input',
        './data',
        '--include',
        'nodes/**/*.json',
        '--include',
        'edges/**/*.json',
        '--exclude',
        '**/*.bak',
        '--write',
        '--no-backup',
        '--default-mount',
        'kv',
        '--known-mounts',
        'secret, kv ,internal,secret',
        '--no-validate-schema',
        '--verbose',
      ],
      cwd,
    );

    expect(options.mode).toBe('write');
    expect(options.backup).toBe(false);
    expect(options.defaultMount).toBe('kv');
    expect(options.knownMounts).toEqual(['secret', 'kv', 'internal']);
    expect(options.validateSchema).toBe(false);
    expect(options.verbose).toBe(true);
    expect(options.includes).toEqual(['nodes/**/*.json', 'edges/**/*.json']);
    expect(options.excludes).toEqual(['**/*.bak']);
  });

  it('throws when mutually exclusive flags are provided', () => {
    expect(() => parseCliOptions(['--input', 'graph.json', '--write', '--dry-run'], cwd)).toThrow(CliError);
  });
});
