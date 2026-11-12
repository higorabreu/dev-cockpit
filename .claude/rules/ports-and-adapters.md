---
paths:
  - "packages/adapters/**"
  - "packages/core/src/ports/**"
  - "packages/shell/src/platform/**"
---

# Ports and adapters

- A port is an interface in `packages/core/src/ports`; its logic lives in `core` and is tested with fakes
  from `core/src/testing`. The adapter only translates the port to a technology's API.
- An adapter is a package `@dck/adapter-<name>` in `packages/adapters/<name>`, a `createX(dependencies)`
  function returning the port implementation. What touches the world (`fetch`, a command executor, the
  `/proc` root) comes in as a parameter so the test can replace it.
- Adapters are organized by technology, not by operating system, except for what is truly system specific
  (the secret store, process inspection, autostart), which sits behind the same port with one adapter per
  system. An adapter never imports another adapter; `core` never imports a package or a `node:` module.
- Before writing a new adapter open a neighboring one (for example `secret-tool` or `docker-cli`) and copy its
  shape, its error codes and the way its tests fake the executor.
- Secrets never appear in process arguments (they show in `ps`): pass them through stdin.
