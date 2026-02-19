# LiteLLM Settings UI patterns

_Context: PR #1164 aligns the LiteLLM settings experience with the Secrets screen primitives found in platform-ui._

## Screen layout

- **Component**: `packages/platform-ui/src/components/screens/LlmSettingsScreen.tsx`
- The screen mirrors Secrets: a single border-bottom header with the title/description on the left and the context-aware primary button (`Add Credential`/`Add Model`) on the right.
- Tabs sit directly under the header inside another border-bottom bar. Use the semantic `role="tablist"`/`role="tab"` pattern (see implementation for focus management) but keep the styling primitive: rounded pills with a filled accent state.
- The active tab renders a `role="tabpanel"` container that wraps `CredentialsTab` or `ModelsTab`. Each panel fills the remaining height and handles its own scroll area.

## Table styling

- **Components**: `CredentialsTab`, `ModelsTab`
- Tabs render inside `flex` column containers with top/bottom utility sections (provider warnings, help text) and a scrollable table region.
- Stick headers to the top of the scroll container (`data-testid="llm-*-table-header"`) and keep tables borderless/flat so they blend with the page like Secrets.
- Row action buttons (`IconButton`s) stay aligned right inside each row. Delete confirmations use the shared `ScreenDialog` pattern.

## Dialog primitives

- **Components**: `CredentialFormDialog`, `ModelFormDialog`, `TestCredentialDialog`, `TestModelDialog`
- Modals use the shared `ScreenDialog` primitives plus `Button`, `Input`, `Textarea`, `SelectInput`, and `SwitchControl` from `src/components` (no shadcn/ui imports).
- Provide short descriptions for each dialog so `aria-describedby` is populated. Keep the dismiss button first (`variant="outline"`) and primary action last inside `ScreenDialogFooter`.
- When a credential resolves to the canonical OpenAI provider and the base URL is empty, `CredentialFormDialog` auto-populates `https://api.openai.com/v1` and validates user overrides.
- Model tests are optional. `ModelFormDialog` keeps the create/save button enabled once required fields are filled; the `Test Model` flow simply surfaces admin responses without gating submission, and editing form values clears any prior test result view.

## Testing expectations

- **Spec**: `packages/platform-ui/src/pages/__tests__/settings-llm.test.tsx`
- Queries target the screen-level `Add Credential` / `Add Model` buttons instead of tab-local buttons.
- Tests assert sticky header classes, provider warnings, and disabled states when LiteLLM admin is unavailable.
- When modifying the layout, keep the `data-testid` hooks (`llm-credentials-table-container`, row ids, etc.) intact to avoid brittle selectors.
