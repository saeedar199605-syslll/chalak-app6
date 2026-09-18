# Data Model: Secure Frontend Password Flow

No persistent application entity or backend schema is added. The feature uses transient frontend values only.

## Password Operation Response

Represents the parsed result of an existing password mutation.

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `success` | boolean | Yes for success | Must be exactly `true`; missing, false, or non-boolean values are failures |
| `error` | string | No | May be used only as a safe failure message; must not contain or reproduce submitted secrets |
| Existing operation metadata | Existing contract types | No | Preserved but never substitutes for `success: true` |

### State Transitions

```text
request pending
  ├─ transport failure ───────────────> failure
  ├─ HTTP failure ────────────────────> failure
  ├─ non-JSON / parse failure ────────> failure
  ├─ non-object / malformed object ───> failure
  ├─ success !== true ────────────────> failure
  └─ HTTP success + valid object + success === true ─> success
```

Only the final state may trigger existing success UI or follow-up behavior.

## Transient Password Secret

Represents an administrator or employee plaintext password while the user-requested operation is active.

| Property | Rule |
| --- | --- |
| Lifetime | In memory only for the current interaction/request |
| Browser persistence | Prohibited in local storage, session storage, IndexedDB, caches, or other application persistence |
| Logs and files | Prohibited in logs and source-controlled artifacts |
| Test values | Deterministic fake strings only |
| Cleanup | Clear applicable temporary password fields immediately after success, failure, cancellation, dialog closure, or component lifecycle completion; a generated password may remain only during the active visible handoff |

## Legacy Admin Password Entry

The historical `pe_admin_password` browser key is forbidden state.

| Event | Required behavior |
| --- | --- |
| Relevant frontend initialization | Remove the key if present without logging or displaying its value |
| Login or password change | Never read the key to authenticate or validate a credential |
| Successful password change | Never recreate the key |

Non-secret timestamps used for cross-tab session invalidation are not password secrets and remain unchanged.
