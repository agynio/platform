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
| `--default-mount <name>` | Canonical vault mount name when legacy refs omit it (default `secret`). |
| `--known-mounts <list>` | Comma-separated canonical mounts to treat as explicit (default `secret`). |
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

> Legacy vault references are parsed according to the following rules:
> - Values with three or more segments map to `mount/path/key` directly.
> - Two-segment values use the configured default mount **unless** the first
>   segment is in `--known-mounts`, in which case they are flagged as errors
>   (to avoid misinterpreting `mount/key` pairs without a path).
> - Strings starting with `/` or containing fewer than two segments are invalid.
