# Implementation Plan: Secure Frontend Password Flow

**Branch**: `001-secure-password-frontend` | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-secure-password-frontend/spec.md`

## Summary

Harden the existing frontend password flow so mutation requests succeed only after an HTTP-success response containing a plain JSON object with `success: true`, while every transport, parsing, shape, or explicit-failure case remains a failure. Remove the development-only plaintext administrator-password fallback, proactively delete its legacy browser key, and clear temporary password state when an active request or handoff ends. Preserve the existing backend contract and UI flows through a small shared frontend helper plus targeted deterministic tests.

## Technical Context

**Language/Version**: TypeScript 5.8, React 19

**Primary Dependencies**: Existing React, Zod, browser Fetch API, and Vite stack; no new dependencies

**Storage**: Existing browser storage for non-secret metadata; plaintext passwords are prohibited from local storage, session storage, IndexedDB, logs, source files, and all other persistence. Existing Cloudflare credential storage remains unchanged.

**Testing**: Vitest 5 targeted unit tests, existing project test suite, TypeScript no-emit validation, production build, and focused local Cloudflare Pages runtime checks

**Target Platform**: Existing web application in modern browsers, with Cloudflare Pages Functions in the correct local runtime

**Project Type**: Existing React single-page frontend with Cloudflare Pages Functions backend

**Performance Goals**: No measurable regression to the existing password interaction; validation completes within the current request lifecycle without additional network calls

**Constraints**: Smallest safe frontend-only change; no backend contract changes, authentication redesign, general session isolation, cloud sync, navigation persistence, deployment, production access, D1 migration, or dependency changes; never expose secrets

**Scale/Scope**: The password request helper and directly relevant password UI in `src/components/ManagementCenter.tsx` and `src/components/Login.tsx`, plus focused tests. `src/App.tsx` credential rename/delete and employee deletion behavior are explicitly excluded.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Preserve Current Project — PASS**: The plan continues from current code, retains verified backend behavior, and excludes completed or unrelated stabilization areas.
- **Codex Direction and Gemini Implementation — PASS**: This is CRITICAL credential work. Codex supplies this short plan; implementation must be delegated once through the Gemini Router with `complexity=hard`, then reviewed by Codex.
- **Bounded Delegation and Focused Review — PASS**: One bounded Router task will cover the small frontend change and targeted tests, subject to the one-primary/one-fallback maximum. Review is limited to relevant diffs and checks.
- **Protect Production Data and Secrets — PASS**: The plan forbids deployment, production access, migrations, secret output, and real credentials. Tests use deterministic fake values only.
- **Verify in Correct Environment — PASS**: Unit/type/build checks are paired with focused local Cloudflare Pages verification for credential behavior; Vite-only fallback behavior is not treated as backend evidence.

Post-design re-check: all gates remain passed. The design adds no service, dependency, persistence layer, migration, or backend change.

## Pre-Implementation Orchestration (Codex Only)

Before creating any external implementation brief, Codex MUST confirm that `spec.md` and `contracts/password-operation-response.md` match the existing successful response bodies in `functions/api/auth/password.ts`. Only after that confirmation may Codex create the bounded Gemini Router brief and invoke the Router with `complexity=hard`. This orchestration remains outside `tasks.md`; the feature task list contains implementation work only. No Router invocation occurs during planning or remediation.

## Project Structure

### Documentation (this feature)

```text
specs/001-secure-password-frontend/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── password-operation-response.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── Login.tsx                       # Remove plaintext admin fallback and legacy key
│   └── ManagementCenter.tsx            # Existing password mutation UI and transient state
└── utils/
    ├── password.ts                     # Existing password generator
    ├── passwordApi.ts                  # New strict request/response helper
    └── validation.ts                   # Existing validation/session cleanup

tests/
├── password.test.ts                    # Existing password validation/generator tests
├── passwordApi.test.ts                 # New strict response tests
└── passwordFrontendSecurity.test.ts    # New persistence and temporary-state tests
```

**Structure Decision**: Keep the current single frontend project and extract only the strict password-operation request boundary and legacy-key cleanup into `src/utils/passwordApi.ts`. Use it only from the directly relevant password UI. Keep `src/App.tsx`, employee deletion, and backend files unchanged.

## Phase 0: Research Decisions

See [research.md](research.md). No unresolved clarifications remain.

## Phase 1: Design

- Define a frontend-only password operation result boundary in [contracts/password-operation-response.md](contracts/password-operation-response.md).
- Model success, failure, and transient secret handling in [data-model.md](data-model.md).
- Validate the change with [quickstart.md](quickstart.md), using unit checks first and the local Cloudflare Pages environment for runtime evidence.

## Implementation Sequence

1. Add focused tests for strict response acceptance/rejection, forbidden persistence, and temporary-state cleanup using deterministic fake values.
2. Add the small shared frontend request/response helper.
3. Route only the password mutations in `src/components/ManagementCenter.tsx` through the helper without changing backend payloads or success behavior.
4. Remove the plaintext admin-password development fallback, delete the legacy `pe_admin_password` key when encountered, retain only non-secret timestamp/session metadata, and clear applicable temporary password state after success, failure, cancellation, or lifecycle completion.
5. Run targeted tests, typecheck, existing tests, build, and focused local Pages verification. Inspect only relevant diffs and storage/log evidence.

## Complexity Tracking

No constitution violations require justification.
