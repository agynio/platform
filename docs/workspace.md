# Workspace (containerProvider)

The Workspace node provisions a per-thread Docker container to run tools and MCP servers. It now supports an optional platform selector to choose the architecture of the container.

- Allowed values: `linux/amd64`, `linux/arm64`
- When set, the platform is forwarded to Docker in two places:
  - Image pull: `docker.pull(image, { platform })`
  - Container create: top-level `platform` query param
- Containers created with a platform are labeled with `hautech.ai/platform` for reliable reuse checks.
- If an existing container is found for a thread but its `hautech.ai/platform` label does not match the requested platform, the old container is stopped and removed, and a new one is created.

Notes
- Docker Desktop can emulate a non-native architecture, but performance may be reduced compared to native.
- Only the two platforms above are supported at this time.

Config schema (static)
- `image?: string` — optional container image override
- `env?: Record<string,string>` — environment variables
- `platform?: 'linux/amd64' | 'linux/arm64'` — optional platform selector
- `initialScript?: string` — optional script executed right after container start
