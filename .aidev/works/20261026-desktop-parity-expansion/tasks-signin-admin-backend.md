# 7B4b3: guarded mutable backend

- [x] Bind native persistence to claimed operation kind and deadline (taskcheck).
- [x] Fixed runtime key/policy destinations; directory leases, private ACLs and non-replacing unsafe-object rejection (taskcheck).
- [x] Enrollment canonicalization against the actual claimed data, DPAPI and fixed atomic path; explicit disable (taskcheck).
- [x] Bounded fixed helper task facade, store/backend ownership and cancellation (taskcheck).
- [x] Package closed-asset updates and helper syntax/generated checks (taskcheck).
- [ ] Source negatives/exact restoration, build/type/full, independent cross and delivery.

No main/SCM/installer activation or actual privileged/user-key/trust/desktop operations. Installer/controller and startup integration follow this slice.
