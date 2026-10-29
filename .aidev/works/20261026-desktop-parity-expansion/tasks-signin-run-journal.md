# 7B4c4b: native run journal

- [x] Internal fixed closed namespace with role-separated Host/controller/observation/installer operations (taskcheck).
- [x] Private retained directory/file checks, bounded DPAPI read and no-replace identity-checked publication/claim (taskcheck).
- [x] Initial/independently observed completion only for new generation; durable transition marker and conservative crash recovery (taskcheck).
- [x] Generated ordinary temp-file restart, wrong-role/mode/process/digest, missing/extra/partial records, scope/ACL revocation and nine source controls.
- [ ] Independent review/delta, Windows CI and guarded delivery.

Internal storage core only. The caller must establish the actual owner mutex, exclusive barrier or exact observed process handle according to role. No Host/controller/fixed installed-path factory invokes this core yet. No installed state, service, actual desktop/input, keys/trust or installer operations are performed.
