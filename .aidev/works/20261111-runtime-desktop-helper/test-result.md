# Runtime-only desktop helper: backend verification

A standard on-demand SYSTEM task launches the existing broker, with no SCM registration. Its admin-only definition remains; the existing soda server lease owns the running process. Startup/login triggers are absent; battery/idle/network restrictions are off, PT0S, IGNORE_NEW, restart0. Runtime EXE/pipe namespace is separate from the existing service. No installed service was changed. TUI closing is not server shutdown.

Related Settings/Lease tests:46 PASS. Restoring only DesktopSettings.ts from23cf makes the focused runtime startup/resolved-preparation cases fail2; exact bytes restored to the recorded SHA then46 PASS. Initial dependency resolution attempts and old expected-command failures are kept distinct from final success. Existing lease heartbeat/backoff/EOF/permission-replacement tests are reused; no UAC is launched by background retries. Resolved prepare path is shown only to local configuring clients.

Actual SR-PC candidate csc3source checks: old SCM-only predicate failed peer check; runtime predicate passed. Old virtual InstalledExecutable-only factory failed virtual check; runtime/legacy actual opener selection passed. Pure checks cover invalid PID/ticks/purpose, retired/foreign/session0 peer identity, generic GA/GW and definition write/owner restrictions, normal/start-failure console Shutdown completion. They create no task/SCM/COM/desktop/input. Early compilation CS0165 and a GA mask omission were found and corrected before any task registration; those failed results remain private.

Actual PS5 executes the real task-definition factory against inert metadata objects: old installer without this builder fails, new builder passes all SYSTEM/action/trigger/power/idle/network/instance/lifetime assertions. Full current14-source preparation -ValidateOnly and Windowshelper -RuntimeBroker -AllowUnlock -AllowElevated -AllowVirtualDisplay -ValidateOnly both compiled successfully on SR-PC, with compiler/source seals stable. ValidateOnly did not request UAC, register/run a task or mutate a service. These checks are not a live Task Scheduler/worker/frame proof.

Raw fixed C# negative output:

```json
{"ok":false,"failureCase":"peer","generatedOnly":true,"taskRegistered":false,"desktopOpened":false,"input":false}
```

Raw virtual negative output:

```json
{"ok":false,"failureCase":"virtual","generatedOnly":true,"taskRegistered":false,"desktopOpened":false,"input":false}
```

Complete source-sealed Windows PS error/raw outputs and private candidate paths remain in .git/recovery/runtime-desktop-helper-virtual-pure-20261111 and the private raw-record.md, rather than publishing operational paths. Public structured receipts identify scope and exit codes. Windows candidate Task registration, effective normal-user Run/modify denial, authenticated Runtime SYSTEM worker frame, server-stop process retirement/reconnect, and production migration are subsequent Root-controlled gates. Current registered legacy service is preserved. No ExecutionPolicy bypass, UAC policy change, new token or wire permission layer was added.

## Final integrated build (UI c15558ca +20e0d68c)

Code integration head b96364627825d8627cf9ae7b6af5910a64f1160f. Protocol build exited0; strict server build including referenced TUI/desktop packages exited0 in287.604s; Web test-inclusive vue-tsc plus Vite exited0 in277.616s. Final server test-inclusive typecheck exited0 in212.26s using unchanged verified CLI dist dependencies. Each required build was run once, code/source unchanged. Real Chromium plus isolated A/B servers passed the locked secure-canvas E2E1/1 (10.9s), with no OS input/Windows task.

Seven artifact maps contain3357 files: protocol300/client-core364/desktop-assistant152/TUI412/Web37/server1864/CLI228. Relative to23cf, protocol2/TUI3/server5 outputs changed, Web entry1 and8 hashed assets replaced; there are no removed non-Web artifacts. Old Web hashed assets may be retained by later deployment. No app deployment or legacy service migration has occurred.

The final14 Native/PowerShell source hashes match the full Windows -ValidateOnly compile inputs. These receipts and generated tests establish compilation and policy behavior, not successful Task Scheduler execution, normal-token ACL enforcement, SYSTEM worker frames or actual retirement. Those are isolated Root-controlled candidate gates before production or old service removal.

## Subsequent candidate lifecycle and application promotion

The prepared task was exercised directly by the normal active-console user, without a desktop connection or input. Two separate lease processes started the SYSTEM broker through Task Scheduler. Each broker was bound to its lease PID and creation time; the same process pair remained running for12681ms and12345ms respectively, beyond the existing6s heartbeat deadline. No share worker was started. After each stdin EOF, the lease exited0, all owned Runtime processes exited, and the task returned to Ready before the next start. The task definition/ACL and existing legacy service remained unchanged. The task definition remains installed and idle.

The earlier candidate-server fixture failed before its lease-ready milestone. Its retained evidence does not establish the cause; its owned processes were subsequently confirmed retired. Direct native success does not establish the candidate server authentication/settings path or the complete soda-server-to-helper link. Protected worker frames, UAC behavior and input remain unverified for this Runtime Task route. The legacy recovery service is retained.

WSL application promotion then fast-forwarded production23cf to a40 with all3357 artifact hashes verified:19 writes, no deletions, old Web assets retained, and all9 changed Web HTTP responses matching. One graceful handoff preserved8/8 panes, adopted the formal6 PTYs, dropped0, reported no error and produced a fresh marker. No native/service changes or remote push were performed in this step.

Windows application promotion also reached a40:3357 target hashes matched,19 files were written, none deleted,42 extras retained, and all9 changed Web HTTP responses matched. Its graceful handoff preserved3/3 panes, adopted the formal2 PTYs, dropped0, reported no error and produced a fresh marker. All12 saved desktop permission values remained true and unchanged. The normal production environment had no custom desktop-command override, so the bundled command selected the Runtime route without rewriting a user command.

Production startup was observed with the Runtime PowerShell flag, one normal lease and one SYSTEM broker bound by PID/creation time, task Running and no share worker. This establishes the production server startup-to-lease link, unlike the failed isolated server fixture above. The legacy service registration, executable hash, SCM configuration and SDDL were unchanged; its Running-to-Stopped transition followed the old lease exit. The legacy service remains available for recovery. Complete production server shutdown, protected worker frames, UAC behavior and input through the Runtime route were not tested. Direct native EOF retirement is the narrower lifecycle result actually established. Operational scripts, images, credentials and private machine paths are not included in this record.
