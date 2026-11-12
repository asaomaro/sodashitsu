# Final desktop migration operations

Source/artifact workspace: `/workspaces/sodashitsu-transient-desktop-broker`, validated source `d7e94e61`, runtime build `a8a3fef0` (original native through 8960c25b, signin through da73b17d, transport through 965fe73b; CI 7d3902c0). Initial seven-package build and server-only Settings rebuild passed. Final hashes are supplied by the artifact owner; no second global build. Actual installed changes have **not** begun. Source validation is complete: final scoped type/scripts exit 0, 419 focused unit checks, five repaired browser cases and corrected actual Windows Host suite pass. Archive/payload hash review and actual root migration Go remain pending.

## Pinned deployed facts and namespaces

- Authoritative active baseline: `.git/recovery/desktop-comparison-cleanup-20261112/artifact-map.json`, 3357 files. Current physical seven-package tree is 3450: every active hash matches and 93 extra paths are separately inventoried. Unrelated extras are preserved. Retired generated JS/maps/declarations/runtime assets are removed only by the final explicitly reviewed obsolete-path list, never a recursive production `dist` wipe.
- Runtime Task `SodaDesktopRuntime-68F6FB663A79FE16`, SYSTEM, on demand, zero triggers. Fixed image `C:\Program Files\Sodashitsu\SodaDesktopRuntime-68F6FB663A79FE16\DesktopUnlock.exe`; installed SHA256 `190954556ef8ef45177cbb56b327e3137684ddc275cff6b5668fa5d61a1fc018`. Last read-only snapshot found it running; it must become idle after the existing source lease closes before public preparation.
- Legacy Unlock `SodaDesktopUnlock-68F6FB663A79FE16`, Manual/Stopped, image SHA256 `e85f7e083a0673c55427e4fe24b750c6e2db261134f5751badaa1e4cf861223d`. Resolve its image from saved SCM configuration and verify this hash; do not infer or print raw command arguments.
- Old Signin `SodaDesktopSignin-68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d`, Manual/Stopped, LocalSystem; image SHA256 `45e395cdc18022113cd65fec315ab5b21b861351832c0cc9bf25daddbaffd77e`. Installed manifest SHA256 `17a1b46bdfec1633292e1a8c0f8c911fcb88435e92b65007787cf73f151c0394`.
- New short Signin `SodaDesktopSignin-68f6fb663a79fe16`. Code folder remains `C:\Program Files\Sodashitsu\DesktopSignin-68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d`. Data remains `C:\Program Files\Sodashitsu\DesktopSigninData\68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d`. Use the existing full owner SID from the verified installed manifest, and verify its SHA256 slot equals that full hash. Never derive data locations from the shortened service name.
- Boot start task `SodashitsuSigninBootStart-ba56cc04f0254ba5a19aa721e753478a` only starts the pinned old Signin service and records guarded admission/receipt. Its script SHA256 is `66f963e8e31e7a174254259caa6affba8bfc00c7109c92d4fea2673ee3170136`. Disabled upgrade tasks are `SodashitsuSigninUpgradeBoot-23bfc429cfc84d32ab9019df557f1c7f`, `SodashitsuSigninUpgradeBoot-c3efd99d901f43c7979ccbf358534579`, and `SodashitsuSigninUpgradeBoot-eced84ef7f2e49ac9159913bd73df1cb`.
- Evidence: `/tmp/soda-windows-installed-readonly/` derived inventories; source-only Windows evidence `/tmp/soda-final-source-windows-7d3902c0/`; build/test evidence `/tmp/soda-final-integration-20261113/`. No raw credentials/PIN/key bodies are copied into reports.
- Read-only preflight also records only a boolean indicating whether a persisted desktop command/helper override contains the removed `-RuntimeBroker` selector. Back up a verified old generated override and replace it through normal settings with the canonical default; preserve a genuine user custom command. No compatibility fallback is introduced.

## Before the first mutation

Use the existing pinned NodeGit/admin-parent operations and strict pinned SSH configuration. Create one ordinary administrator/SYSTEM-only backup directory under the already trusted `C:\git` parent. This is a finite backup, not a new recovery daemon, Task, journal, or alternate runtime mode.

1. Record the actual active seven-package code root/source hash and existing durable daemon claim/state directory through the existing preflight operations. Read current desktop permission booleans and pane/workspace counts/identities; keep the existing daemon state/claim locations. Do not move/delete state or regenerate identity. The original main/dirty WSL checkout stays untouched.
2. Save complete SCM configuration and SDDL for the exact old long Signin and legacy Unlock registrations, including original `PathName`, account, start type, service SID/failure/delayed-start settings where present. Record the original image hashes above. Save Runtime Task XML and owner/group/DACL through Scheduler COM (`GetSecurityDescriptor(7)`), and the same XML/security/enabled state for the four exact Boot tasks. No raw task arguments are printed.
3. Copy the installed Runtime `DesktopUnlock.exe` **and its ACL** before preparation overwrites it. Public preparation does not retain a backup. Copy the complete old Signin code folder, manifest, and complete full-SID data folder with security/owner/attributes intact into the protected backup. Save file-name/hash inventories before and after copy; hash encrypted identity/trust/enrollment bytes without decrypting or printing them. Standard `robocopy /COPYALL /DCOPY:DAT /B /R:0 /W:0` is suitable; code >=8 is failure. The backup ancestor remains admin/SYSTEM-only even if original code permits owner read.
4. Save the active artifact map and only the paths the reviewed deployment will replace/delete. Preserve the 93 known extras unless proven to be retired generated output. Keep old Web assets needed by already-open browser clients until the standard release policy allows removal.
5. Compile/package the reviewed new Signin image into the protected source-staging area using public `build-signin-host.ps1 -OutputDirectory ... -OwnerSid $ownerSid`, then existing `build-signin-package.mjs`/bundle tooling with pinned Windows Node and existing reviewed bootstrap. Hash every staged file and the new `signin-package.json`; set `$newManifest` from the verified bytes. Do not invent a hash or reuse the old manifest. The final candidate manifest is recorded before operational commands are run.

## Apply after root migration Go

1. Save current desktop flags, temporarily switch desktop permissions off through the existing authenticated settings API, and await physical source/helper lease close. Confirm the old Runtime Task is idle and its actual job/process is gone. Do not stop it merely because a timer elapsed; do not lose daemon panes/claims.
2. Keep desktop flags off until both Windows and WSL endpoints have the reviewed protocol source and perform a normal Web version refresh before SRPC end-to-end verification. A new Windows endpoint against an old WSL/browser is not a valid cross-machine check; no compatibility layer is retained. Apply the reviewed seven-package payload and obsolete generated-path list with the existing verified artifact operations. Keep the durable daemon state and claims for the normal handoff/restart. Compare pane identities/counts before and after; no state reset or fresh empty daemon profile.
3. Disable the exact old BootStart task so it cannot start old Signin during the transition; retain its backup. Do not create a replacement startup task. Run the existing public helper preparation from the closed reviewed SDK:

```powershell
& "$sdk\prepare-desktop-helper.ps1" -OwnerSid $ownerSid
```

This replaces the same fixed Runtime image/Task only after its old lease ended. Verify executable hash, ACL, fixed SYSTEM action/arguments, no triggers and no per-launch UAC/ExecutionPolicy Bypass. Normal sharing remains service-free.

4. Verify old long Signin is still the owned stopped registration and manifest matches `$oldManifest` above. If it needs stopping, use standard OS SCM on that **verified old long name**; the new controller only addresses the short name. Run the standard explicit update:

```powershell
& "$sdk\upgrade-signin-service.ps1" -OwnerSid $ownerSid `
  -OldManifestSha256 $oldManifest -SourceDirectory $newPackage `
  -ManifestSha256 $newManifest -StartupType Automatic
```

The public updater archives old code, leaves full-SID data untouched, verifies the new package, creates the short registration disabled, removes the old long registration, then enables the chosen Automatic startup. Root explicitly accepts this package-verified SCM switch before first runtime verification, provided the complete old SCM/SDDL/code rollback snapshot exists. It does not execute the old binary under the new short dispatcher name.

5. Keep the new short Signin service STOPPED after upgrade. Run the existing fixed admin IPC with `{"kind":"status"}` and the new manifest, wait for actual request completion, child exit and Job active=0, and verify the service is stopped again. Only then start/query its normal role with public `control-signin-service.ps1`. Verify SYSTEM executable/hash, short SCM name, Automatic startup, expected process lifetime and owner/full-SID binding. Admin and normal purposes are never run in parallel. Do not reinitialize identity/trust, enroll a new PIN, mutate vault data, or print request/response secret payloads. Compare encrypted key/trust/enrollment hashes and durable daemon state/panes against the snapshot.
6. Restore exactly the saved desktop flags through the normal authenticated settings API. Verify normal helper, prepared on-demand Runtime Task lease, permission release/actual source closure and no additional per-launch UAC. Actual privileged UAC/reboot/lock-screen functional tests use the root-coordinated later operation; source-only checks are not claimed as those tests.
7. Only after new runtime/IPC checks succeed, delete the verified legacy Unlock service and four exact obsolete Boot/upgrade tasks through standard SCM/Scheduler. Delete only their verified owned obsolete code/script directories after backing them up; unknown entries are not adopted or removed. Do not remove Signin full-SID data or unrelated source/state.

## Explicit standard rollback

Keep desktop permissions temporarily off while reverting. Stop new short Signin using the new controller/SCM and verify actual job/process close. Restore the old code archive to its original **full-hash code path** (or the protected backup if necessary), preserving ACLs. Remove the new short SCM registration. Recreate the exact original **long** SCM registration with its saved `PathName`/account/config and restore its saved SDDL/start type; old dispatcher registration names are mandatory.

```powershell
# $oldScm is the protected snapshot, never arbitrary viewer input.
sc.exe delete $shortName
sc.exe create $oldScm.Name binPath= $oldScm.PathName start= demand obj= LocalSystem
sc.exe sdset $oldScm.Name $oldScm.Sddl
# Restore any saved service-SID/failure/delayed-start settings exactly.
```

Do not point the new short service at the old executable. Restore old Signin data from backup only if a data mutation occurred and after quiescence; otherwise keep its unchanged original bytes. Never reset or re-encrypt existing DPAPI/trust/enrollment material.

Restore the old Runtime image from its separate backup and its saved ACL, then re-register the exact saved Task XML and security (Scheduler `RegisterTask(...,6,...,5,...)` / `SetSecurityDescriptor`) under the original Task name. Restore the four Boot task XML/security/enabled states, only if deleted/disabled by this transition; do not run their recovery actions opportunistically. Restore replaced/deleted application artifact paths from their finite backup, leave unrelated 93 extras/state/claims in place, and perform the standard daemon handoff to the preserved profile. Restore the original desktop flags and compare pane identities/counts and encrypted key/trust/enrollment hashes. Any unsuccessful verification remains a reported failure; no automatic recovery loop or alternate compatibility path is installed.

All owned PowerShell helper invocations use the configured execution policy. Sites using AllSigned must sign the local protected scripts through their normal deployment policy; no per-launch Bypass or policy fallback is installed.


## Frozen source validation and prepared source artifacts

Final evidence is `final-validation.json`. The 89 closed SDK files are byte-identical to the actual protected Windows compilation projection. The public installer validates the staged full-SID package with Automatic startup, no service start, and no installed writes. New package manifest SHA256: `35d5ad32ad2b45f720794f5490dafda8bc8201e0c8fb787a31531824e5e2a39f`; protected package directory: `C:/git/soda-final-source-validation-7d3902c0-0a4c7391326345c690ed0fbaf4cf6b0f/signin-package` (pass its canonical native Windows path to public installers). Native staged image/source hashes and the new canonical Node bundle hash are recorded in final-validation.json. The first preview correctly refused a forward-slash SourceDirectory; canonical `Convert-Path` input passed, with no source change.

Actual public settings preflight proves the default bundled Windows helper, no removed RuntimeBroker environment override, all saved permission flags true, and three panes/two workspaces. Take a fresh durable snapshot immediately before mutation. No private configuration command/body was printed or changed.
