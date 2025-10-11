#!/bin/sh
# Development-only auto initialization & diagnostics helper for Vault.
# Safe to re-run: if already initialized/unsealed it exits gracefully.
# We do NOT use 'set -e' because Vault exit codes are used for state signaling.
set -u

MAX_WAIT=60
VAULT_DATA_DIR="/vault/file"

timestamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[vault-auto-init] %s\n' "$*"; }
diag_log() { printf '[vault-diagnostics] %s\n' "$*"; }

vault_status_json() {
  vault status -format=json 2>/dev/null || true
}

wait_for_vault() {
  log "waiting for Vault API (timeout: ${MAX_WAIT}s)..."
  i=0
  while [ $i -lt $MAX_WAIT ]; do
    STATUS_JSON=$(vault_status_json)
    if [ -n "$STATUS_JSON" ]; then
      printf '%s' "$STATUS_JSON"
      return 0
    fi
    i=$((i+1))
    sleep 1
  done
  return 1
}

parse_bool_field() {
  key="$1"; json="$2"
  printf '%s' "$json" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p" | head -n1
}

diagnostics() {
  diag_log "start $(timestamp)"
  diag_log "VAULT_ADDR=${VAULT_ADDR:-unset}"
  diag_log "running 'vault operator init -status'"
  vault operator init -status >/dev/null 2>&1
  EC=$?
  case $EC in
    0) STATE=initialized ;;
    2) STATE=uninitialized ;;
    *) STATE=unknown ;;
  esac
  diag_log "init_status_code=$EC mapped_state=$STATE"
  diag_log "vault status (human):" >&2
  vault status 2>&1 || true
  JSON=$(vault_status_json)
  if [ -n "$JSON" ]; then
    diag_log "vault status (json): $JSON" >&2
    parsed_initialized=$(parse_bool_field initialized "$JSON")
    parsed_sealed=$(parse_bool_field sealed "$JSON")
    if [ -n "$parsed_initialized" ] || [ -n "$parsed_sealed" ]; then
      diag_log "parsed.initialized=${parsed_initialized:-unknown} parsed.sealed=${parsed_sealed:-unknown}" >&2
    fi
  else
    diag_log "vault status JSON empty" >&2
  fi
  diag_log "end"
}

main() {
  log "start $(timestamp)"
  STATUS_JSON=$(wait_for_vault || true)
  if [ -z "${STATUS_JSON}" ]; then
    log "ERROR: Vault not reachable after ${MAX_WAIT}s" >&2
    exit 1
  fi
  log "checking initialization state"
  diagnostics
}

main "$@"

