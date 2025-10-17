Nix Cache Proxy (ncps)

Overview

- ncps runs on the internal agents_net only; do not expose host ports.
- Only trust public keys from caches you control. Obtain the key from http://ncps:8501/pubkey.
- The storage volume holds cached binaries; size may grow with usage – plan disk space accordingly.

Bring up services

- docker compose up -d ncps-init ncps-migrate ncps
  - ncps-init creates directories on the shared volume
  - ncps-migrate runs the one-time schema initialization with dbmate up (per volume)

Configure env

- Suggested env variables (in server process):

```sh
export NCPS_ENABLED=true
export NCPS_URL=http://ncps:8501
export NCPS_PUBLIC_KEY=$(docker compose exec ncps sh -lc 'wget -qO- http://localhost:8501/pubkey')
```

Injection behavior

- The server injects NIX_CONFIG into workspace containers only when all conditions are met:
  - NCPS_ENABLED=true
  - NCPS_URL is set
  - NCPS_PUBLIC_KEY is set
  - NIX_CONFIG is not already present in the container env

Verify inside a workspace container:

```sh
nix show-config | grep -E 'substituters|trusted-public-keys'
```
