# JSON → YAML Graph Migration

The Node-based `graph-converter` CLI normalizes graph JSON entities and emits
YAML that matches the runtime store configuration (two-space indent, unlimited
line width, stable key order). Use the CLI locally when migrating repositories
or validating committed graph snapshots; runtime persistence now expects YAML
exclusively, so convert any JSON snapshots before starting the server.

## Installation

```bash
pnpm install
pnpm --filter @agyn/graph-converter run build
```

## Usage

```bash
pnpm convert-graphs -- --root ./graph --in-place --schema-migrate --strict
```

This CLI is intended for offline migrations. The platform server no longer
reads JSON graph files at runtime.

Flags:

- `--root`: graph repository root (defaults to `process.cwd()`)
- `--files`: space separated glob patterns relative to `--root`
- `--in-place`: write YAML files next to each JSON source
- `--backup [ext]`: move original JSON to `<file>.json<ext>` after success
- `--dry-run`: log planned writes without touching disk
- `--validate-only`: validate JSON without producing YAML
- `--schema-migrate`: derive deterministic ids and normalize variables
- `--strict`: enable Ajv strict mode (`additionalProperties=false`)
- `--output-ext`: emitted extension (default `.yaml`)
- `--no-atomic`: disable the default atomic write strategy
- `--verbose`: emit verbose log output

Atomic writes are enabled by default and ensure conversions land in temporary
files before a final rename + fsync. Pass `--no-atomic` only when working with
filesystems that do not support the atomic strategy.

Exit codes:

- `0`: success
- `1`: schema or reference validation failure
- `2`: IO or parse error

## Local testing

Converter tests are local-only (they do not run in CI):

```bash
pnpm --filter @agyn/graph-converter run test:local
```
