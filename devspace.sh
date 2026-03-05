#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_bootstrap_dir() {
  local candidate dir

  if [[ -n "${BOOTSTRAP_V2_DIR:-}" ]]; then
    if [[ "${BOOTSTRAP_V2_DIR}" = /* ]]; then
      dir="${BOOTSTRAP_V2_DIR}"
    else
      dir="${SCRIPT_DIR}/${BOOTSTRAP_V2_DIR}"
    fi

    if [[ -d "${dir}" ]]; then
      printf '%s\n' "${dir}"
      return 0
    fi

    printf 'Error: BOOTSTRAP_V2_DIR="%s" does not exist.\n' "${BOOTSTRAP_V2_DIR}" >&2
    exit 1
  fi

  for candidate in "${SCRIPT_DIR}/../bootstrap_v2" "${SCRIPT_DIR}/bootstrap_v2"; do
    if [[ -d "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  printf 'Error: Could not locate bootstrap_v2. Set BOOTSTRAP_V2_DIR or place the repository next to platform/.\n' >&2
  exit 1
}

resolve_kubeconfig() {
  local base_dir="$1"
  local candidate

  for candidate in \
    "${base_dir}/stacks/k8s/.kube/agyn-local-kubeconfig.yaml" \
    "${base_dir}/k8s/.kube/agyn-local-kubeconfig.yaml"; do
    if [[ -f "${candidate}" ]]; then
      (cd "$(dirname "${candidate}")" && pwd)/"$(basename "${candidate}")"
      return 0
    fi
  done

  printf 'Error: kubeconfig not found. Expected at:\n  %s\n  %s\n' \
    "${base_dir}/stacks/k8s/.kube/agyn-local-kubeconfig.yaml" \
    "${base_dir}/k8s/.kube/agyn-local-kubeconfig.yaml" >&2
  exit 1
}

main() {
  local bootstrap_dir kubeconfig_path

  bootstrap_dir="$(resolve_bootstrap_dir)"
  kubeconfig_path="$(resolve_kubeconfig "${bootstrap_dir}")"

  export KUBECONFIG="${kubeconfig_path}"

  cd "${SCRIPT_DIR}/packages/platform-server"
  exec devspace dev -n platform --kube-context agyn-local "$@"
}

main "$@"
