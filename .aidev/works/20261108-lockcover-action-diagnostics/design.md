# Lock-cover action-time metadata

Base main66d876c7. Root approved the design and independent reviewer found no blocking design issue before implementation. Prior two dismiss attempts stay diagnostically unknown; this source can observe only a subsequent explicitly authorized action.

## Scope and unchanged behavior

The same normal helper retains its existing owner/session/input-desktop guards, configure/control/resource epoch and heartbeat ceiling. Its current PrepareUserLockScreen branch, single SendInput of fixed Enter down/up and inserted==2 condition are preserved. DismissLockScreenCore only extracts these existing operations so generated tests can pass fake guards/sends. Existing public signatures and lock_screen_changed meaning stay unchanged. No PIN, arbitrary key, capture, service start/update, extra action or unlock-success inference is added. Diagnostic failures/count limits cannot authorize or block the original guard/action result.

C# fixed private stderr prefix SODA_LOCK_COVER carries whitelisted stages, and only enter_result has a count0..2. Counts>2 get a fixed unknown stage, not raw values. Output is limited to8 records per normal helper. Its strings, optional count and output exceptions are bounded and never include content, paths, identities, window metadata or exceptions.

The physical raw child stderr is observed before the shared-resource wrapper. Thus multiple viewers do not duplicate a trace and a departed creator does not lose the physical source's trace. The sink is active only for the same config object/source epoch, an alive physical child and the locally allowed normal Windows unlock path (not native-other-OS, virtual or elevated). Every record is parsed by exact prefix/known enum/fixed shape; oversized/malformed/unrecognized bytes are discarded, never logged as fallback text. Max8 records per helper/max128 per provider. No diagnostic goes to stdout helper protocol, viewers, relay or public RPC.

## Collection

composeServer constructs FileLogger at join(options.stateDir,"server.log"). Both ordinary provider and local endpoint provider receive a fixed callback logging only msg=desktop_lock_cover_action and validated stage/optional inserted. Existing FileLogger writes info JSONL to existing server stdout and that private state-directory log; write errors do not fail the server. Root independently determines the Windows process's actual stateDir/launcher output. Read only the relevant time's fixed msg and whitelisted fields; do not copy surrounding log or raw helper stderr. Missing/nonpersistent/suppressed output is trace unknown, not proof of no Enter or service failure. The existing limits are diagnostic retention limits, not a permission change.

## Normal role vs installed service ABI

windows-helper.ps1 selects source first. For cover it calls normal RunUserLockScreen directly and exits before InstalledExecutable/RunInstalled. Only normal role source/cache SHA must be regenerated for this diagnostic. SYSTEM service installation/update is not required by this cover path. RunInstalled/Lease/pipe words/owner verification/worker ABI and pins are untouched. A later secure source can still use the already-installed worker and need not emit this normal-only trace; trace absence and service integrity failures must be distinguished. No old service check is relaxed.
