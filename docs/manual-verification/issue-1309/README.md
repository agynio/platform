# Issue 1309 — Env editor focus + delete regression verification

This folder contains the raw screen recordings that demonstrate the
`EnvEditor` bugs on `main` and the fixes that land on the
`fix/issue-1309-env-editor-focus-delete` branch.

## Environment

- Node.js 22.22.0 (NodeSource packages)
- pnpm 10.30.1
- Playwright Chromium (v1200) + ffmpeg via `npx playwright install`
- Storybook built with `node packages/platform-ui/manual-env-verify.mjs`

## Commands

The helper script builds a static Storybook bundle for a dedicated manual
story (`Manual/WorkspaceEnvGraph`) and records the interaction via
Playwright:

```bash
cd packages/platform-ui
node manual-env-verify.mjs <main|fix>
```

The `main` scenario captures the original regression. Re-running the script
with `fix` reproduces the same steps against the feature branch.

## Evidence

| Scenario | File | Notes |
| --- | --- | --- |
| Baseline regression (`main`) | [main-bug-repro.webm](./main-bug-repro.webm) | Shows focus loss and workspace node deletion while pressing backspace in an empty `EnvEditor` value field. |
| Patched branch (`fix`) | [fix-resolution.webm](./fix-resolution.webm) | Demonstrates stable focus/selection; backspace only edits the field and does not delete nodes. |

Each video starts after Storybook loads and the workspace node is selected.
