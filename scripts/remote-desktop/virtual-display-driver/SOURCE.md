# Source

Derived from Microsoft Windows-driver-samples commit `bb68ed5e770bce04dc5395ec9258dafab034184d`, `video/IndirectDisplay/IddSampleDriver/`. Original MS-PL license is in LICENSE; copyright headers are retained.

Local changes: one EDID-less virtual monitor per software device; dedicated hardware ID/group/package names; lease container ID propagated to the monitor; product diagnostics. The broker must hold the unique device handle for exactly one authenticated lease.

No driver has been installed by these build checks. Unsigned build artifacts are not distributable production drivers. Windows signing and live headless capture remain separate acceptance checks.
