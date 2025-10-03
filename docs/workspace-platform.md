# Workspace Platform Support

The Workspace (containerProvider) supports an optional `platform` field to select the Docker platform used for image pulls and container creation.

- Field: `platform` (string), examples: `linux/amd64`, `linux/arm64`, or `linux/arm/v7`.
- Default: unspecified (Docker chooses host/daemon defaults); behavior unchanged if omitted.
- Effects:
  - Passed as a query parameter to `docker pull` and `docker create` via dockerode.
  - Ensures the correct platform image is pulled and the container is created for that platform.
- Reuse rules: when `platform` is set and an existing container is found by labels, the provider checks the existing container's image platform. If it differs from the requested platform, the container is not reused and a new one is created.

Notes
- Docker Desktop can emulate non-native platforms using QEMU. This may impact performance.
- If the daemon lacks the requested platform image, Docker will attempt to pull it.
- Windows containers have additional OsVersion details which are ignored here.
