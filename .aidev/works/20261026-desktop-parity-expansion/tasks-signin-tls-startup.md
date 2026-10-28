# 7B4b4: enrollment TLS and single-branch startup

- [x] Optional enrollment-bound single public CA, strict JS/native parsing, exact actual-claim matching (taskcheck).
- [x] Verified CA transport on both delegation and sealed endpoint; preserve hostname checks and reject redirects (taskcheck).
- [x] Dedicated main selects local claimed administration or normal presence/network once; no admin fallthrough, retain local lease through teardown (taskcheck).
- [x] Generated CA/container/DER checks, actual TLS success and failure, source controls with exact restoration; independent cross and fixes.
- [ ] Build/type/bundle, whole tests, external smoke, final independent records review and delivery.

No installer/controller activation, actual SYSTEM/service entry, keys/trust registration, desktop/input/audio device operations or handoff. Installer and SCM/controller remain following slices.
