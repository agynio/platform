# ADR: Config Interface Unification and Agent Merge

Context
- Multiple overlapping config interfaces existed (`StaticConfigurable`, runtime `Configurable` in graph types).
- Two agent classes (`BaseAgent`, `SimpleAgent`) created duplication across init/invoke/state graph.
- Ports used mixed naming for instance references.

Decision
- Replace `StaticConfigurable` with minimal `Configurable` interface: `setConfig(cfg: Record<string, unknown>): Promise<void>|void`.
- Remove `BaseAgent.getConfigSchema`; templates carry schemas via `TemplateRegistry` meta.
- Merge `BaseAgent` and `SimpleAgent` into a single `Agent` class encapsulating:
  - state graph with summarization, restriction enforcement, tools node
  - `invoke()` wrapper
  - `setConfig()` updating model/systemPrompt/summarization/restrictions
  - `addTool/removeTool` and `addMcpServer/removeMcpServer`
  - `destroy()` lifecycle hook
- Harmonize port naming: use `instance` across templates/ports.
- Add attachment interfaces and type guards to clarify graph wiring.

Consequences
- Leaner public API; one Agent to use and test.
- Schemas remain centralized in templates for UI and validation.
- Runtime emits clearer errors on miswired ports.

Status
- Implemented in apps/server in PR for issue #53.
