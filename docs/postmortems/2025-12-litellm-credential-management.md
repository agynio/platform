# Postmortem: LiteLLM Credential Management (Dec 2025)

Links
- Issue: Improve LiteLLM credential management (#1159)
  - https://github.com/HautechAI/agents/issues/1159
- PR: Persist LiteLLM service tokens (later scope changes) (#1160)
  - https://github.com/HautechAI/agents/pull/1160

Summary
- We changed LiteLLM token provisioning behavior to meet requirements around long-lived service tokens, reuse across restarts, and preventing token-store pollution. The effort experienced scope changes mid-flight (from persistent-token approach with advisory locking to a stateless alias-delete-and-generate approach), introduced a breaking change (LiteLLM-only path; direct OPENAI removed), and surfaced both CI and runtime errors:
  - CI: missing required LiteLLM env vars in test harness/builder once LiteLLM became mandatory.
  - Runtime: admin payload sent team_id: null, failing LiteLLM Zod validation.

This postmortem documents the timeline, root causes, impact/detection, and corrective actions across tests, process, and accountability.

Timeline of events
- 2025-12-07 17:39 UTC — Issue #1159 opened (requirements: long-lived token, reuse across restarts, cleanup old tokens; maintain OPENAI fallback).
- 2025-12-07 ~18:03 UTC — PR #1160 created:
  - Initial approach: on-disk token persistence with advisory lock, owner metadata, stale lock recovery; resilient admin client + retries; reuse across restarts.
  - Commit: feat(litellm): persist service tokens (2ecff60)
- 2025-12-07 18:09–18:28 UTC — Review changes requested/iterated:
  - Stale lock recovery, owner metadata, dead-PID reclamation added (6b102b1).
- 2025-12-07 22:54 UTC — Scope update (reviewer/maintainer direction):
  - Remove on-disk persistence and advisory locks; minimize configuration changes.
  - Stateless startup flow: delete-by-alias then generate token; in-memory only.
  - Keep OPENAI override path unchanged (at this point).
  - PR comment reference: “Scope update per maintainer request.”
- 2025-12-07 23:01 UTC — Stateless refactor landed:
  - refactor(litellm): simplify service token flow (c16b669).
- 2025-12-09 13:20–13:21 UTC — Behavior adjustments:
  - refactor(litellm): disable admin retries (e821a1e).
  - Docs/tests adjusted to match the stateless, fail-fast approach.
- 2025-12-11 00:11 UTC — Breaking change introduced:
  - feat(platform-server): require litellm provisioning (de14e65)
  - Direct OpenAI provisioning removed; LITELLM_BASE_URL and LITELLM_MASTER_KEY now required for boot.
- 2025-12-11 00:27 UTC — Config enforcement:
  - fix(platform-server): enforce litellm config (e6b5391).
  - CI failures observed due to test harness not setting LiteLLM env; resolution added later.
- 2025-12-11 01:03 UTC — CI unblocking for tests:
  - fix(platform-server): allow litellm test fallback (24cbab4)
  - Root cause noted: configSchema/FromEnv required LiteLLM env; tests invoked parse without setting them; under NODE_ENV=test, allow defaults.
- 2025-12-12 04:43 UTC — Runtime payload error fix:
  - fix(platform-server): sanitize litellm payloads (a58cd78)
  - Root cause noted: admin client forwarded optional fields including team_id: null; LiteLLM rejected null via Zod; fix: drop null/undefined optional fields.
- 2025-12-12 23:33 UTC — Hardening:
  - fix(litellm): harden admin payload sanitation (401cf95)
  - Final review approval with tests covering sanitation and provisioning alias cleanup. CI/test suites reported green with updated conditions.

Impact and detection
- Impact
  - CI pipeline failures after breaking change made LiteLLM mandatory; tests and builders without LITELLM_* env failed early in module bootstrap (ZodError in ConfigService.fromEnv/configSchema).
  - Runtime errors at customer setups where team_id resolved to null (e.g., unset env/optional param). LiteLLM admin API rejected payload with null using its Zod validation, causing startup provisioning failures.
- Detection
  - CI: Unit/integration tests failed in PR due to stricter config schema; surfaced quickly during PR iteration.
  - Runtime: The null team_id payload error was reported from manual/local validation and surfaced as startup/runtime failure logs calling LiteLLM admin APIs.

Root cause analysis
- Primary causes
  - Requirements drift and scope change:
    - Initial, stateful design (persist token with advisory lock) shifted to stateless (delete alias + generate, in-memory only). This pivot altered assumptions around reuse and cleanup, increased the need for exact alias-delete order and error handling, and changed test plans mid-flight.
  - Breaking change timing:
    - Removing direct OPENAI path (LiteLLM-only) without parallel CI harness updates caused CI to fail because test infrastructure lacked the new required env vars.
  - Payload sanitation gap:
    - Admin client forwarded optional fields as-is (team_id: null). LiteLLM’s Zod validation rejects null for non-nullable fields, leading to errors that should have been caught by input sanitation unit tests earlier.
- Contributing factors
  - Env assumptions unaligned with CI:
    - Tests invoked configSchema.parse/ConfigService.fromEnv without LITELLM_BASE_URL/LITELLM_MASTER_KEY; a transition to LiteLLM-only required aligning CI/test envs or using NODE_ENV=test fallbacks from the start.
  - Gaps in test coverage:
    - No unit tests initially to ensure admin request bodies omit null/undefined optional fields (e.g., team_id).
    - Integration tests did not simulate the absence of required LiteLLM envs after the breaking change to confirm clearer failure modes and test fallbacks in test mode.
    - Concurrency and cleanup behavior were significantly reworked by scope changes; initial lock/persistence tests became obsolete, and stateless cleanup tests were added later rather than upfront.
  - Review/decision trade-offs:
    - Removal of retries/backoff shifted behavior to fail-fast; tests and docs were updated subsequently, but interim expectations drifted.
    - The stateless approach increases reliance on alias-delete correctness and ordering; tests weren’t comprehensive until after reviewer feedback.

Corrective actions
1) Testing improvements (what and where)
- Unit tests (packages/platform-server/__tests__)
  - litellm.admin-client.test.ts (new)
    - Validate request sanitation:
      - team_id null/undefined → field omitted
      - Trim/omit empty optional strings
      - models/aliases/metadata typed correctly
    - Validate error handling:
      - 4xx vs 5xx behavior (no retry for 4xx; surface cause)
      - JSON parse safeguards (graceful handling of invalid JSON bodies)
  - config.service.litellm.test.ts (new)
    - NODE_ENV=test fallback behavior:
      - Without LITELLM_* envs, ConfigService.fromEnv returns stable test defaults (test-only).
    - Production behavior:
      - Without LITELLM_* envs in NODE_ENV=production, parsing fails with explicit error (fail fast).
  - litellm.provisioner.stateless.unit.test.ts (new)
    - Delete-by-alias followed by generate; ensure order and non-fatal logging on delete failure when generation still proceeds in next boot.
    - Enforce “LiteLLM-only” path: fail if LITELLM_* missing (production).
    - “Fail-fast” behavior validated: single-attempt calls (no backoff logic remains).
- Integration tests (packages/platform-server/__tests__)
  - litellm.provisioner.stateless.integration.test.ts (new)
    - Happy path: startup calls delete-by-alias then generate, returns a working API key.
    - Delete failure path: delete returns error → provisioning logs warning and attempts generation (per current behavior).
    - team_id present vs omitted: generate should omit team_id when not provided; include when provided.
  - agent.llm.binding.integration.test.ts (extend an existing test or add new)
    - End-to-end: Agent node resolves LLM via provisioner using generated LiteLLM key with baseURL /v1 and executes a simple chat call (mocked LiteLLM admin endpoints + a mock OpenAI-compatible chat).
- E2E/mocked-LiteLLM suite (packages/platform-server/__tests__/e2e or __tests__/integration)
  - provision-regression.e2e.test.ts (new)
    - Ensure stateless behavior:
      - Boot 1: alias-delete + generate
      - Boot 2: alias-delete + generate (since stateless)—assert no accumulation due to delete phase
    - Payload validations: admin endpoints receive sanitized payloads (no null fields)
    - Enforce LiteLLM-only: boot fails cleanly with a precise error if LITELLM_* missing in production mode

2) Acceptance criteria and coverage thresholds
- Acceptance criteria
  - Provisioning uses LiteLLM-only; server fails clearly without LITELLM_BASE_URL and LITELLM_MASTER_KEY in production.
  - Stateless flow:
    - Pre-creation delete by alias logs and continues if it fails.
    - Key generation surfaces errors deterministically; no retries in current design.
  - Admin payloads are sanitized: null/undefined optional fields omitted.
  - Integration tests cover happy path, delete failure, sanitized team_id behavior, and end-to-end agent → LLM path.
- Coverage thresholds
  - Provisioning module(s) lines/branches: ≥ 90% lines, ≥ 85% branches.
  - Admin client/request builder helpers: ≥ 95% lines, ≥ 90% branches.
  - Config service LiteLLM env resolution: ≥ 90% lines.

3) Process changes
- Gate checks
  - “Breaking change” label requires:
    - CI dry-run with updated envs (test runners must be configured with LITELLM_* or NODE_ENV=test fallback).
    - Reviewer signoff that the test matrix reflects the new mandatory config path.
  - Admin API contract checklist:
    - All optional fields in admin payloads must be sanitized (omit null/undefined).
    - Add/modify payload shape → add/update unit tests first.
  - Env assumptions for tests:
    - Any change to required env must update: test harness bootstrap, .env.example, and docs the same PR.
- Reviewer checklist (add to PR template)
  - Does the change alter provisioning order or behavior (delete/generate, retries)? If yes, are tests updated to match?
  - Are admin request bodies covered by unit tests for omitting null/undefined?
  - Do integration tests assert LiteLLM-only behavior and env requirements?
  - Are CI envs (or test fallbacks) updated to keep the suite green?
  - If removing features (e.g., OPENAI path), are docs and tests aligned?

Accountability mapping
- Engineering (implementation)
  - Responsible for code changes, adding/updating unit/integration/E2E tests, aligning docs and .env.example, and ensuring CI passes.
  - In this incident: initial implementation, subsequent refactors, and final sanitation/hardening fixes were authored in PR #1160 (Casey Brooks).
- Code review (peer/maintainer)
  - Responsible for identifying logical gaps, ensuring design/test coverage matches scope, and requesting scope changes when necessary.
  - In this incident: reviewers flagged stale-lock recovery, requested stateless scope shift, confirmed sanitation and behavior alignment, and approved final changes (e.g., Noa Lucent; Rowan Stein requested review).
- Management/maintainership
  - Responsible for scope direction (e.g., removing persistence), setting acceptance criteria and release readiness, ensuring documentation/test standards.
  - In this incident: scope changes drove replanning and increased coordination needs; acceptance criteria evolved from persistent-token to stateless provisioning.

What changed in the codebase (for reference)
- provisioning flow: packages/platform-server/src/llm/provisioners/litellm.provisioner.ts (delete-by-alias → generate, in-memory only)
- config enforcement: packages/platform-server/src/core/services/config.service.ts (LiteLLM-only, required env in production; test fallbacks)
- admin payload sanitation: helper/utilities included with fix to omit null/undefined optional fields
- tests/docs: updated to reflect stateless provisioning, LiteLLM-only, and sanitation behavior

Appendix: Current behavior (LiteLLM-only)
- The platform-server now requires:
  - LITELLM_BASE_URL, LITELLM_MASTER_KEY in production
- On boot (LLM path):
  - POST /key/delete with key_aliases=["agents-service"] (best-effort)
  - POST /key/generate with models and key_alias="agents-service"
  - Use the generated key in memory only
- No direct OPENAI provisioning path remains.
