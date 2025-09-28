# Migration Guide for Server Graph Unification (Issue #53)

This release removes legacy interfaces and merges agent classes. Follow these steps.

Breaking changes
- Removed `StaticConfigurable` and alias `Configurable = StaticConfigurable` from `apps/server/src/graph/capabilities.ts`.
- Removed `BaseAgent.getConfigSchema()`. Static config schemas now come from `TemplateRegistry` meta.
- Merged `BaseAgent` and `SimpleAgent` into `Agent` at `apps/server/src/agents/agent.ts`.

What to update
1) Imports
- Replace `import { SimpleAgent } from './agents/simple.agent'` with `import { Agent } from './agents/agent'`.
- The template name remains `simpleAgent`; factories now instantiate `Agent`.

2) Config
- Use `setConfig({...})` on instances. Supported keys: `model`, `systemPrompt`, `summarizationKeepTokens` (or legacy `summarizationKeepLast`), `summarizationMaxTokens`, `restrictOutput`, `restrictionMessage`, `restrictionMaxInjections`.
- Do not rely on constructors to read static config; call `setConfig` after graph creation.

3) Tools
- `BaseTool` now exposes an optional async `setConfig(cfg)` with a default no-op. Remove redundant overrides.

4) Ports
- Port naming uses `instance` consistently. Update any custom template entries accordingly.
- Use `TemplateRegistry.toDetailedSchema()` for introspection including handle kinds and method names.

5) MCP
- `LocalMCPServer` freezes namespace after initial discovery. Later `setConfig({ namespace })` calls log a warning and are ignored.

Examples
- See `apps/server/src/templates.ts` for updated registrations and capabilities metadata.

Notes
- No deprecation shims are provided; this is a clean-up release.
