# Windows microphone empty-buffer headroom

The native sink started with no prefill and wrote only 960 frames when observed padding was zero. A source-bound 48kHz consuming-queue model with valid 0.5ms/1ms arrival lateness reproduces silence holes and detector continuous=false on the previous source. This establishes a boundary bug, not attribution of A16/A17 to actual COM underflow. Actual endpoint capacity/padding was not observed.

The fix inserts up to 960 zero samples before the unchanged 960 user samples only when observed padding is zero. Total queued frames stay <=1920 and <=device capacity; capacity960 remains compatible without added headroom. Nonempty writes remain960. The existing60ms wait,100ms wire expiry/150ms native bound,three allowed checks,Start/Stop,pipe format,scope guards and detector thresholds remain unchanged. A fixed3840-byte scratch is zeroed before staging and on release/dispose. No raw audio is retained.

## Evidence

- `negative-old.log`: previous1006 source fails2 focused regression cases (empty-padding plan and source-bound jitter continuity).
- `positive-restored.log`: byte-exact restored production source passes5 source-bound generated checks.
- `restoration.json`: durable recovery snapshot,old/new SHA and exit status.
- Node syntax check and git diff check passed.
- `WindowsMicrophoneRenderChecks.cs` is a real C# pure arithmetic/staging validator. `validate-microphone-render.ps1` compiles production PipeKernel/Microphone plus this check using Add-Type; it creates no COM/sink/pipe/token/endpoint. It has NOT been compiled or executed here. Linux has no C# compiler. Root Windows compile/pure is the next gate, not claimed passed.
- Independent review pending at source freeze; no Windows/live/model/audio execution by author.

## Deployment and actual actor

ProtectedMicrophone creates a fresh DesktopNativeRoleBinary(user-microphone). DesktopNativeRoleBinary.node.ts invokes build-native-role.ps1 host/module preparation; module builds a fresh role-UUID user-microphone.dll from WindowsUserMicrophoneRole/Policy,WindowsDesktopMicrophone and PipeKernel, pins its SHA and preflights before normal-user spawn. The common host cache hashes WindowsNativeRoleHost.cs (unchanged); the role DLL is never reused. A source asset deployment plus fresh actor prepare therefore incorporates this change. Server build alone neither copies these script assets nor creates the role DLL. SYSTEM unlock installer/service does not require update/reinstall. All ownership/expiry/close guards remain in place.

A/BC compile receipts include the changed NativeMic raw SHA, so old0a bins cannot pass new source seals: Root must fresh compile A8sources/3exe and BC12sources/7exe, run generated checks, then prepare a new unapproved job. The dedicated render validator adds a separate pure check; it does not replace A/BC checks. Actual actor module SHA is bound by fresh source seals/build route/preflight, not merely assumed from a changed DLL digest. Root alone performs Windows actions. A18 receiver improvement remains untested.
