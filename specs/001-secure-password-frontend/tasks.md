# Tasks: Secure Frontend Password Flow

**Input**: Design documents from `/specs/001-secure-password-frontend/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/password-operation-response.md, quickstart.md

**Tests**: Targeted tests are required. Use deterministic fake values only and never print a credential value.

**Organization**: This list contains implementation and verification work only. External orchestration is deliberately excluded.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its prerequisites because it changes a different file
- **[Story]**: Maps the task to the numbered user story in spec.md
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Reuse the current project and installed toolchain.

No setup changes are required. Do not install, upgrade, or initialize dependencies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Preserve the confirmed existing backend contract and limit implementation to the directly relevant password frontend.

No foundational application change is required. The pre-implementation contract confirmation and external delegation are Codex orchestration steps documented in `specs/001-secure-password-frontend/plan.md`, not feature implementation tasks.

---

## Phase 3: User Story 1 - Trustworthy Password Operation Results (Priority: P1) 🎯 MVP

**Goal**: Ensure each in-scope password mutation reports success only for an HTTP-success response containing a valid object with `success === true`.

**Independent Test**: Valid explicit success is accepted; HTTP errors, network errors, empty/non-JSON bodies, parse failures, null/array/primitive bodies, missing success, `success: false`, and non-boolean success values are rejected without success-only behavior.

### Tests for User Story 1

- [x] T001 [US1] Add failing response-contract tests using deterministic fake payloads in `tests/passwordApi.test.ts`, preserving the constraint that success must be exactly true and missing, false, or non-boolean values are failures

### Implementation for User Story 1

- [x] T002 [US1] Implement the strict password mutation request/response helper and safe generic failure behavior in `src/utils/passwordApi.ts` according to `specs/001-secure-password-frontend/contracts/password-operation-response.md`
- [x] T003 [US1] Replace the development non-JSON success bypass in `src/components/ManagementCenter.tsx` with the strict helper while preserving existing password payloads and success UI behavior

**Checkpoint**: User Story 1 passes `npx vitest run tests/passwordApi.test.ts` and no malformed response is accepted.

---

## Phase 4: User Story 2 - No Persisted Plaintext Administrator Password (Priority: P2)

**Goal**: Eliminate plaintext administrator-password persistence, remove the legacy entry without exposing its value, and clear temporary password state when the active operation ends.

**Independent Test**: Deterministic fake values never appear in local storage, session storage, IndexedDB, logs, application source, or other persistence; the legacy key is removed without authentication use; applicable temporary password fields clear after success, failure, cancellation, dialog closure, and lifecycle completion.

### Tests for User Story 2

- [x] T004 [US2] Add failing persistence-prohibition and temporary-state cleanup tests in `tests/passwordFrontendSecurity.test.ts` covering local storage, session storage, IndexedDB, captured logs, source guards, success, failure, cancellation, dialog closure, and component lifecycle completion with deterministic fake values

### Implementation for User Story 2

- [x] T005 [US2] Add idempotent removal of the forbidden `pe_admin_password` key without reading, logging, returning, or displaying its value in `src/utils/passwordApi.ts`
- [x] T006 [P] [US2] Remove the plaintext administrator-password read/default fallback from `src/components/Login.tsx`, invoke legacy-key cleanup, require the existing server-backed administrator path, and clear applicable password input state after request completion and component lifecycle completion
- [x] T007 [P] [US2] Remove the development plaintext comparison and persisted-password write from `src/components/ManagementCenter.tsx`; clear administrator and generated/custom temporary password state after success, failure, cancellation, dialog closure, or component lifecycle completion while allowing display only during an active handoff

**Checkpoint**: User Story 2 tests pass, temporary-state cleanup scenarios pass, and repository search finds no application read/write of `pe_admin_password` except explicit removal and deterministic tests.

---

## Phase 5: User Story 3 - Preserve Existing Valid Password Flows (Priority: P3)

**Goal**: Confirm the safeguards retain established valid password behavior and do not alter unrelated features.

**Independent Test**: Existing success responses remain accepted; local Pages validation confirms generated/new passwords, old-password rejection, and session invalidation remain as established.

### Tests and Verification for User Story 3

- [x] T008 [US3] Add or refine valid-response regression coverage for existing password mutation metadata and safe error propagation in `tests/passwordApi.test.ts`
- [x] T009 [US3] Run the focused local Cloudflare Pages scenarios from `specs/001-secure-password-frontend/quickstart.md` and retain only non-secret pass/fail evidence in the implementation final report

**Checkpoint**: User Story 3 has runtime evidence from the correct local Pages environment; Vite-only 404/non-JSON behavior is not used as backend evidence.

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Establish correctness and scope preservation after all stories.

- [x] T010 Run `npm run typecheck`, `npm run test`, and `npm run build` from `package.json`, without running deploy, audit-fix, install, upgrade, migration, or production commands
- [x] T011 Review only relevant diffs in `src/utils/passwordApi.ts`, `src/components/ManagementCenter.tsx`, `src/components/Login.tsx`, `tests/passwordApi.test.ts`, and `tests/passwordFrontendSecurity.test.ts`; confirm `src/App.tsx`, employee deletion behavior, `functions/api/auth/password.ts`, cloud sync, navigation persistence, general session isolation, deployment files, migrations, `package.json`, and lockfiles are unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup and Foundational (Phases 1-2)**: Require no implementation changes; Codex completes contract confirmation and external orchestration before implementation begins.
- **User Story 1 (Phase 3)**: T001 must fail before T002; T003 depends on T002.
- **User Story 2 (Phase 4)**: T004 must fail before T005-T007; T006 and T007 depend on T005 and may proceed in parallel because they modify different components.
- **User Story 3 (Phase 5)**: Depends on User Stories 1 and 2 because it validates the integrated flow.
- **Polish (Phase 6)**: Depends on all selected stories.

### User Story Dependencies

```text
US1 strict success boundary ─┐
                            ├─> US3 regression/runtime verification ─> Final checks
US2 secret lifecycle ───────┘
```

### Parallel Opportunities

- T006 and T007 can run in parallel after T005 because they modify different components.
- Do not parallelize tests and their prerequisite implementation when following the required fail-first order.

## Parallel Example: User Story 2

```text
After T005:
- T006: Remove plaintext fallback and clear temporary state in src/components/Login.tsx
- T007: Remove persistence and clear temporary state in src/components/ManagementCenter.tsx
```

## Implementation Strategy

### MVP First

1. Complete T001-T003 for User Story 1.
2. Stop and prove strict failure handling with the targeted test.

### Incremental Delivery

1. Complete User Story 2 and verify both persistence prohibition and temporary-state cleanup.
2. Complete User Story 3 in the correct local Pages environment.
3. Run final validation and focused diff review.
4. Do not deploy; hand the reviewed result back to the user.

## Notes

- Continue from the current repository state and preserve unrelated existing changes.
- No task may invoke an external worker, Router, CLI agent, or delegation mechanism.
- No task authorizes `src/App.tsx` changes, employee-deletion changes, production access, deployment, D1 migration, dependency changes, cloud-sync work, navigation-persistence work, or general session-isolation work.
- If implementation discovers a mismatch with the confirmed response contract, stop and report it to Codex rather than changing backend behavior or planning artifacts.
