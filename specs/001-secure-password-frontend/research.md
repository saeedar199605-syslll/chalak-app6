# Research: Secure Frontend Password Flow

## Decision 1: Require explicit structured success

**Decision**: Accept a password mutation as successful only when the HTTP response is successful, the body parses as JSON, the parsed value is a non-null non-array object, and `success` is exactly `true`.

**Rationale**: The existing backend already returns `{ "success": true }` for successful password mutations. Exact acceptance prevents successful HTTP status, empty bodies, HTML development fallbacks, malformed JSON, or truthy non-boolean values from becoming false successes.

**Alternatives considered**: Treating any successful HTTP status as success was rejected because it reproduces the defect. Content-Type-only checks were rejected because headers do not prove parseability or shape. Broad schema changes were rejected because the backend contract is already verified.

## Decision 2: Centralize only the mutation boundary

**Decision**: Add one small frontend helper for password mutation requests and response validation, then reuse it in the existing password-operation callers.

**Rationale**: The same endpoint is invoked from password management and credential lifecycle paths. One testable boundary gives consistent failure semantics with a small diff and avoids embedding test-only exports in a large UI component.

**Alternatives considered**: Duplicating guards in each component was rejected because behavior could drift. Redesigning the authentication client was rejected as out of scope.

## Decision 3: Remove plaintext admin fallback rather than replace it

**Decision**: Stop reading and writing `pe_admin_password`, remove the legacy key when the relevant frontend initializes, and require the existing server-backed authentication path for administrator credentials.

**Rationale**: Hashing or obfuscating a browser-stored reusable password would still create an authentication surrogate and broaden the design. The verified local Pages runtime already supports administrator login and password changes.

**Alternatives considered**: Session storage was rejected because it is also prohibited. Client-side hashing was rejected because the hash could become a reusable secret. Retaining the Vite-only local admin fallback was rejected because it depends on a source-controlled/default or persisted plaintext credential.

## Decision 4: Test pure behavior with deterministic fake secrets

**Decision**: Unit-test response validation, legacy-key cleanup, persistence prohibition, and temporary-state cleanup with deterministic fake strings, then use the existing local Pages runtime for focused integration confirmation.

**Rationale**: Focused tests cover malformed response categories and secret-lifecycle rules cheaply, while local Pages verification confirms the unchanged real contract. Temporary plaintext may exist only during an active request or visible handoff and is cleared on success, failure, cancellation, or lifecycle completion. No real secret needs to enter output.

**Alternatives considered**: Browser E2E-only coverage was rejected as slower and less exhaustive for malformed response variants. Backend test changes were rejected because backend behavior is already verified and out of scope.
