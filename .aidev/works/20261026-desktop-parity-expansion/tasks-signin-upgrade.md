# Current-schema clean stopped package upgrade

- [x] Independent design review and fixes: release old run pins before archive rename; bind exact old runId/digest; distinguish pre/post Disable failures.
- [x] Fixed primary-admin/owner/mutex/current package, immutable exclusive barrier and exact initial/complete CleanBoundary; no pending/unobserved-stop generation reset (taskcheck).
- [x] Reviewed private stage, Disabled before closed private marker, captured root identities and nonreplace archive/publication; preserve all other data and barrier (taskcheck).
- [x] Revalidate archived old journal and exact digest before new initial; marker binds new runId and stage/archive names; final proof then own marker removal/Manual only (taskcheck).
- [x] Initial and independently completed generated positive upgrades; old code/journal/archive/barrier/runtime/enrollment sentinels checked.
- [x] Interrupted after code/runs archive, pending/unobserved stop, foreign marker, missing evidence, active service, admin request, authority loss/concurrent barrier refusals added.
- [x] Six copied-source controls/restored positive and final marker-bound positive completion; controls copy predates final metadata binding (exact-head CI reruns all).
- [x] Existing run-journal nine controls/regression passed (26.99s); final public compile-only passed after optional fixture/marker metadata changes.
- [x] Independent source/correction/records reviews clear.
- [ ] Exact-head Windows CI and guarded delivery.

No old-version compatibility/migration is required by the user. This tool never starts/stops/kills/registers/deletes a service or modifies/reset keys/trust/enrollment/runtime. Native SCM mutations, actual private ACL creation and real installed update are untested/unperformed. Partial upgrade recovery remains a separate unfinished task.
