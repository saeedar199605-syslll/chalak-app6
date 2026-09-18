# Codex Commander Rules

## Architecture

Codex is the commander, planner, reviewer, and final authority.

Gemini CLI is the implementation worker.

Do not use Groq.
Do not use internal Codex worker agents for substantial implementation.

External Gemini Router:

C:\Users\Saeed\Desktop\Codex-Gemini-Test\gemini-router.ps1

Project workspace:

C:\Users\Saeed\Desktop\chalak-performance-rebuilt-v2.1-cloud-sync

## Current project rule

Always continue from the CURRENT repository state.

Never restart the project.
Never redo completed stabilization work without evidence that it is broken.
Never revert existing valid changes unless explicitly requested.

## Task classification

TRIVIAL:
- tiny text change
- typo
- rename
- very small isolated edit
Codex may perform directly.

STANDARD:
- ordinary UI bug
- component logic
- normal test failure
- isolated feature fix
Delegate to Gemini Router with complexity=normal.

COMPLEX:
- multi-file logic
- application workflows
- significant debugging
- Cloudflare integration
Delegate to Gemini Router with complexity=hard.

CRITICAL:
- authentication
- authorization
- password/credentials
- session security
- cloud synchronization
- concurrency
- destructive migration
- production data
Codex must make a short plan first, then delegate implementation to Gemini Router with complexity=hard, then review the result.

## Gemini model routing

simple:
Primary: gemini-3.1-flash-lite
Fallback: gemini-3.5-flash

normal:
Primary: gemini-3.5-flash
Fallback: gemini-3.1-flash-lite

hard:
Primary: gemini-3.5-flash
Fallback: gemini-3.1-flash-lite

The Router controls this automatically.

## Request budget

Per delegated task:

- maximum 1 primary Gemini CLI run
- maximum 1 fallback Gemini CLI run
- maximum total Gemini runs: 2

Do not manually retry Gemini after the Router has exhausted its budget.

Do not call multiple Gemini models independently for the same task.

If the Router fails after its request budget:
- inspect the reported failure
- reduce/split the task
- do not repeat the same large request blindly

## Codex token discipline

Keep Codex context small.

Prefer:
- targeted search
- targeted reads
- Gemini implementation reports
- concise diffs
- focused verification

Avoid:
- whole-repository rereads
- huge source dumps
- repeated architecture audits
- duplicate test runs
- internal Codex agents for implementation

## Delegation workflow

For every non-trivial implementation:

1. Create a concise task file under:

C:\Users\Saeed\Desktop\Codex-Gemini-Test\tasks\

2. The task must say:
- continue from current repo state
- exact objective
- relevant known symptoms
- restrictions
- required verification
- expected final report

3. Run:

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Saeed\Desktop\Codex-Gemini-Test\gemini-router.ps1" -TaskFile "<TASK_FILE>" -WorkspaceRoot "C:\Users\Saeed\Desktop\chalak-performance-rebuilt-v2.1-cloud-sync" -Complexity <simple|normal|hard>

4. Review Gemini's result.

5. Inspect only relevant changed files/diffs.

6. Run only the verification required to establish correctness.

7. If Gemini succeeded, do not reimplement the same task yourself.

## Safety

Never automatically:
- deploy
- run production mutations
- delete production data
- start D1 migration
- run npm audit fix
- upgrade dependencies
- expose secrets
- print API keys or passwords

Production or destructive actions require explicit user approval.

## Existing Phase 1 state

Do not assume the repository is pristine.

Previous stabilization work exists.

Most recently verified:
- TypeScript typecheck passed
- test suite passed 20/20
- production build passed
- employee deletion appeared fixed

Known behaviors still requiring proper runtime/E2E verification:
- F5/navigation persistence
- password generator/change
- logout/session isolation
- cloud refresh/sync

API-related behavior must be tested under the correct Cloudflare local environment, not assumed from Vite-only 404 responses.

## Final reports

Keep final reports concise:

STATUS
WORKER_MODEL
FILES_CHANGED
CHANGES
TESTS
RISKS
UNRESOLVED
NEXT_ACTION
