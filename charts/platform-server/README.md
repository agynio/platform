# platform-server Helm Chart

Thin application chart for deploying the agyn platform server using the
`service-base` library chart. The templates included in this chart simply
delegate to the shared library so that all workloads follow the same
conventions.

## Usage

Package and publish the chart as part of the release workflow, or install it
directly from the OCI registry:

```bash
VERSION="0.1.0"
helm pull oci://ghcr.io/agynio/charts/platform-server --version "$VERSION"
helm install platform-server oci://ghcr.io/agynio/charts/platform-server \
  --version "$VERSION" \
  --namespace platform --create-namespace
```

## Configuration

All configurable parameters are exposed through `values.yaml`. Key options are
summarised below.

| Key | Description | Default |
| --- | --- | --- |
| `image.repository` | Container image repository | `ghcr.io/agynio/platform-server` |
| `image.tag` | Overrides the image tag (defaults to `.Chart.AppVersion`) | `""` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `service.ports[0].port` | Service port | `3010` |
| `containerPorts[0].containerPort` | Container listen port | `3010` |
| `env` | Static environment variables | `NODE_ENV=production`, `PORT=3010`, `GRAPH_REPO_PATH=/opt/app/packages/platform-server/data/graph` |
| `llm.provider` | LLM provider (`litellm` \| `openai`) | `litellm` |
| `llm.litellm.baseUrl` | LiteLLM admin endpoint (no `/v1`) | `http://litellm:4000` |
| `llm.litellm.masterKeySecretRef.name` | Secret with LiteLLM master key | `""` |
| `llm.litellm.masterKeySecretRef.key` | Secret key for LiteLLM master key | `""` |
| `llm.litellm.masterKey` | Inline LiteLLM master key (not recommended) | `""` |
| `llm.litellm.keyAlias` | LiteLLM virtual key alias (empty → auto) | `""` |
| `llm.litellm.keyDuration` | Virtual key duration window | `30d` |
| `llm.litellm.models` | Comma-joined LiteLLM model allowlist | `['all-team-models']` |
| `livenessProbe.httpGet.path` | Liveness probe path | `/healthz` |
| `readinessProbe.httpGet.path` | Readiness probe path | `/readyz` |
| `resources.requests` | CPU/Memory requests | `100m` / `128Mi` |
| `resources.limits` | CPU/Memory limits | `500m` / `512Mi` |
| `autoscaling.enabled` | Enables the HPA | `false` |
| `ingress.enabled` | Enables ingress resources | `false` |
| `metrics.serviceMonitor.enabled` | Deploy ServiceMonitor if CRD is available | `false` |

Refer to `values.yaml` for the full list of supported options inherited from
the library chart, such as additional environment variables, volume mounts, and
pod-level configuration.
