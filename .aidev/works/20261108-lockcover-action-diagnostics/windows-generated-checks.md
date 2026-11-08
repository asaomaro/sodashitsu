# Root-owned Windows generated checks

Author has not executed Windows, C# compilation or these C# checks. Linux has no csc/mcs/dotnet. No third dismiss is requested by this file.

Use the exact four inputs and hashes in csharp-input-sha256.json. Resolve the three product inputs from the fixed 437df4ea Git blobs and the fixture runner from 9965f76f, first requiring every raw Git-blob SHA to match PINS. Copy those verified raw bytes directly into a new private stage; do not rewrite or normalize the checkout, change core.autocrlf, or compare LF seals to filtered working-tree bytes as if identical. The actual stage byte seals, repository logical revision, Windows filtered-source state and normal-role normalized source/binary seal are separate evidence. In this new private stage, the fixed Framework64 csc.exe compiles them with:

```text
/nologo /target:winexe /platform:x64 /main:SodaLockCoverObservationChecks
/out:<OWN_STAGE>\LockCoverObservationChecks.exe
/r:System.dll /r:System.Core.dll /r:System.Drawing.dll
/r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.ServiceProcess.dll
<exact staged WindowsDesktopUnlock.cs> <exact staged WindowsDesktopHost.cs>
<exact staged WindowsLockCoverChecks.cs> <exact staged LockCoverObservationChecks.cs>
```

Capture compiler diagnostics privately with bounded output, no policy bypass. After compile0, root's normal hidden actor may run this new binary once with only --check, redirected streams and outer timeout. It invokes the existing generated cover-loop checks plus fake-send core checks: SYSTEM/false guard send0 with original short-circuit counts; actual fake return0/1/2/>2 outcomes; single fake send; wake never chains a key; diagnostic TextWriter failure leaves guard/action semantics intact; native8-record/enum ceiling. No SendInput is called by the fake core tests, and no real user desktop input/capture/service is used.

Only root after review/deployment/source verification may decide on a separate fresh-ready/control/epoch and one explicit real action. Counts represent insertion acceptance, never target delivery/unlock success; no diagnostic authorizes input or weakens the old source guards.
