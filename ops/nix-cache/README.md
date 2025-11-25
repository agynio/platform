Nix Cache Proxy (ncps)

Overview

- ncps runs on the internal agents_net only; do not expose host ports.
- Only trust public keys from caches you control. Obtain the key from http://ncps:8501/pubkey.
- The storage volume holds cached binaries; size may grow with usage – plan disk space accordingly.

Bring up services

- docker compose up -d ncps-init ncps-migrate ncps
  - ncps-init creates directories on the shared volume
  - ncps-migrate runs the one-time schema initialization with dbmate up (per volume)

Runtime key fetch

- The platform-server now fetches the ncps public key at runtime and refreshes it periodically.
- Suggested env variables (in server process):

```sh
export NCPS_ENABLED=true
# Preferred dual-URL setup (server vs. container reachability):
# - Server/runtime HTTP calls (NcpsKeyService): use a host-reachable URL
#   If the platform-server runs on the host (outside Compose), expose ncps and set:
#   docker-compose: uncomment ports on the ncps service (see compose snippet below)
#   export NCPS_URL_SERVER=http://localhost:8501
# - Container substituters (inside Docker network):
export NCPS_URL_CONTAINER=http://ncps:8501
# Backward-compat: if only NCPS_URL is set, both resolve to its value.
# export NCPS_URL=http://ncps:8501
# Optional knobs with defaults:
# export NCPS_PUBKEY_PATH=/pubkey
# export NCPS_FETCH_TIMEOUT_MS=3000
# export NCPS_REFRESH_INTERVAL_MS=600000
# export NCPS_STARTUP_MAX_RETRIES=8
# export NCPS_RETRY_BACKOFF_MS=500
# export NCPS_RETRY_BACKOFF_FACTOR=2
# export NCPS_ALLOW_START_WITHOUT_KEY=true
# export NCPS_CA_BUNDLE=/path/to/ca.pem
# export NCPS_ROTATION_GRACE_MINUTES=0
# export NCPS_AUTH_HEADER=Authorization
# export NCPS_AUTH_TOKEN="Bearer ..."
```

- Workspace containers automatically join the network specified by `WORKSPACE_NETWORK_NAME` (default `agents_net`), so keep `NCPS_URL_CONTAINER=http://ncps:8501` and ensure that network exists on the host.

Injection behavior

- The server injects NIX_CONFIG into workspace containers only when all conditions are met:
  - NCPS_ENABLED=true
  - NCPS_URL_CONTAINER (or legacy NCPS_URL) is set and reachable from containers
  - A valid public key has been fetched (NcpsKeyService.hasKey())
  - NIX_CONFIG is not already present in the container env

Verify inside a workspace container:

```sh
nix show-config | grep -E 'substituters|trusted-public-keys'
```

Startup installs

- Workspace startup performs a best-effort Nix package installation when the node config contains resolved items:
  - Shape: { commitHash: <40-hex>, attributePath: <attr> }
  - Command: PATH is prefixed and a single combined `nix profile install` is attempted; on failure, per-package fallbacks run.
  - If Nix is not present in the container image, install is skipped (info-level log).
- When NCPS is configured (NIX_CONFIG injected), installs automatically leverage the cache.

Metrics

- ncps can expose Prometheus metrics when PROMETHEUS_ENABLED=true.
- docker-compose sets this by default below; metrics are on http://ncps:8501/metrics (internal network only).

docker-compose hint (host reachability)

- By default, ncps does not expose host ports. If your platform-server runs on the host and needs to fetch the ncps pubkey (NCPS_URL_SERVER), expose the port:

```yaml
  ncps:
    # ...
    # Uncomment to expose to the host for NCPS_URL_SERVER=http://localhost:8501
    # ports:
    #   - '8501:8501'
```
