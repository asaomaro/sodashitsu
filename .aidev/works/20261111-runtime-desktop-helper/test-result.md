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
