Config Views (UI)

Overview
- Custom Config Views render configuration sections for builder nodes.
- Views are registered in a typed registry and resolved by template name and mode (static or dynamic).

How to add a new Config View
- Create a component implementing either:
  - StaticConfigViewProps (for static config saved in graph), or
  - DynamicConfigViewProps (for runtime-driven config schema).
- Register it in the default config views registry:
  - registerConfigView({ template: '<templateName>', mode: 'static' | 'dynamic', component: YourComponent })

Event semantics
- onChange(next): emit the full new value for the section; parent replaces that section and autosaves.
- onValidate?(errors): for static views, call with a list of error strings; parent uses this to surface validation and block save when integrated.

Handling readOnly/disabled
- Each view receives readOnly and disabled; compute a single isDisabled = !!readOnly || !!disabled and honor it on inputs.

Initialization
- The registry is initialized explicitly at UI startup to ensure registrations are retained after bundler tree-shaking.

Flags
- VITE_ENABLE_CUSTOM_CONFIG_VIEWS is deprecated; custom views are always enabled.
- You may add a localStorage dev override if needed, but none is required now.

Fallback behavior
- If no view is registered for a template/mode, RightPropertiesPanel shows a simple placeholder informing the user no custom view exists.

Tool name handling
- Static tool config views should surface an optional **Name** field when the tool exposes a canonical name.
- Use `getCanonicalToolName(templateName)` (defined in `toolCanonicalNames.ts`) to fetch the placeholder and fallback name.
- Validate names with `isValidToolName` (`^[a-z0-9_]{1,64}$`). Trim whitespace, allow blank values (clears to canonical), and reject invalid entries by keeping the previous valid name.
- Surface validation errors both locally (inline message) and via `onValidate` so the parent panel can block saves.
