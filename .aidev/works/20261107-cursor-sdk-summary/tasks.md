# Tasks

- [x] Public SDK runtime: credential read-only, local policy, text-only response and cancellation. Safety taskcheck required.
- [x] Owned worker supervisor: bounded input/output, deadline/access invalidation, physical close before cleanup. Safety taskcheck required.
- [x] SummaryService Cursor-only binding and optional pinned dependency/lock.
- [x] Focused tests, policy-removal negative control/exact restoration and package build/typecheck.
- [ ] Documentation, then independent full-diff review by a different implementation context.

No real login/model call, normal HOME write, CLI update or Windows machine operation is authorized in this implementation task. Public-API DI tests are application wrapper tests, not SDK-server tool rejection proof.
