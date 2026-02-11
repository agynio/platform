# Development Style Guides (HautechAI/agents)


## Editor/IDE settings
We use EditorConfig and Prettier. Configure your editor to:
- Honor `.editorconfig` if present.
- Run Prettier on save. Prettier config: `.prettierrc` (printWidth 120, singleQuote, trailingComma all).

## Git hooks (pre-commit / pre-push)
We recommend using Lefthook to run formatters and tests on changed files.

- Install locally (example with Node + pnpm):
  ```bash
  pnpm dlx lefthook@latest install
  ```
- Add a `lefthook.yml` at repo root (example):
  ```yaml
  pre-commit:
    parallel: true
    commands:
      prettier:
        glob: '*.{ts,tsx,js,css,md,json}'
        run: pnpm dlx prettier --write {staged_files} && git add {staged_files}
      typecheck:
        run: pnpm -w ts -b || true
  pre-push:
    commands:
      test:
        run: pnpm -w test
  ```

To temporarily disable hooks: `LEFTHOOK=0 git push`.

## Languages and frameworks
Our repo currently uses:
- TypeScript (Node.js server in `packages/platform-server`)
- React + Vite + Tailwind v4 (UI in `packages/platform-ui`)
- Shared TypeScript package (in `packages/shared`)

## TypeScript Style
- Strict TypeScript. Prefer `unknown` over `any`. Avoid `as any` casts.
- Use `zod` for parsing untrusted inputs and environment variables.
- Prefer explicit return types on exported functions.
- Avoid enums; use string literal unions or `as const` objects.
- Narrow errors to `unknown` and use type guards when needed.
- Prefer functional, pure modules. Side effects live in service classes.

### Node.js server
- Keep services injectable and stateless. IO is abstracted behind services (e.g., PrismaService). Note: Slack no longer uses a global service; Slack integration is configured per node (see SlackTrigger and SendSlackMessageTool static configs).
- Configuration comes from `ConfigService` reading env. No direct `process.env` reads inside business logic.
- Log with structured messages. Avoid console.log in code; use Nest's `Logger` (per-class instance).
- Graceful shutdown handlers must close external connections.

### React UI
- Co-locate components and tests when reasonable.
- Prefer composition over inheritance. Build primitives in `src/components/ui`.
- Derive UI state from props and data; avoid unnecessary global state.
- Avoid inline styles; use Tailwind utility classes.

## Testing
- Use Vitest. Keep unit tests close to code or under `__tests__`.
- Name tests `*.test.ts` or `*.spec.ts`.
- Test behavior, not implementation details.
- For React, use Testing Library if/when added. Prefer user-facing assertions.

## Markdown and docs
- Follow Ciro Santilli's Markdown Style Guide (same as GitLab).
- Prefer "first-bad-then-good" examples in dev docs; in user docs, use Do/Don't.
- Keep READMEs task-oriented: Overview → Setup → Run → Troubleshooting.

## Commits and PRs
- Conventional Commits.
- Small, focused PRs with clear descriptions. Include screenshots for UI changes.

## Go, Ruby, SCSS
- Not applicable in this repo. If added later, adopt idiomatic community guides and keep pointers here.

## NPM publishing
- This is a private monorepo. If we publish any package, follow semantic versioning and automate via CI (to be defined).

## Examples: bad vs good

```ts
// Bad: implicit any, unvalidated env, side effects in module scope
const masterKey = process.env.LITELLM_MASTER_KEY; // string | undefined
export const client = new OpenAI({ apiKey: masterKey, baseURL: process.env.LITELLM_BASE_URL });

export function handle(data) {
  return data.id;
}
```

```ts
// Good: validated config, explicit types, controlled side effects
import { z } from 'zod';

const Config = z.object({
  LITELLM_BASE_URL: z.string().url(),
  LITELLM_MASTER_KEY: z.string().min(1),
});
const cfg = Config.parse(process.env);

export interface Item { id: string }
export function getId(item: Item): string {
  return item.id;
}

export const client = new OpenAI({
  apiKey: cfg.LITELLM_MASTER_KEY,
  baseURL: `${cfg.LITELLM_BASE_URL.replace(/\/$/, '')}/v1`,
});
```

## Tooling
- Formatter: Prettier. Avoid ESLint stylistic rules that conflict with Prettier.
- Lint: If we enable ESLint repo-wide, prefer flat config and Type-checked rules only where needed.

## Security
- Never commit secrets. Use `.env` files, Docker secrets, or CI variables.
- Review dependencies and avoid enabling networked tools in tests.
