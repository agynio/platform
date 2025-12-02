# Memory data providers

The memory explorer UI reads and writes documents through the `MemoryDataProvider`
context. By default the provider binds directly to the production
`memoryApi` implementation, so existing application routes continue to work
without additional wiring. Consumers call `useMemoryData()` to access the
API surface and use `memoryQueryKeys` to build consistent React Query keys.

```tsx
import { MemoryDataProvider } from '@/components/memory/MemoryDataProvider';

export function App() {
  return (
    <MemoryDataProvider>
      <Routes />
    </MemoryDataProvider>
  );
}
```

## In-memory provider for Storybook and UI sandboxes

`InMemoryMemoryProvider` installs a deterministic, Map-backed store that
implements the same API surface. It is intended for Storybook stories and
other UI-only environments where requests should not hit the backend.

```tsx
import type { Decorator } from '@storybook/react';
import { InMemoryMemoryProvider } from '@/components/memory/InMemoryMemoryProvider';

export const withInMemoryMemory: Decorator = (Story) => (
  <InMemoryMemoryProvider>
    <Story />
  </InMemoryMemoryProvider>
);
```

You can pass custom seeds to control the initial document tree:

```tsx
<InMemoryMemoryProvider
  seeds={[
    {
      nodeId: 'demo-node',
      scope: 'global',
      documents: [
        { path: '/', content: '# Demo memory' },
        { path: '/notes/today.md', content: '- task one' },
      ],
    },
  ]}
>
  <MemoryExplorerScreen nodeId="demo-node" scope="global" />
</InMemoryMemoryProvider>
```

The in-memory adapter automatically resets when the provider remounts,
keeping Storybook stories deterministic while exercising the same production
components and hooks.
