# Quickstart: Validate Secure Frontend Password Flow

## Preconditions

- Continue from the current repository state.
- Do not deploy or access production resources.
- Do not install or upgrade dependencies.
- Use deterministic fake credentials only; do not echo credential values in command output.

## 1. Focused automated validation

Run the targeted password tests:

```powershell
npx vitest run tests/passwordApi.test.ts tests/passwordFrontendSecurity.test.ts tests/password.test.ts
```

Expected outcomes:

- valid HTTP + JSON object + `success: true` is accepted;
- HTTP errors, network errors, non-JSON, malformed JSON, invalid shapes, missing success, false success, and non-boolean success are rejected;
- the legacy plaintext administrator-password key is removed and never recreated;
- no fake plaintext password is written to local storage, session storage, IndexedDB, logs, source-controlled application code, or other browser persistence;
- applicable temporary password state is cleared after success, failure, cancellation, dialog closure, and component lifecycle completion;
- test output contains no supplied fake password value.

## 2. Project validation

```powershell
npm run typecheck
npm run test
npm run build
```

All commands must pass without dependency changes.

## 3. Focused local Cloudflare Pages validation

Use the existing local Pages workflow, not Vite-only API behavior:

```powershell
npm run cf:functions
npm run cf:dev
```

With deterministic local-only fixtures, confirm:

- valid employee and administrator password changes still report success;
- generated-password login succeeds;
- old passwords are rejected;
- affected sessions are invalidated as before;
- simulated HTTP, non-JSON, malformed, and explicit-failure responses never show success;
- local storage, session storage, IndexedDB, and other browser persistence contain no plaintext administrator password;
- temporary password state is cleared when the active request or handoff ends;
- captured logs do not contain test passwords or other secrets.

## 4. Scope review

Inspect the relevant diff and confirm there are no changes to backend password behavior, cloud synchronization, navigation persistence, general session isolation, deployment configuration, migrations, lockfiles, or dependency versions.
