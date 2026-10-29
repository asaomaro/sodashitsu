# WSL audio/microphone verification

Generated memory only. This environment is WSL; user has no native Linux/macOS desktop available. No real audio endpoint, system audio, user microphone, driver/service/trust changes, OS input or live A/B handoff was performed.

- Fixed transport/builder/lifetime/codec/ownership and preparation-generation focused tests: 96 passed (9 files, 2.14s).
- Actual WSL → Windows generated named pipes: audio and microphone Windows PID verified using GetNamedPipeClientProcessId; binary 0..255 including NUL/CR/LF preserved across partial writes. Owner close verified by Windows server observing pipe EOF (separate from WSL child close). No audio device APIs.
- Transport independent taskcheck found timer-only deadline, unread PCM retention and authority callback reentry. Corrected with monotonic pre/post authority checks, descriptor-before-publication checks, unread drain/zero and write buffer retention through callback/actual child close. Correction review: no remaining must/should.
- Integration taskcheck: generation checks after compilation, first-viewer-independent shared source lifetime, retained Windows SID/PID validation, late descriptor cancellation. Corrected runtime reentry close-before-spawn. No remaining must at current review.

Actual-source negative controls (each exact source byte restored, runtime assertion failures; complete raw outputs in local .cache/wsl-audio/negative-*.log): nonce, startup-deadline, callback-recheck, pcm-erasure, runtime-retirement, audio-pid, microphone-pid, audio-cancel, microphone-cancel, provider-generation, owned-close. No compile errors or blanket timeouts count as negative proof.

Final build/force emit/typecheck, full suites, browser, Windows generated checks, independent final review, root reflection, clean startup and exact-head CI are pending. Final receipts belong in PR and follow-up delivery record.

## Negative outputs (raw excerpts)

### negative-audio-cancel

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopWslAudio.test.ts > never enables audio from a descriptor delivered after cancellation
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopWslAudio.test.ts:32:61


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-audio-pid

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopWslAudio.test.ts > enables native audio with the private Windows descriptor PID and encodes generated PCM
AssertionError: expected "vi.fn()" to be called with arguments: [ { type: 'native_audio', …(4) } ]

Received:

  1st vi.fn() call:

  [
    {
-     "clientPid": 4321,
      "enabled": true,
      "id": "22222222-2222-4222-8222-222222222222",
-     "pipeName": StringMatching /^SodaDesktopAudio-[a-f0-9]{32}$/,
+     "pipeName": "SodaDesktopAudio-1e465ac86fdc4bfc97cc1a109778e94a",
      "type": "native_audio",
    },
  ]


Number of calls: 1

 ❯ src/desktop/DesktopWslAudio.test.ts:20:74


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-callback-recheck

```text
FAIL  |@sodashitsu/client-core| src/desktop/DesktopAudioPipe.node.test.ts > rechecks the fixed deadline after the permission callback and before publishing PID
AssertionError: expected 4321 to be an instance of Error
 ❯ src/desktop/DesktopAudioPipe.node.test.ts:56:250


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopAudioPipe.node.test.ts > rechecks retirement after connect authorization before issuing the private connect command
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopAudioPipe.node.test.ts:59:330


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

### negative-microphone-cancel

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopWslAudio.test.ts > never enables microphone from a descriptor delivered after cancellation
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopWslAudio.test.ts:32:61


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-microphone-pid

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopWslAudio.test.ts > uses the Windows microphone client PID without changing viewer PCM or local ownership
AssertionError: expected "vi.fn()" to be called with arguments: [ { type: 'native_microphone', …(4) } ]

Received:

  1st vi.fn() call:

  [
    {
-     "clientPid": 4321,
      "enabled": true,
      "id": "22222222-2222-4222-8222-222222222222",
-     "pipeName": StringMatching /^SodaDesktopMicrophone-[a-f0-9]{32}$/,
+     "pipeName": "SodaDesktopMicrophone-5dea0d736f4544e18930fefc47dcc75d",
      "type": "native_microphone",
    },
  ]


Number of calls: 1

 ❯ src/desktop/DesktopWslAudio.test.ts:25:152


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-nonce

```text
FAIL  |@sodashitsu/client-core| src/desktop/DesktopAudioPipe.node.test.ts > rejects an unauthenticated or malformed descriptor {"nonce":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
AssertionError: expected 4321 to be an instance of Error
 ❯ src/desktop/DesktopAudioPipe.node.test.ts:24:84
     22| });
     23| it.each([{nonce:"b".repeat(64)},{pid:0},{pid:2147483648},{unexpected:t…
     24|  const f=fixture();f.child.stdout.write(f.descriptor(extra));expect(aw…
       |                                                                                    ^
     25| });
     26| it("bounds descriptor bytes and waits actual child close after cancell…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-owned-close

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopAudioPipes.test.ts > retains the owned binary until every actual native child closes
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopAudioPipes.test.ts:8:322


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-pcm-erasure

```text
FAIL  |@sodashitsu/client-core| src/desktop/DesktopAudioPipe.node.test.ts > erases unread PCM on cancellation and rejects late bytes without publishing them
AssertionError: expected Buffer[ 103, 101, 110, 101, 114, …(-83) ] to be null // Object.is equality

- Expected:
null

+ Received:
Buffer [
  103,
  101,
  110,
  101,
  114,
  97,
  116,
  101,
  100,
  45,
  112,
  99,
  109,
]

 ❯ src/desktop/DesktopAudioPipe.node.test.ts:53:281


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-provider-generation

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopProvider.audio.test.ts > checks share lifetime after WSL preparation: generation
AssertionError: promise rejected "Error: generated spawn boundary" instead of resolving
 ❯ src/desktop/DesktopProvider.audio.test.ts:11:229


Caused by: Error: generated spawn boundary
 ❯ src/desktop/DesktopProvider.audio.test.ts:2:49
 ❯ spawnHelper src/desktop/DesktopProvider.ts:663:174
 ❯ DesktopProvider.launch src/desktop/DesktopProvider.ts:672:116

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-runtime-retirement

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopAudioPipes.test.ts > rechecks shutdown after permission callbacks before spawning
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopAudioPipes.test.ts:10:252


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-startup-deadline

```text
FAIL  |@sodashitsu/client-core| src/desktop/DesktopAudioPipe.node.test.ts > checks the monotonic startup deadline before publishing a late descriptor even before timer execution
AssertionError: expected 4321 to be an instance of Error
 ❯ src/desktop/DesktopAudioPipe.node.test.ts:47:112
     45|
     46| it("checks the monotonic startup deadline before publishing a late des…
     47|  let at=100;const f=fixture("audio",()=>at);at=2600;f.child.stdout.wri…
       |                                                                                                                ^
     48|  const g=fixture("audio",()=>at);g.child.stdout.write(g.descriptor());…
     49| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Initial broad-check findings and correction

Initial source whole suite: 861 files/12,760 tests passed; one existing DesktopRelay physical-helper-budget assertion failed with one unhandled rejection because private launch had changed from synchronous throw to async rejection. Corrected by keeping synchronous launch and adding separate async prepareLaunch; the public WS request awaits preparation/launch and rechecks live scope before started. Correction independent review: no must/should. Corrected Provider + entire Relay targeted suite: 231 passed. Final whole checks rerun after this material change.

Initial source browser: 16 passed, encrypted shared microphone failed (90s stop-button wait); targeted repeat failed at line152 because first microphone became unavailable after second viewer start. Actual change-before main90c5b41b in clean worktree passed the same isolated case (1 passed,9.5s). Initial source failures overlapped full-suite/clean-build load; no baseline defect or guaranteed timing cause is claimed. Corrected version is reverified without concurrent whole-suite/build load. No blanket timeout counts as negative proof.

## Frozen corrected product receipts

Product a7ac0b34b764a104bfd6b6a256a42b0dfa243555:

- Source build, forced server/dependency emit and typecheck passed. Whole suite: 862 files / 12,761 tests passed, 382.69s, no unhandled errors. Initial failure above is resolved.
- Root build, forced emit and typecheck passed. Related changed-scope tests: 10 files / 328 tests passed, 80.98s. Per repository guidance the complete source suite is not duplicated in root; root receives the source results plus integration checks and browser checks.
- Source browser: all 17 selected audio/microphone/shared/takeover/agent cases passed in1.6m after whole/build processes finished. This includes encrypted shared Opus microphone. Initial failures under overlap remain recorded; the exact timing cause is not established. No production timeout or assertion was weakened.
- Exact product CI: Windows identity/bridge run40960571902 passed; protected boundaries/upgrade/maintenance run40960571838 all passed.
- Clean detached product worktree build and smoke passed; git status empty. No live A/B handoff performed.
- Independent final fixed24 paths: commit/source/snapshot/root hashes match; docs normal three-way and Provider constructor normalization/replay preserve existing root allowLanHttp behavior. Whole and correction reviewers report no remaining must/should.

Root browser17 and final documentation-head CI/merge receipts will be recorded in PR #308. The final documentation change clarifies that fixed builders use process-scoped ExecutionPolicy Bypass, while normal capture helper launch follows Windows policy; system policy/trust are not changed. This describes the existing compiler launch behavior rather than changing it.
