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

Configuration views
```tsx
import { Configuration views } from '@/components/graph';

<Configuration views nodeId="node-1" templateName="agent" initialConfig={{ systemPrompt: 'You are helpful' }} />
```



```tsx
import {  } from '@/components/graph';

< nodeId="node-1" templateName="agent" />
```



- Notifications use a minimal notify.ts helper today; integrate with your toast system as needed.
