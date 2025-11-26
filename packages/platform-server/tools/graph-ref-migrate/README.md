# graph-ref-migrate

CLI for normalizing legacy graph reference objects to the canonical schema.

## Usage

```bash
pnpm --filter @agyn/platform-server exec graph-ref-migrate --input /path/to/graph/**/*.json --dry-run
```

Run with `--write` to persist changes. Dry-run is the default when neither
`--dry-run` nor `--write` is supplied.

### Options

| Flag | Description |
| --- | --- |
| `--input <path|glob>` | Required file/directory/glob selection. Directories expand to `**/*.json`. |
| `--include <glob>` | Optional additional glob filter (repeatable). |
| `--exclude <glob>` | Optional glob patterns to skip (repeatable). |
| `--dry-run` / `--write` | Preview vs. persist (mutually exclusive). |
| `--backup` / `--no-backup` | Create timestamped `.backup-…` copies before writes (default `true`). |
| `--default-mount <name>` | Canonical vault mount name (default `secret`). |
| `--validate-schema` / `--no-validate-schema` | Enable canonical ref + node sanity checks (default `true`). |
| `--verbose` | Emit per-reference conversion details. |

The tool recursively traverses node `config` and `state` objects, replaces
legacy reference shapes, and preserves JSON indentation and newline style. On
write, updates are applied atomically with temporary files and optional
backups.

### Examples

Preview conversions beneath a git-backed graph working tree:

```bash
pnpm --filter @agyn/platform-server exec graph-ref-migrate \
  --input ./graphs/main \
  --include 'nodes/**/*.json' \
  --dry-run --verbose
```

Apply migrations, disable backups, and skip schema validation (when running in
an isolated clone):

```bash
pnpm --filter @agyn/platform-server exec graph-ref-migrate \
  --input ./graphs/main \
  --write --no-backup --no-validate-schema
```

If a file cannot be migrated (e.g., invalid legacy path), the tool records the
error, leaves the original file untouched, and exits with a non-zero status.

> Legacy vault references must contain at least three path segments (`mount/path/key`).
> Two-segment strings such as `secret/api-key` are flagged as errors and left
> unchanged so they can be reviewed manually.
