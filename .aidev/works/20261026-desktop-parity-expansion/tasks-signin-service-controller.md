# 7B4c4e: explicit local service controller

- [x] Primary elevated administrator, actual owner, fixed service configuration, reviewed manifest SHA and retained package verification (taskcheck).
- [x] status/start/stop only; no registration/deletion/forced termination/remote RPC/credential arguments.
- [x] Actual running PID/creation pin→ACK; admin same-handle natural completion→SCMclean/signal/exit0/receipt/same exclusive barrier→observed-stop; resource result distinct from admin operation result (taskcheck).
- [x] Normal clean Node completion retains Host until observed stop; stopped SCM status precedes process signal safely (taskcheck).
- [x] Separate private owner-slot journal mutex protects every reader snapshot and writer operation, preserving incomplete-artifact recovery (taskcheck).
- [x] Full ordinary generated Host/child/Job/DPAPI/journal with fake SCM, deterministic staged publication and stopped-before-exit gate, ten source controls.
- [x] Existing nine native regression groups and independent source/fix review.
- [x] Final records review, Windows CI and guarded delivery.

The concrete local controller source is connected; actual SCM/installed state/privileged Host Main/desktop/input/audio/keys/trust are not exercised. Installer and explicit recovery/admin-request preparation/result acknowledgment tooling remain unfinished. No automatic installation or activation.
