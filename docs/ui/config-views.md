Config Views (UI)

Overview
- Custom Config Views render configuration sections for builder nodes.
- Views are registered in a typed registry and resolved by template name and mode (static or dynamic).

How to add a new Config View
- Create a component under apps/ui/src/components/configViews/ implementing either:
  - StaticConfigViewProps (for static config saved in graph), or
  - DynamicConfigViewProps (for runtime-driven config schema).
- Add an entry in apps/ui/src/components/configViews/registerDefaults.ts:
  - registerConfigView({ template: '<templateName>', mode: 'static' | 'dynamic', component: YourComponent })

Event semantics
- onChange(next): emit the full new value for the section; parent replaces that section and autosaves.
- onValidate?(errors): for static views, call with a list of error strings; parent uses this to surface validation and block save when integrated.

Handling readOnly/disabled
- Each view receives readOnly and disabled; compute a single isDisabled = !!readOnly || !!disabled and honor it on inputs.

Initialization
- The registry is initialized explicitly via initConfigViewsRegistry() invoked in apps/ui/src/main.tsx.
- This ensures registrations are retained after bundler tree-shaking.

Flags
- VITE_ENABLE_CUSTOM_CONFIG_VIEWS is deprecated; custom views are always enabled.
- You may add a localStorage dev override if needed, but none is required now.

Fallback behavior
- If no view is registered for a template/mode, RightPropertiesPanel shows a simple placeholder informing the user no custom view exists.

