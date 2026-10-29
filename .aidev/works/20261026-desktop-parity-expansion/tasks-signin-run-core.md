# 7B4c4a: lifecycle record/admission core

- [x] Reviewed one-shot start/observation/stop design, including short-run handle race and narrow ACK write exception.
- [x] Six closed canonical record kinds, bounded UTF8, owner/run/package/barrier/process relationships (taskcheck).
- [x] Kind/owner/run-separated machine DPAPI envelope; no credential payload or authentication claim (taskcheck).
- [x] Admission<=5min, observation<=10s, ACK before resume and single consume; shared-gate thread serialization (taskcheck).
- [x] Generated metadata/DPAPI/clocks/two-thread races,14 actual source controls and copied-byte restore; independent cross/fix re-review.
- [ ] Windows CI, unchanged-JS validation receipt and guarded delivery.

Data/core only. No Host, controller or protected-file adapter integration; no actual process/service/ProgramData/desktop/key/trust/installer operations. Native process evidence and role-bound publication must be supplied separately. Existing service is not activated by these classes.
