#!/bin/sh
# Development-only auto initialization & diagnostics helper for Vault.
# Behavior:
#   - Waits for Vault API availability.
#   - If vault is uninitialized: runs 'vault operator init -format=json'.
#   - Writes initialization artifacts into $VAULT_DATA_DIR:
#       * cluster-keys.json  (full init JSON output)
#       * root-token.txt     (root token, single line)
#       * unseal-keys.txt    (one unseal key per line)  <-- sealing keys stored on disk
#   - Automatically unseals Vault using the stored unseal keys (threshold assumed satisfied).
#   - Ensures a KV v2 secrets engine is enabled at path 'secrets/' for dev usage (with sample secret).
#   - Emits diagnostics (human + JSON + parsed booleans).
# Idempotency: if already initialized/unsealed it performs only diagnostics.
#
# SECURITY WARNING: Storing root token and unseal keys on disk is acceptable ONLY for local
# development/testing. Do NOT use this approach in production; instead leverage a secure
# auto-unseal mechanism (e.g., KMS / HSM) and secret management for the root token.
#
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

init_vault() {
  # Only run if not already initialized. Caller must have determined state.
  log "initializing Vault (dev helper)"
  INIT_JSON=$(vault operator init -format=json 2>/dev/null)
  if [ -z "$INIT_JSON" ]; then
    log "ERROR: vault operator init returned empty output" >&2
    return 1
  fi
  mkdir -p "$VAULT_DATA_DIR"
  printf '%s' "$INIT_JSON" >"$VAULT_DATA_DIR/cluster-keys.json"
  # Extract root token (best-effort without jq)
  ROOT_TOKEN=$(printf '%s' "$INIT_JSON" | sed -n 's/.*"root_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
  if [ -n "$ROOT_TOKEN" ]; then
    printf '%s\n' "$ROOT_TOKEN" >"$VAULT_DATA_DIR/root-token.txt"
  fi
  # Extract unseal keys from 'unseal_keys_b64' array (modern Vault output)
  UNSEAL_KEYS=$(printf '%s' "$INIT_JSON" | awk '
    /"unseal_keys_b64"/ {in_arr=1}
    in_arr {
      if ($0 ~ /\[/) next
      if ($0 ~ /\]/) {in_arr=0; next}
      gsub(/^[[:space:]]*"/, ""); gsub(/",?[[:space:]]*$/, "");
      if (length($0)>0) print $0;
    }
  ')
  # Fallback to legacy keys_base64 (single-line array) if needed
  if [ -z "$UNSEAL_KEYS" ]; then
    UNSEAL_KEYS=$(printf '%s' "$INIT_JSON" | sed -n 's/.*"keys_base64"[[:space:]]*:[[:space:]]*\[\(.*\)\].*/\1/p' | tr ',' '\n' | sed 's/^[[:space:]]*"\(.*\)"[[:space:]]*$/\1/')
  fi
  if [ -n "$UNSEAL_KEYS" ]; then
    printf '%s\n' "$UNSEAL_KEYS" >"$VAULT_DATA_DIR/unseal-keys.txt"
    key_count=$(printf '%s\n' "$UNSEAL_KEYS" | wc -l | tr -d ' ')
    log "extracted $key_count unseal key(s)"
  else
    log "WARNING: no unseal keys extracted from init output" >&2
  fi
  log "Vault initialized; keys written to $VAULT_DATA_DIR"
  return 0
}

unseal_vault() {
  # Use keys from unseal-keys.txt if present
  if [ ! -f "$VAULT_DATA_DIR/unseal-keys.txt" ]; then
    log "unseal keys file not found (expected $VAULT_DATA_DIR/unseal-keys.txt); skipping unseal attempt" >&2
    return 1
  fi
  # Determine threshold (t) from status if available so we stop early once met
  CUR_JSON=$(vault_status_json)
  threshold=$(printf '%s' "$CUR_JSON" | sed -n 's/.*"t"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -n1)
  applied=0
  while read -r k; do
    [ -n "$k" ] || continue
    applied=$((applied+1))
    log "applying unseal key $applied"
    vault operator unseal "$k" >/dev/null 2>&1 || true
    CUR_JSON=$(vault_status_json)
    sealed=$(parse_bool_field sealed "$CUR_JSON")
    progress=$(printf '%s' "$CUR_JSON" | sed -n 's/.*"progress"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -n1)
    log "unseal progress: ${progress:-?}/${threshold:-?} sealed=${sealed:-?}"
    if [ "$sealed" = "false" ]; then
      log "vault unsealed after $applied key(s)"
      return 0
    fi
  done <"$VAULT_DATA_DIR/unseal-keys.txt"
  log "vault still sealed after trying provided keys" >&2
  return 1
}

ensure_initialized_and_unsealed() {
  # Determine current state
  JSON_NOW=$(vault_status_json)
  if [ -z "$JSON_NOW" ]; then
    log "ERROR: cannot fetch status JSON for init check" >&2
    return 1
  fi
  init_field=$(parse_bool_field initialized "$JSON_NOW")
  sealed_field=$(parse_bool_field sealed "$JSON_NOW")
  if [ "$init_field" = "false" ]; then
    init_vault || return 1
    # Refresh status after init
    JSON_NOW=$(vault_status_json)
    sealed_field=$(parse_bool_field sealed "$JSON_NOW")
  fi
  if [ "$sealed_field" = "true" ]; then
    unseal_vault || return 1
  fi
  return 0
}

create_dev_root_token() {
  # Create deterministic dev root token (id "dev-root") if VAULT_DEV_ROOT_TOKEN_ID not already set.
  # Requires an existing root token (from init) for authentication.
  [ -f "$VAULT_DATA_DIR/root-token.txt" ] || { log "no root-token.txt available; cannot create dev root token" >&2; return 1; }
  DEV_ID="dev-root"
  # If already authenticated or token exists, skip.
  if VAULT_TOKEN=$(cat "$VAULT_DATA_DIR/root-token.txt" 2>/dev/null); then
    export VAULT_TOKEN
  else
    log "could not read root token file" >&2
    return 1
  fi
  # Check if a token with accessor list already contains DEV_ID (best-effort; will not reveal id). We attempt a lookup.
  vault token lookup "$DEV_ID" >/dev/null 2>&1 && { log "dev root token already exists"; return 0; }
  # Create with root policy (root token can create arbitrary token IDs).
  vault token create -id="$DEV_ID" -policy=root -display-name="dev-root" >/dev/null 2>&1 && {
    printf '%s\n' "$DEV_ID" >"$VAULT_DATA_DIR/dev-root.txt"
    log "created dev root token (id=$DEV_ID)"
    return 0
  }
  log "failed to create dev root token" >&2
  return 1
}

ensure_kv_v2() {
  # Requires authentication (root or dev-root). Assumes VAULT_TOKEN already exported.
  # Idempotent: checks existing mounts before enabling.
  vault secrets list -format=json 2>/dev/null | grep '"secrets/"' >/dev/null 2>&1 && {
    log "secrets/ already enabled"
    return 0
  }
  # Enable KV v2 at secrets/ path
  vault secrets enable -path=secrets -version=2 kv >/dev/null 2>&1 && {
    log "enabled kv v2 at path secrets/"
    # Write sample secret 'secrets/example' with key 'token' and random value
    RAND_VALUE=$(head -c 16 /dev/urandom | base64 | tr -d '=\n/' | cut -c1-22)
    vault kv put secrets/example token="$RAND_VALUE" >/dev/null 2>&1 || true
    return 0
  }
  log "failed to enable kv v2 at secrets/" >&2
  return 1
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
  ensure_initialized_and_unsealed || log "WARNING: ensure_initialized_and_unsealed encountered an issue (continuing to diagnostics)" >&2
  # Attempt dev root token creation (non-fatal if fails)
  create_dev_root_token || true
  # Export dev-root token if created for subsequent operations (e.g., enabling kv)
  if [ -f "$VAULT_DATA_DIR/dev-root.txt" ]; then
    export VAULT_TOKEN="$(cat "$VAULT_DATA_DIR/dev-root.txt" 2>/dev/null)"
  fi
  ensure_kv_v2 || log "WARNING: unable to ensure kv v2 mount" >&2
  diagnostics
}

main "$@"
