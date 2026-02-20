#!/bin/bash
set -euo pipefail

log() {
  printf '[ziti-prepare] %s\n' "$1"
}

ROOT_DIR=${1:-$(pwd)}
ZITI_DIR="${ROOT_DIR}/.ziti"
CONTROLLER_DIR="${ZITI_DIR}/controller"
IDENTITIES_DIR="${ZITI_DIR}/identities"
TMP_DIR="${ZITI_DIR}/tmp"

mkdir -p "$CONTROLLER_DIR" "$IDENTITIES_DIR" "$TMP_DIR"

log "Ensuring writable permissions under ${ZITI_DIR}"
chmod -R 0777 "$ZITI_DIR"

if command -v chcon >/dev/null 2>&1; then
  log 'Applying svirt_sandbox_file_t SELinux context'
  chcon -Rt svirt_sandbox_file_t "$ZITI_DIR" || log 'chcon failed (continuing)'
fi

log 'OpenZiti volume preparation complete'
