# WSL Windows audio / microphone pipe transport

User confirms both available Windows PCs have WSL; no native Linux/macOS desktop device is available. Existing Windows capture/input already runs through WSL interop, but NativeAudio/Microphone explicitly require Windows Node because their private named-pipe client PID must be a Windows PID. Do not treat Linux PID as Windows identity or drop current-user/PID checks. This slice targets WSL controlling the Windows desktop, not native Linux/macOS audio parity.

## Fixed local bridge

Add a fixed bundled PowerShell entry and C# bridge executable. Node launches only trusted System32 Windows PowerShell and a fixed repository script, using argument arrays and owned stdin/stdout (no network listener, command/path RPC, arbitrary pipe, service or driver). The fixed builder compiles only the bundled source into a new current-user protected temporary directory, then product preflight runs without audio devices. The worker emits only bounded protocol output; all errors are redacted. `--preflight` compiles/validates without opening audio devices or pipes. Builder/preflight finishes during desktop sharing preparation, before helper configure/ready and before microphone start; the existing 15-second desktop readiness limit still applies. An expired/revoked generation never launches its capture helper. A first private stdin record contains a fresh nonce; bridge replies with its own Windows PID and that nonce. The Windows process is retained until actual owned-child close.

After descriptor validation, the existing Node audio/mic class sends its existing private helper enable action with that Windows client PID. The bridge then receives an internally generated pipe name and a fixed audio/microphone kind. It accepts only existing SodaDesktopAudio-/SodaDesktopMicrophone- plus32hex names on the local machine. Windows NamedPipeClientStream Identification opens the pipe; the existing audio/mic server retains its current-user DACL and GetNamedPipeClientProcessId validation. No device is enumerated/activated before authenticated connection. The PID is private control metadata constructed by B, never a field of public microphone/viewer requests.

Node exposes a bounded Duplex adapter. Child stdout has a bounded initial descriptor and then raw existing16-byte hello/PCM framing; stdin has finite control/data frames, including heartbeat and close, so an audio-read-only session has owner liveness without writing heartbeat garbage into the audio pipe. C# uses raw Console.OpenStandardInput/Output streams, fixed maximum frame sizes, monotonic sequence/liveness and finite asynchronous pipe operations. A dedicated watchdog terminates only its own bridge on owner loss or blocked I/O; parent closes/retains only its own child. Backpressure cannot accumulate stale PCM or block desktop keyboard/control input because the bridge has separate stdio.

## Integration and authority

Extend the existing private Windows helper config with a WSL bridge mode. Windows Node keeps its existing static PID path. WSL's enabled private audio/mic action supplies a validated bridge PID; normal desktop, source/console identity, explicit local audio/mic ceilings, viewer grants and PC-wide microphone ownership all remain required. No physical/default-speaker fallback; microphone still renders only to the locally selected virtual endpoint. Existing PCM deadlines, one latest waiting mic frame, Opus negotiation, disable/revoke/cleanup ACKs and source generations remain in force. Bridge shutdown is not substituted for native endpoint cleanup proof.

The bridge is an injectable internal transport for generated tests, not a public generic proxy. Probe/ready failures report unavailable; no alternate machine/transport or automatic permission is substituted. Startup has a finite budget that includes Windows bridge initialization, with generation checks after every await. Late descriptor/hello/start results after cancel cannot render audio, publish running or retain a grant. Cleanup waits pending connects/I/O and native owned process completion before releasing resources/files.

## Verification

Generated C# memory pipe servers verify Windows PID auth, both directions, magic/header/packet sizes, EOF/cancel, partial streams, expiry and blocked owned-process exit. Run actual WSL↔Windows bridge against only these generated memory servers; never open a real audio device. Node injected-Duplex tests cover delayed descriptor cancellation, hello/read/write/backpressure, codec cleanup and authority revocation. Browser generated-source/memory-sink tests cover plain/sealed/shared audio/mic and owner changes. Fragile taskchecks, actual-source negatives, independent whole/correction reviews, frozen source/root/build/typechecks/tests/browser/Windows CI/clean startup and guarded root merges are required.

Actual virtual audio device, system sound and call-app testing remain device-dependent and are not claimed. No package/driver installation, OS permission prompt, real capture/render, key/trust/ACL alteration or live A/B deployment occurs during generated validation.

## Primary references (read2026-10-30)

- Windows interop/stream relay: https://wsl.dev/technical-documentation/boot-process/ and https://wsl.dev/technical-documentation/wsl.exe/ . Byte preservation is verified against the actual bridge, not assumed from text examples.
- Windows pipe client PID: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid .
- Raw binary standard input: https://learn.microsoft.com/en-us/dotnet/api/system.console.openstandardinput .

No third-party implementation code is copied. Native Linux/macOS audio/microphone/clipboard/multi-monitor/GPU and signed Windows deployments/recovery states remain separate remaining work.
