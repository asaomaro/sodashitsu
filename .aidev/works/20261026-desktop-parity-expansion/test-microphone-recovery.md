# Bounded microphone encoder recovery verification

Historical baseline main9418cb11 (same product tree as66b9057c). The results below through the unit-negative excerpts were inherited from the preserved stability worktree; they are not a new verification receipt for the current main. Current integration base is e1af5a46 (PR321 merged); its receipts are appended separately below. WSL audio/mic PR308 is merged. Its source full12761 and browser17 passed; root initial16/17 and isolated1 passed. This slice does not identify or claim to fix every earlier intermittent encrypted microphone failure. Generated-only baseline diagnostic of current main passed1/8.2s; B finish stacks were intentional viewer stops. Unchanged baseline replay is not continued blindly.

No real audio device, screen/input/clipboard, driver/service/trust modification or live A/B handoff. Browser getUserMedia is replaced with a generated440Hz oscillator and a silent memory destination. The synthetic B sink validates decoded PCM RMS. No PCM or keys are logged.

## Historical targeted positives

-13 client tests: bounded two retries, no device/handshake replay, late encoder callback/error identity, original500ms ACK preserved, cancellation during close, expiry during close/configure before timer callback,100ms output freshness and fatal current codec error. Initial configure-after-clock boundary test accidentally allowed its1ms timer to run; negative control exposed that weak observation. Corrected to stop at the exact200ms callback boundary; now it fails when the post-configure check is removed.
-4 browser cases passed21.4s: actual WebCodecs after first encoder-only stall (plain/sealed), and finite termination after all encoders stall (plain/sealed). DOM running/unavailable, browser encoder creation/closure/permission counters, plain browser transmitted frames and B generated PCM RMS are observed. No fixed sleep substitutes readiness.
-E2E typecheck passed.

## Actual-source controls

Eight runtime assertion negatives: recovery disabled, retry limit removed, retired encoder error identity removed, original ACK expiry removed, ACK check after retired.close removed, post-configure ACK check removed,100ms sample freshness removed, and cancellation guard removed. Exact source bytes restored after every variant; restored13 tests passed.

Browser original-product control: builds main's actual old client source, runs forced-stall recover/plain and requires the real output assertion to fail; then restores exact bytes and rebuilds. Pending completion; no compile/global timeout result counts as proof.

Independent fragile taskcheck found a post-close/configure ACK-expiry gap. Corrected with deadline checks after native calls and at worklet/output/transmit/ACK boundaries. Correction review reports no remaining must/should. Final whole/correction review and frozen build/typecheck/full, root related/browser, clean startup, PR/CI/merge receipts follow.

## Raw unit-negative excerpts

### negative-ack-deadline

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > does not renew an earlier network ACK deadline when a later encoder stalls
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/microphoneClient.test.ts:48:367


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-configure-ack

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > checks ACK expiry after replacement configuration even without another callback or timer
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/microphoneClient.test.ts:69:285


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-freshness

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > still drops Opus output older than100ms without replay or terminating a healthy codec
AssertionError: expected [ [ { …(4) } ] ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/microphoneClient.test.ts:73:210


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-late-error

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > ignores late errors and matching timestamps from a retired encoder while sending only fresh replacement output
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/microphoneClient.test.ts:45:250


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-recovery

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > drops stalled Opus frames and recovers twice without reacquiring the device or replaying the handshake
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/microphoneClient.test.ts:39:41


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-reentrant-cancel

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > cannot recreate an encoder after a synchronous cancellation while retiring the stalled encoder
AssertionError: expected [ <Anonymous Class>{ …(6) }, …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/microphoneClient.test.ts:51:223


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-retire-ack

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > rechecks the original ACK deadline after retiring an encoder even before the timer runs
AssertionError: expected [ <Anonymous Class>{ …(6) }, …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/desktop/microphoneClient.test.ts:59:297


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### negative-retry-limit

```text
FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > drops stalled Opus frames and recovers twice without reacquiring the device or replaying the handshake
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/microphoneClient.test.ts:41:24


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Current integration on main e1af5a46

The tracked3-file diff and4 listed new recovery records/spec were applied selectively into a fresh worktree based on e1af5a46. Original dirty/root/stability worktrees were preserved. Product source is byte-identical to the reviewed recovery source from the prior stability worktree. Independent whole review and the added CI delta review found no additional must; neither reviewer edited source or ran real GUI/media/agents.

- Frozen full build PASS: `/tmp/soda-microphone-recovery-completion-build.log`.
- Current focused13 tests PASS, including restoration after original-source negative: `/tmp/soda-microphone-recovery-completion-focused.log`.
- Current actual HEAD microphoneClient source was substituted in isolation; the recovery test failed the intended runtime assertion (track stopped when recovery should continue). Source restored byte-for-byte in finally, SHA256 `d854417a2505684afdb187746e4cc6f0f50f0553a374e49546afe5f144b4471f`. This is a valid control, not a compile/timeout failure. Vitest reads source directly; no product build occurred during this ablation.
- Initial anchored E2E filename filter found no tests; corrected to the actual filename. This is not a product failure or accepted negative.
- Current local generated browser attempt did not reach the microphone start: after page.goto completed, machine-online visibility assertions stalled until the60s global test timeout. Two precondition failures, two remaining cases not run after interrupting only this owned test process. The trace contains no microphone start/output observation, so this run is neither a recovery success nor a valid microphone negative. A historical original-product browser control stalled in the same precondition; its earlier timeout is not accepted as proof either. No unchanged replay was continued. Current log: `/tmp/soda-microphone-recovery-completion-browser.log`.
- New scoped Ubuntu CI builds/types/runs the13 unit tests and four generated oscillator/memory-sink browser cases. No real devices, production Soda, actual agents, OS permissions, live A/B handoff or drivers are activated. Exact head CI receipts follow in the delivery PR; no local E2E pass is claimed.

### Current original-main negative (raw output)

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone-recovery-completion

 ❯ |@sodashitsu/web| src/desktop/microphoneClient.test.ts (13 tests | 1 failed | 12 skipped) 10ms
   × drops stalled Opus frames and recovers twice without reacquiring the device or replaying the handshake 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > drops stalled Opus frames and recovers twice without reacquiring the device or replaying the handshake
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/microphoneClient.test.ts:39:41


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
   Start at  18:19:58
   Duration  767ms (transform 60%, environment 22%, import 16%, tests 1%)


```

### Current frozen full verification

- Build PASS: `/tmp/soda-microphone-recovery-completion-build.log`.
- Typecheck PASS: `/tmp/soda-microphone-recovery-completion-types.log`.
- Runtime890 files /12,939 tests PASS,344.79s: `/tmp/soda-microphone-recovery-completion-all-tests.log` (`pnpm exec vitest run --maxWorkers=4`). Existing happy-dom resource diagnostics do not fail the suite.
- Product source was frozen after review/source-ablation restoration. No runtime behavior changed after these checks.
- Exact final source-head CI, clean-checkout browser startup and main delivery receipts belong to the final PR. Full-suite execution was not repeated in the original dirty root.
