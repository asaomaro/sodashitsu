# 7B4c1: fixed SCM inspection and owner mutex

- [x] Read-only native inspection of fixed owner service configuration; reject other executable/account/type/start/recovery/trigger settings (taskcheck).
- [x] Strict service control ACL, bounded native buffer/text/pointer/action-array decoding and actual x64 ABI generated fixtures (taskcheck).
- [x] Owner-bound Global mutex with private creation, existing-object policy validation, finite wait and explicit abandoned-lock refusal (taskcheck).
- [x] Expanded source controls/exact restore and independent cross.
- [ ] Windows CI and guarded delivery.

Read-only inspection and controller serialization foundations only. No installer/register/start/stop/controller journal execution or quiescence receipt yet. Actual Inspect/Acquire are not invoked by generated tests. No actual SYSTEM/service/user-key/trust/desktop/handoff operations.
