---
paths:
  - "packages/**/*.ts"
---

# Errors, logs and error codes

- An expected failure of an operation that can go wrong (network, secret store, protocol, daemon) returns
  `Result<T, ErrorBody>` built with `fail(errorBody('DCK-X-001', detail))`. Never a bare `ErrorCode`,
  `string` or `Error` in its place, and never `fail('DCK-...')` directly. The detail is context to reproduce
  (endpoint, status, OS code) and never a secret.
- Optional environment data (missing file, a vanished process, unreadable third-party JSON) returns
  `undefined` or the default with `.catch(() => undefined)` or a `catch` that returns. A closed set of states
  is a discriminated union by `kind` (`ComposeStatus`).
- `throw` only for a bug or a violated precondition (`new Error('invariant: ...')`). `DckError` only inside
  an IPC handler, where the hub converts it to its code; an unexpected error becomes `DCK-IPC-002` and the
  detail goes to the log.
- A `catch` is never empty: it converts to a `Result` or a default, or logs and moves on, or carries one line
  saying why it is ignored (e.g. `localStorage` unavailable).
- An invalid configuration or state file goes back to the default, warns with `logger.warn` and does not
  bring the app down. File writes are atomic (temporary file, then `rename`).
- Error codes are `DCK-{DOMAIN}-{SEQ}` in `packages/core/error-codes.json`, with a unique RPC range. The domain
  is three capital letters (today `IPC`, `DMN`, `SEC`, `NET`, `GLB`). The message text is the catalog entry
  `error.<code>` in both languages. An unused code is deleted, never marked obsolete.
- Logs use the injected `Logger` (`info`, `warn`, `error`), never `console` (only build scripts may). English
  message, short, no final period, context in an object (`{ file, key, pid }`), the cause of an exception in
  `error: String(error)`. `error` is a failure, `warn` a degradation, `info` a relevant event. Never log a
  secret or expose a stack trace to a client.
