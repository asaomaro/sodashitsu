# Regional verification checks

## Source negative controls

### CLI region forwarding

Mutation: `...(m.region === undefined ? {} : { region: m.region }),` -> ``. Exit 1.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-region

 ❯ |@sodashitsu/cli| src/commands/desktopRegion.test.ts (1 test | 1 failed) 269ms
   × JSON-lines CLI forwards explicit regional verification without full-image fallback 268ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/commands/desktopRegion.test.ts > JSON-lines CLI forwards explicit regional verification without full-image fallback
AssertionError: expected { …(2) } to deeply equal { …(3) }

- Expected
+ Received

  {
    "afterFrameSeq": 4,
    "leaseId": "lllllllllllllllllllllllllllllllllllllllllll",
-   "region": {
-     "height": 4,
-     "width": 4,
-     "x": 2,
-     "y": 2,
-   },
  }

 ❯ src/commands/desktopRegion.test.ts:27:71
     25|   const region={x:2,y:2,width:4,height:4};child.stdin.write(JSON.strin…
     26|   await vi.waitFor(()=>expect(requests.some(r=>r.method==="desktop.age…
     27|   expect(requests.find(r=>r.method==="desktop.agent.observe").params).…
       |                                                                       ^
     28|   child.stdin.end(JSON.stringify({id:2,method:"release"})+"\n");await …
     29|   expect(child.exitCode,stderr).toBe(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  20:16:49
   Duration  394ms (tests 84%, import 8%, transform 8%, worker 1%)


```

### Reject ROI pixel changes

Mutation: `!proof||proof.digest!==observed.digest` -> `!proof`. Exit 1.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-region

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentAccess.test.ts (18 tests | 1 failed | 17 skipped) 12ms
   × rejects changed under regional verification without sending input 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentAccess.test.ts > rejects changed under regional verification without sending input
AssertionError: promise resolved "{ acknowledged: 1, afterFrameSeq: 2 }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "acknowledged": 1,
+   "afterFrameSeq": 2,
  }

 ❯ src/desktop/DesktopAgentAccess.test.ts:188:68
    186|  if(failure==="missing")f.setCurrent({regions:[]});
    187|  const inputs:Parameters<typeof f.api.act>[3]=failure==="key"?[key]:fa…
    188|  await expect(f.api.act("a",f.lease,observed.observationId,inputs)).re…
       |                                                                    ^
    189| });
    190| it("clears regional authority when reverting to whole-image observatio…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  20:16:52
   Duration  677ms (transform 75%, import 22%, tests 2%)


```

### Keep regional input bounded

Mutation: `if(inputs.some(input=>` -> `if(false&&inputs.some(input=>`. Exit 1.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-region

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentAccess.test.ts (18 tests | 1 failed | 17 skipped) 11ms
   × rejects outside under regional verification without sending input 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentAccess.test.ts > rejects outside under regional verification without sending input
AssertionError: promise resolved "{ acknowledged: 1, afterFrameSeq: 2 }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "acknowledged": 1,
+   "afterFrameSeq": 2,
  }

 ❯ src/desktop/DesktopAgentAccess.test.ts:188:68
    186|  if(failure==="missing")f.setCurrent({regions:[]});
    187|  const inputs:Parameters<typeof f.api.act>[3]=failure==="key"?[key]:fa…
    188|  await expect(f.api.act("a",f.lease,observed.observationId,inputs)).re…
       |                                                                    ^
    189| });
    190| it("clears regional authority when reverting to whole-image observatio…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  20:16:53
   Duration  655ms (transform 74%, import 24%, tests 2%)


```

### Shared proof nonce remapping

Mutation: `id:s.region.requested.id` -> `id:s.region.physical.id`. Exit 1.

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-region

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (49 tests | 1 failed | 48 skipped) 119ms
   × isolates regional proof IDs across members, coalesces configuration, and removes detached regions 118ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > isolates regional proof IDs across members, coalesces configuration, and removes detached regions
AssertionError: expected [ { x: +0, y: +0, width: 1, …(3) } ] to deeply equal [ { …(6) } ]

- Expected
+ Received

  [
    {
      "digest": "0000000000000000000000000000000000000000000000000000000000000000",
      "height": 1,
-     "id": "300f0b9f-f8fa-48d5-a27d-0495f2c0dcad",
+     "id": "6ede5d4d-5cd0-433b-9c7b-4a948cd7be3d",
      "width": 1,
      "x": 0,
      "y": 0,
    },
  ]

 ❯ src/desktop/DesktopSharedCapture.test.ts:334:42
    332|   f.child.send({...frame(2),info:{...frame(2).info,width:1,height:1,re…
    333|   await vi.waitFor(()=>expect(b.messages.at(-1)?.info?.seq).toBe(2));
    334|   expect(a.messages.at(-1).info.regions).toEqual([{...region,digest:"0…
       |                                          ^
    335|   expect(b.messages.at(-1).info.regions).toEqual([{...region,digest:"1…
    336|   a.session.stdin.end();await vi.waitFor(()=>expect(f.child.commands.f…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 48 skipped (49)
   Start at  20:16:54
   Duration  1.12s (transform 71%, import 18%, tests 11%)


```

## Final local checks

- `pnpm build`: PASS (all workspace production packages).
- `pnpm typecheck`: PASS (all workspace packages and scripts).
- `pnpm exec vitest run --maxWorkers=4`: PASS,894 files /12,975 tests,341.55s. Includes generated loopback Relay normal/shared and revoked snapshot/old nonce cases; actual built CLI child, MCP/private recipient/plugin forwarding; protocol bounds and existing full desktop regressions.
- Source negative control bytes restored exactly before final build/runtime. CLI negative rebuilt both mutated and restored dist.
- Independent whole/taskcheck and delta reviews: no remaining must; see review.md.
- Windows actual Host compilation + generated BGR runtime: awaiting exact-head CI, no desktop APIs in generated Main.
- No real-device or live agent/session/handoff testing performed. No OS services, drivers, trust or permissions changed.

Final runtime output:

```text
Test Files  894 passed (894)
Tests  12975 passed (12975)
Start at  20:18:55
Duration  341.55s (tests 82%, import 10%, environment 4%, transform 4%)
```
