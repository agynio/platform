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
| Baseline regression (`main`) | [main-bug-repro.webm](./main-bug-repro.webm) | Storybook built from `origin/main` with temporary harness copy. Reproduces the ID-reset bug: the EnvEditor input remounts, loses focus, and the selected workspace node is deleted when backspace propagates to the canvas. |
| Patched branch (`fix`) | [fix-resolution.webm](./fix-resolution.webm) | Built from `fix/issue-1309-env-editor-focus-delete` **after** removing GraphCanvas/ReferenceInput key guards. Stable env IDs keep the input mounted, so repeated backspace presses stay scoped to the field and the workspace node remains intact. |

Each video starts after Storybook loads and the workspace node is selected.
