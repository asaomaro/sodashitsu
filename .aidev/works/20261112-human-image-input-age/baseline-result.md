# Focused baseline comparison after integration failures

Current source `5fc282f0` and baseline runtime `c9f3f394` were each tested exactly once, using unchanged current test source and isolated existing Vitest config. Only DesktopProvider.ts and DesktopRelay.ts were temporarily restored to baseline; finally restored both byte-for-byte. No runtime/test edits made.

Selection: `refuses control when B is readonly and closes an unacknowledged share|discards main-lane idle notices overtaken by a newer image on its independent socket` in DesktopRelay.test.ts.

Both runs: readonly/unacknowledged test FAILS at 8s expecting CLOSED (3), actual OPEN (1); independent image lane test PASSES. Readonly closure expectation is preexisting: Relay and Provider watchdogs check heartbeat older than 12s/startup timeout, and no longer close on pending ACK image age. Independent-lane full-suite startup failure did not reproduce in isolation on current or baseline; no human input occurs before that assertion, so modified input age conditions are not executed on its failing setup path. This establishes a preexisting readonly failure and an unreproduced suite-context image-lane timeout, not a proven cause of the latter. No full-suite rerun.

## current-two-cases-1.log

```text

 RUN  v5.0.1 /workspaces/sodashitsu-human-image-input-age

 ❯ packages/server/src/desktop/DesktopRelay.test.ts (347 tests | 1 failed | 345 skipped) 8515ms
   × refuses control when B is readonly and closes an unacknowledged share 8194ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/desktop/DesktopRelay.test.ts > refuses control when B is readonly and closes an unacknowledged share
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ packages/server/src/desktop/DesktopRelay.test.ts:461:63
    459|   a.send({ type: "input", seq: 1, frameSeq: 1, input: { kind: "text", …
    460|   a.send({ type: "heartbeat" });
    461|   await expect.poll(() => a.ws.readyState, { timeout: 8000 }).toBe(Web…
       |                                                               ^
    462|   await expect(readFile(f.record, "utf8")).rejects.toThrow();
    463| }, 12000);

Caused by: Error: Matcher did not succeed in time.
 ❯ packages/server/src/desktop/DesktopRelay.test.ts:461:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 345 skipped (347)
   Start at  09:01:50
   Duration  10.59s (tests 82%, transform 15%, import 4%)

```

## baseline-two-cases-1.log

```text

 RUN  v5.0.1 /workspaces/sodashitsu-human-image-input-age

 ❯ packages/server/src/desktop/DesktopRelay.test.ts (347 tests | 1 failed | 345 skipped) 8531ms
   × refuses control when B is readonly and closes an unacknowledged share 8207ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/desktop/DesktopRelay.test.ts > refuses control when B is readonly and closes an unacknowledged share
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ packages/server/src/desktop/DesktopRelay.test.ts:461:63
    459|   a.send({ type: "input", seq: 1, frameSeq: 1, input: { kind: "text", …
    460|   a.send({ type: "heartbeat" });
    461|   await expect.poll(() => a.ws.readyState, { timeout: 8000 }).toBe(Web…
       |                                                               ^
    462|   await expect(readFile(f.record, "utf8")).rejects.toThrow();
    463| }, 12000);

Caused by: Error: Matcher did not succeed in time.
 ❯ packages/server/src/desktop/DesktopRelay.test.ts:461:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 345 skipped (347)
   Start at  09:02:02
   Duration  10.35s (tests 83%, transform 14%, import 3%)

```

## two-case-restore.json

```text
{
  "packages/server/src/desktop/DesktopProvider.ts": {
    "sha256": "2070baa1b61057c33adbcade82528ee00f83aa3f2d6d3e8d61f6f878c4d84fe5",
    "exactRestored": true
  },
  "packages/server/src/desktop/DesktopRelay.ts": {
    "sha256": "5853f2247df177566a4267053c28e4904d6d3f9c5b3ec567c8f1bc5c8f57ff47",
    "exactRestored": true
  }
}
```
