#!/bin/bash
set -euo pipefail

log() {
  printf '[ziti-controller-init] %s\n' "$1"
}

ZITI_SCRIPTS=${ZITI_SCRIPTS:-/var/openziti/scripts}
ZITI_HOME=${ZITI_HOME:-/persistent}
IDENTITIES_DIR=${ZITI_IDENTITIES_DIR:-/identities}
TMP_DIR=${ZITI_IDENTITIES_TMP:-/ziti-tmp}
ROUTER_DISCOVERY_TIMEOUT=${ZITI_ROUTER_DISCOVERY_TIMEOUT_SECONDS:-300}
ROUTER_DISCOVERY_INTERVAL=${ZITI_ROUTER_DISCOVERY_INTERVAL_SECONDS:-2}
ENROLLMENT_DURATION_MINUTES=${ZITI_ENROLLMENT_DURATION_MINUTES:-1440}
ROUTER_PRESENT=false

APP_ATTRIBUTE='app.agyn-platform'
SERVICE_ATTRIBUTE='service.platform-api'
ROUTER_ATTRIBUTE='router.platform'
PLATFORM_ATTRIBUTE='component.platform-server'
RUNNER_ATTRIBUTE='component.docker-runner'

SERVICE_ROLE_ATTRIBUTES="${APP_ATTRIBUTE},${SERVICE_ATTRIBUTE}"
PLATFORM_ROLE_ATTRIBUTES="${APP_ATTRIBUTE},${PLATFORM_ATTRIBUTE}"
RUNNER_ROLE_ATTRIBUTES="${APP_ATTRIBUTE},${RUNNER_ATTRIBUTE}"
ROUTER_ROLE_ATTRIBUTES="${ROUTER_ATTRIBUTE}"

SERVICE_ROLES="#${SERVICE_ATTRIBUTE}"
PLATFORM_ROLES="#${PLATFORM_ATTRIBUTE}"
RUNNER_ROLES="#${RUNNER_ATTRIBUTE}"
ROUTER_ROLES="#${ROUTER_ATTRIBUTE}"

ZITI_SERVICE_NAME=${ZITI_SERVICE_NAME:-dev.agyn-platform.platform-api}
ZITI_PLATFORM_IDENTITY_NAME=${ZITI_PLATFORM_IDENTITY_NAME:-dev.agyn-platform.platform-server}
ZITI_RUNNER_IDENTITY_NAME=${ZITI_RUNNER_IDENTITY_NAME:-dev.agyn-platform.docker-runner}
ZITI_ROUTER_NAME=${ZITI_ROUTER_NAME:-dev-edge-router}
ZITI_PLATFORM_IDENTITY_FILE=${ZITI_PLATFORM_IDENTITY_FILE:-${IDENTITIES_DIR}/${ZITI_PLATFORM_IDENTITY_NAME}.json}
ZITI_RUNNER_IDENTITY_FILE=${ZITI_RUNNER_IDENTITY_FILE:-${IDENTITIES_DIR}/${ZITI_RUNNER_IDENTITY_NAME}.json}

umask 027
mkdir -p "${IDENTITIES_DIR}" "${TMP_DIR}"

wait_for_env_file() {
  while [[ ! -f "${ZITI_HOME}/ziti.env" ]]; do
    log "waiting for ${ZITI_HOME}/ziti.env"
    sleep 1
  done
  # give the controller a moment to finish writing the file
  sleep 1
}

source_environment() {
  wait_for_env_file
  # shellcheck disable=SC1091
  source "${ZITI_SCRIPTS}/ziti-cli-functions.sh"
  : "${ZITI_CTRL_EDGE_ADVERTISED_ADDRESS:=ziti-controller}"
  : "${ZITI_CTRL_EDGE_ADVERTISED_PORT:=1280}"
  : "${ZITI_USER:=admin}"
  : "${ZITI_PWD:=admin}"
  # shellcheck disable=SC1091
  source "${ZITI_HOME}/ziti.env"
  _wait_for_controller
  zitiLogin >/dev/null
  ZITI_BIN=${ZITI_BIN_DIR:-/var/openziti/ziti-bin}/ziti
}

entity_exists() {
  local resource=$1
  local name=$2
  local filter
  filter=$(printf 'name = "%s"' "$name")
  local output
  if ! output=$("${ZITI_BIN}" edge list "$resource" "$filter" -j 2>/dev/null); then
    return 1
  fi
  printf '%s' "$output" | jq -e --arg name "$name" 'any((.data // [])[]; .name == $name)' >/dev/null 2>&1
}

fetch_pending_identity_jwt() {
  local name=$1
  local filter
  filter=$(printf 'name = "%s"' "$name")
  "${ZITI_BIN}" edge list identities "$filter" -j 2>/dev/null \
    | jq -r --arg name "$name" '((.data // [])[] | select(.name == $name) | .enrollment.ott.jwt // empty)'
}

ensure_access_control_seed() {
  local marker="${ZITI_HOME}/access-control.init"
  if [[ -f "$marker" ]]; then
    log 'access-control defaults already applied'
    return
  fi
  log 'applying OpenZiti access-control defaults'
  "${ZITI_SCRIPTS}/access-control.sh"
  touch "$marker"
}

wait_for_router() {
  if [[ "${ZITI_SKIP_ROUTER_WAIT:-false}" == "true" ]]; then
    log 'router wait disabled via ZITI_SKIP_ROUTER_WAIT'
    return
  fi
  local deadline=$(( $(date +%s) + ROUTER_DISCOVERY_TIMEOUT ))
  log "waiting for router ${ZITI_ROUTER_NAME} to register (timeout ${ROUTER_DISCOVERY_TIMEOUT}s)"
  while (( $(date +%s) < deadline )); do
    if entity_exists 'edge-routers' "$ZITI_ROUTER_NAME"; then
      log "router ${ZITI_ROUTER_NAME} registered"
      ROUTER_PRESENT=true
      return
    fi
    log "waiting for router ${ZITI_ROUTER_NAME}"
    sleep "$ROUTER_DISCOVERY_INTERVAL"
  done
  log "router ${ZITI_ROUTER_NAME} not found before timeout — skipping router-specific updates."
  log "Ensure 'docker compose up -d ziti-edge-router' succeeded, then re-run this init job once the router enrolls."
}

ensure_router_roles() {
  if [[ "$ROUTER_PRESENT" != true ]]; then
    log "router ${ZITI_ROUTER_NAME} not registered yet; skipping router role assignment"
    return
  fi
  log "ensuring router role attributes for ${ZITI_ROUTER_NAME}"
  "${ZITI_BIN}" edge update edge-router "$ZITI_ROUTER_NAME" --role-attributes "$ROUTER_ROLE_ATTRIBUTES" >/dev/null
}

ensure_service() {
  if entity_exists 'services' "$ZITI_SERVICE_NAME"; then
    log "updating service attributes for ${ZITI_SERVICE_NAME}"
    "${ZITI_BIN}" edge update service "$ZITI_SERVICE_NAME" \
      --role-attributes "$SERVICE_ROLE_ATTRIBUTES" \
      --terminator-strategy smartrouting \
      --encryption ON >/dev/null
    return
  fi
  log "creating service ${ZITI_SERVICE_NAME}"
  "${ZITI_BIN}" edge create service "$ZITI_SERVICE_NAME" \
    --role-attributes "$SERVICE_ROLE_ATTRIBUTES" \
    --terminator-strategy smartrouting \
    --encryption ON >/dev/null
}

ensure_service_policy() {
  local name=$1
  local type=$2
  local identity_roles=$3
  local service_roles=$4
  if entity_exists 'service-policies' "$name"; then
    log "service policy ${name} already exists"
    return
  fi
  log "creating service policy ${name}"
  "${ZITI_BIN}" edge create service-policy "$name" "$type" \
    --semantic AllOf \
    --identity-roles "$identity_roles" \
    --service-roles "$service_roles" >/dev/null
}

ensure_service_edge_router_policy() {
  local name="${ZITI_SERVICE_NAME}.edge-router"
  if entity_exists 'service-edge-router-policies' "$name"; then
    log "service-edge-router policy ${name} already exists"
    return
  fi
  log "creating service-edge-router policy ${name}"
  "${ZITI_BIN}" edge create service-edge-router-policy "$name" \
    --semantic AllOf \
    --edge-router-roles "$ROUTER_ROLES" \
    --service-roles "$SERVICE_ROLES" >/dev/null
}

ensure_identity_router_policy() {
  local name="${ZITI_SERVICE_NAME}.identities.use-router"
  if entity_exists 'edge-router-policies' "$name"; then
    log "edge-router policy ${name} already exists"
    return
  fi
  log "creating edge-router policy ${name}"
  local identity_roles="${PLATFORM_ROLES},${RUNNER_ROLES}"
  "${ZITI_BIN}" edge create edge-router-policy "$name" \
    --semantic AnyOf \
    --identity-roles "$identity_roles" \
    --edge-router-roles "$ROUTER_ROLES" >/dev/null
}

ensure_identity_entity() {
  local name=$1
  local role_attributes=$2
  local enrollment_seed=${3:-${TMP_DIR}/${name}.jwt}
  if entity_exists 'identities' "$name"; then
    log "updating identity attributes for ${name}"
    "${ZITI_BIN}" edge update identity "$name" --role-attributes "$role_attributes" >/dev/null
    rm -f "$enrollment_seed"
    return
  fi
  log "creating identity ${name}"
  "${ZITI_BIN}" edge create identity "$name" \
    --role-attributes "$role_attributes" \
    --jwt-output-file "$enrollment_seed" >/dev/null
}

enroll_identity() {
  local identity_name=$1
  local destination=$2
  if [[ -s "$destination" ]]; then
    log "identity file already present for ${identity_name}"
    return
  fi
  mkdir -p "$(dirname "$destination")"
  local jwt_file="${TMP_DIR}/${identity_name}.jwt"
  if [[ ! -s "$jwt_file" ]]; then
    local pending_jwt
    pending_jwt=$(fetch_pending_identity_jwt "$identity_name" || true)
    if [[ -n "$pending_jwt" ]]; then
      printf '%s' "$pending_jwt" >"$jwt_file"
    else
      log "creating enrollment for ${identity_name}"
      if ! "${ZITI_BIN}" edge create enrollment ott "$identity_name" \
        --duration "$ENROLLMENT_DURATION_MINUTES" \
        --jwt-output-file "$jwt_file" >/dev/null; then
        log "failed to create enrollment for ${identity_name}; see controller logs for details"
        return 1
      fi
    fi
  fi
  log "enrolling identity material for ${identity_name}"
  "${ZITI_BIN}" edge enroll "$jwt_file" --out "$destination" --rm >/dev/null
  rm -f "$jwt_file"
}

ensure_identities() {
  local platform_jwt="${TMP_DIR}/${ZITI_PLATFORM_IDENTITY_NAME}.jwt"
  local runner_jwt="${TMP_DIR}/${ZITI_RUNNER_IDENTITY_NAME}.jwt"
  ensure_identity_entity "$ZITI_PLATFORM_IDENTITY_NAME" "$PLATFORM_ROLE_ATTRIBUTES" "$platform_jwt"
  ensure_identity_entity "$ZITI_RUNNER_IDENTITY_NAME" "$RUNNER_ROLE_ATTRIBUTES" "$runner_jwt"
  enroll_identity "$ZITI_PLATFORM_IDENTITY_NAME" "$ZITI_PLATFORM_IDENTITY_FILE"
  enroll_identity "$ZITI_RUNNER_IDENTITY_NAME" "$ZITI_RUNNER_IDENTITY_FILE"
}

main() {
  log 'starting OpenZiti controller initialization'
  source_environment
  ensure_access_control_seed
  wait_for_router
  ensure_router_roles
  ensure_service
  ensure_service_policy "${ZITI_SERVICE_NAME}.dial" 'Dial' "$PLATFORM_ROLES" "$SERVICE_ROLES"
  ensure_service_policy "${ZITI_SERVICE_NAME}.bind" 'Bind' "$RUNNER_ROLES" "$SERVICE_ROLES"
  ensure_service_edge_router_policy
  ensure_identity_router_policy
  ensure_identities
  log 'OpenZiti controller initialization completed'
}

main "$@"
