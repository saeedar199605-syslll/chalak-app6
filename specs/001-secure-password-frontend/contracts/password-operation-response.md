# Frontend Contract: Password Operation Response

This contract documents how the frontend consumes the existing password mutation responses. It does not change the backend endpoint, request payloads, status codes, or response fields.

## Success Acceptance

A mutation is successful only when all conditions are true:

1. The network request completes.
2. The HTTP status is successful.
3. The response body parses as JSON.
4. The parsed value is a non-null, non-array object.
5. The object has a `success` property whose value is the boolean `true`.

Example accepted body:

```json
{ "success": true }
```

Additional existing metadata may be present and is preserved, but cannot replace the explicit success flag.

## Failure Acceptance

The frontend must reject the operation for any of these conditions:

- network or fetch failure;
- non-successful HTTP status;
- empty, HTML, plain-text, or otherwise non-JSON body;
- JSON parsing failure;
- parsed `null`, array, or primitive value;
- missing `success` property;
- `success: false`;
- a non-boolean success value such as `1` or `"true"`.

For a valid failure object with a safe string `error`, the existing UI may display that message. Otherwise it uses a generic safe message. Raw response bodies and submitted secrets are never logged or displayed.

## Caller Behavior

- Success-only UI, local state changes, logging, and follow-up actions run only after this contract returns success.
- Failure preserves the current failed-operation behavior and does not mutate success-only state.
- Development mode follows the same contract as every other mode; there is no non-JSON success bypass.
