# Components: Templates + Node Controls

Templates cache and capabilities
- TemplatesProvider wraps the app and exposes useTemplatesCache.
- Capability helpers (canPause, canProvision, hasStaticConfig, hasDynamicConfig) derive UI controls from a TemplateSchema.

NodeDetailsPanel
```tsx
import { NodeDetailsPanel } from '@/components/graph';

<NodeDetailsPanel nodeId="node-1" templateName="agent" />
```
- Shows provision status chip + paused badge
- Actions: Start/Stop and Pause/Resume when pausable
- Optimistic updates on actions; reconciles with socket node_status events

StaticConfigForm
```tsx
import { StaticConfigForm } from '@/components/graph';

<StaticConfigForm nodeId="node-1" templateName="agent" initialConfig={{ systemPrompt: 'You are helpful' }} />
```
- Renders RJSF form from template.staticConfigSchema (JSON Schema 7)
- Submits to POST /graph/nodes/:nodeId/config

DynamicConfigForm
```tsx
import { DynamicConfigForm } from '@/components/graph';

<DynamicConfigForm nodeId="node-1" templateName="agent" />
```
- Waits for dynamicConfigReady in status; then fetches schema and renders RJSF
- Submits to POST /graph/nodes/:nodeId/dynamic-config

Notes
- Server schemas originate from Zod v4 and are exposed as JSON Schema 7. The UI treats them as JSON Schema 7 and uses RJSF (ajv8 validator).
- Notifications use a minimal notify.ts helper today; integrate with your toast system as needed.
