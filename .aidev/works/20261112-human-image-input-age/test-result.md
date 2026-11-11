# Human input image age

## Change

Remove generic human SNAPSHOT image-age rejection in Relay (5s) and Provider (2s), uniformly across backends and media presence. Native draw/media-specific freshness remains. Existing input control/ownership/source epoch, frame and input sequence bounds, heartbeat, native delivery TTL (+500ms), private marker parsing, and agent observation/input protections remain unchanged. No timer/state/backend exemption added.

Regression: actual Relay + Provider WebSocket path delivers human input after 3000ms and 6200ms with no new image and live heartbeats; pending image remains bounded at one. Checks also cover duplicate/out-of-range/control-off input rejection and helper delivery expiry. Existing policy tests now allow human old-image input and expired idle notices; native draw rejection and agent old-image rejection remain tested.

## Focused final checks

Command: `pnpm exec vitest run --config /tmp/human-age-vitest.config.mjs packages/server/src/desktop/DesktopRelay.test.ts -t 'delivers human JPEG|still rejects an agent observation|keeps native draw freshness|quiet Linux human|browser-forged private|dropped/parent ACKs|cursor packets advance|fresh .* control across browser'`

The isolated config contains only `export default { test: { include: ["packages/server/src/desktop/DesktopRelay.test.ts"] } };`. Default workspace setup encountered missing `@vitejs/plugin-vue` in shared node_modules; no dependency installation was performed. Full checks and independent review are delegated to integration.

```text

 RUN  v5.0.1 /workspaces/sodashitsu-human-image-input-age


 Test Files  1 passed (1)
      Tests  12 passed | 335 skipped (347)
   Start at  08:51:10
   Duration  14.49s (tests 86%, transform 11%, import 3%)

```

## Negative control

Only both runtime source files restored temporarily to `c9f3f394`; current regression tests unchanged. Command uses the same config and `-t 'delivers human JPEG'`. Exit 1, both expected input acknowledgements absent:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-human-image-input-age

 ❯ packages/server/src/desktop/DesktopRelay.test.ts (347 tests | 2 failed | 345 skipped) 11524ms
   × delivers human JPEG input after 3000ms without a new image while heartbeat stays alive 4200ms
   × delivers human JPEG input after 6200ms without a new image while heartbeat stays alive 7320ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/server/src/desktop/DesktopRelay.test.ts > delivers human JPEG input after 3000ms without a new image while heartbeat stays alive
 FAIL  packages/server/src/desktop/DesktopRelay.test.ts > delivers human JPEG input after 6200ms without a new image while heartbeat stays alive
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ packages/server/src/desktop/DesktopRelay.test.ts:228:77
    226|  expect(v.frames).toHaveLength(1);expect(share.pending).toBe(decodeDes…
    227|  const before=Date.now();v.send({type:"input",seq:1,frameSeq:decodeDes…
    228|  await expect.poll(()=>v.messages.some(m=>m.type==="input_ack"&&m.seq=…
       |                                                                             ^
    229|  const sent=writes.mock.calls.map(([value])=>JSON.parse(String(value))…
    230|  expect(sent).toHaveLength(1);expect(sent[0].expiresAt).toBeGreaterTha…

Caused by: Error: Matcher did not succeed in time.
 ❯ packages/server/src/desktop/DesktopRelay.test.ts:228:2

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 345 skipped (347)
   Start at  08:51:34
   Duration  13.35s (tests 87%, transform 10%, import 2%)

```

Both changed runtime files restored byte-for-byte in a finally block:

```json
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

Restored final source rerun (same two regressions), exit 0:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-human-image-input-age


 Test Files  1 passed (1)
      Tests  2 passed | 345 skipped (347)
   Start at  08:51:59
   Duration  11.53s (tests 86%, transform 11%, import 3%)

```

`git diff --check`: passed.
