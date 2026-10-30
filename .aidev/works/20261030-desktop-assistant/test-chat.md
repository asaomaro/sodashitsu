# B3a dedicated native bubble verification

Generated native adapters/memory RPC only, no actual Electron GUI, production Soda connection, PTY/agent/model, microphone, screen, clipboard or OS setting changes. main integration mocks AssistantRpc before importing main. Device identity tests write only fresh temporary directories. Source B2 full build/types/12,824 tests already passed; this phase changes only the desktop-assistant package and docs, so verification is scoped to that package and related generated UI/Windows packaging.

## Negative controls

Ten temporary source/assets ablations failed the corresponding assertions. Each source file was restored byte-for-byte in finally. Vitest reads source and verify-ui reads assets directly; no compiled output was produced from mutated source. Full raw failures follow.

### initial-control

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (6 tests | 1 failed | 5 skipped) 645ms
   × keeps the newly enabled control connection running and reaches scoped session discovery 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > keeps the newly enabled control connection running and reaches scoped session discovery
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/main.test.ts:322:28
    320|   const control = fixture.controls.at(-1)!;
    321|   expect(control.start).toHaveBeenCalledOnce();
    322|   expect(control.stop).not.toHaveBeenCalled();
       |                            ^
    323|   control.options.status(true);
    324|   await vi.waitFor(() =>

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:47
   Duration  777ms (tests 93%, transform 5%, import 2%)
```

### revision

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.test.ts (6 tests | 1 failed | 5 skipped) 61ms
   × sends only to the main-owned device and currently displayed instance; rejects stale or arbitrary pane claims 60ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.test.ts > sends only to the main-owned device and currently displayed instance; rejects stale or arbitrary pane claims
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/assistantChat.test.ts:100:5
     98|   expect(() =>
     99|     f.chat.send({ revision: revision - 1, instanceId: f.ready.agent!.i…
    100|   ).toThrow("状態が変わり");
       |     ^
    101|   expect(() => f.chat.send({ revision, instanceId: randomUUID(), text:…
    102|   await f.chat.send({ revision, instanceId: f.ready.agent!.instanceId,…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:49
   Duration  671ms (transform 68%, import 21%, tests 11%)
```

### actor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.test.ts (6 tests | 1 failed | 5 skipped) 59ms
   × sends only to the main-owned device and currently displayed instance; rejects stale or arbitrary pane claims 58ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.test.ts > sends only to the main-owned device and currently displayed instance; rejects stale or arbitrary pane claims
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/assistantChat.test.ts:101:90
     99|     f.chat.send({ revision: revision - 1, instanceId: f.ready.agent!.i…
    100|   ).toThrow("状態が変わり");
    101|   expect(() => f.chat.send({ revision, instanceId: randomUUID(), text:…
       |                                                                                          ^
    102|   await f.chat.send({ revision, instanceId: f.ready.agent!.instanceId,…
    103|   expect(f.request).toHaveBeenCalledWith("assistant.prompt", {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:50
   Duration  686ms (transform 70%, import 20%, tests 10%)
```

### read-fence

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.test.ts (6 tests | 1 failed | 5 skipped) 109ms
   × discards old conversation output when the scoped actor changes during the read 108ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.test.ts > discards old conversation output when the scoped actor changes during the read
AssertionError: expected [ { id: 'old', …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": "old",
+     "role": "assistant",
+     "text": "old actor",
+   },
+ ]

 ❯ src/assistantChat.test.ts:167:38
    165|     expect(f.chat.snapshot().session?.agent?.instanceId).toBe(next.age…
    166|   );
    167|   expect(f.chat.snapshot().messages).toEqual([]);
       |                                      ^
    168| });
    169| it("keeps literal bounded conversation bubbles and resumes at the last…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:51
   Duration  685ms (transform 60%, import 22%, tests 18%)
```

### cursor

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/assistantChat.test.ts (6 tests | 1 failed | 5 skipped) 60ms
   × restarts at offset zero when a live actor clears its conversation 59ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantChat.test.ts > restarts at offset zero when a live actor clears its conversation
AssertionError: expected [ { …(3) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": "98ed5f2c-8f64-476e-a3bb-e4f0e8d85ec2",
+     "role": "assistant",
+     "text": "generated",
+   },
+ ]

 ❯ src/assistantChat.test.ts:208:38
    206|   sessionId = randomUUID();
    207|   await f.chat.refresh();
    208|   expect(f.chat.snapshot().messages).toEqual([]);
       |                                      ^
    209|   await f.chat.refresh();
    210|   expect(f.request).toHaveBeenLastCalledWith("assistant.get", { device…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:53
   Duration  774ms (transform 68%, import 23%, tests 9%, worker 1%)
```

### rpc-late

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/assistantRpc.test.ts (6 tests | 1 failed | 5 skipped) 25ms
   × rejects a late response by monotonic time even if its timeout callback is late 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantRpc.test.ts > rejects a late response by monotonic time even if its timeout callback is late
AssertionError: promise resolved "null" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
null

 ❯ src/assistantRpc.test.ts:108:36
    106|   f.ready();
    107|   const pending = f.rpc.request("assistant.get", { deviceId: randomUUI…
    108|   const rejection = expect(pending).rejects.toThrow("応答が遅れ");
       |                                    ^
    109|   f.now(20_001);
    110|   f.socket!.message({ id: f.socket!.sent.at(-1).id, result: null });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:54
   Duration  701ms (transform 69%, import 27%, tests 4%)
```

### hello-parse

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/assistantRpc.test.ts (6 tests | 1 failed | 5 skipped) 9ms
   × does not publish connected if reading the hello message exhausts the handshake budget 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/assistantRpc.test.ts > does not publish connected if reading the hello message exhausts the handshake budget
AssertionError: expected "vi.fn()" to not be called with arguments: [ true ]

Received:

  1st vi.fn() call:

Compared values have no visual difference.

  2nd vi.fn() call:

  [
-   true,
+   false,
  ]


Number of calls: 2

 ❯ src/assistantRpc.test.ts:148:24
    146|   bytes.toString = () => { f.now(10_001); return value; };
    147|   f.socket!.handlers.get("message")?.(bytes,false);
    148|   expect(f.status).not.toHaveBeenCalledWith(true);
       |                        ^
    149|   expect(f.socket!.terminate).toHaveBeenCalledOnce();
    150| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:55
   Duration  628ms (transform 74%, import 24%, tests 2%)
```

### role

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-chat

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (6 tests | 1 failed | 5 skipped) 645ms
   × keeps the newly enabled control connection running and reaches scoped session discovery 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > keeps the newly enabled control connection running and reaches scoped session discovery
AssertionError: promise resolved "{ revision: 2, connected: true, …(5) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "busy": false,
+   "connected": true,
+   "hint": "使うエージェントを選び、専用セッションを開始してください。",
+   "kinds": [
+     {
+       "available": true,
+       "kind": "codex",
+       "label": "Codex",
+     },
+   ],
+   "messages": [],
+   "revision": 2,
+   "session": null,
  }

 ❯ src/main.test.ts:336:71
    334|     connected: true,
    335|   });
    336|   await expect(fixture.handlers.get("assistant:conversation")!(event))…
       |                                                                       ^
    337|   await fixture.handlers.get("assistant:save")!(event, { enabled: fals…
    338| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:40:56
   Duration  778ms (tests 92%, transform 5%, import 2%)
```

### ui-revision

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-desktop-assistant-chat/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toBeEnabled() failed

Locator:  locator('#send')
Expected: enabled
Received: disabled
Timeout:  5000ms

Call log:
  - Expect "toBeEnabled" locator('#send') with timeout 5000ms
  - waiting for locator('#send')
    14 × locator resolved to <button disabled id="send">送信</button>
       - unexpected value "disabled"

    at captureRawStack (/workspaces/sodashitsu-desktop-assistant-chat/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-desktop-assistant-chat/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toBeEnabled (/workspaces/sodashitsu-desktop-assistant-chat/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-desktop-assistant-chat/packages/desktop-assistant/scripts/verify-ui.mjs:157:39 {
  matcherResult: {
    message: 'expect(locator).toBeEnabled() failed\n' +
      '\n' +
      "Locator:  locator('#send')\n" +
      'Expected: enabled\n' +
      'Received: disabled\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toBeEnabled" locator('#send') with timeout 5000ms\n` +
      "  - waiting for locator('#send')\n" +
      '    14 × locator resolved to <button disabled id="send">送信</button>\n' +
      '       - unexpected value "disabled"\n',
    pass: false,
    actual: 'disabled',
    name: 'toBeEnabled',
    expected: 'enabled',
    log: [
      `  - Expect "toBeEnabled" locator('#send') with timeout 5000ms`,
      "  - waiting for locator('#send')",
      '    14 × locator resolved to <button disabled id="send">送信</button>',
      '       - unexpected value "disabled"'
    ],
    timeout: 5000,
    ariaSnapshot: '- button "送信" [disabled]'
  }
}

Node.js v24.15.0
/workspaces/sodashitsu-desktop-assistant-chat/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
```

### ui-literal

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-desktop-assistant-chat/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toHaveText(expected) failed

Locator:  locator('.chat-message')
Expected: "<img src=x onerror=alert(1)>こんにちは。"
Received: "こんにちは。"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" locator('.chat-message') with timeout 5000ms
  - waiting for locator('.chat-message')
    14 × locator resolved to <p class="spoken chat-message assistant">…</p>
       - unexpected value "こんにちは。"

    at captureRawStack (/workspaces/sodashitsu-desktop-assistant-chat/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-desktop-assistant-chat/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toHaveText (/workspaces/sodashitsu-desktop-assistant-chat/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-desktop-assistant-chat/packages/desktop-assistant/scripts/verify-ui.mjs:150:47 {
  matcherResult: {
    name: 'toHaveText',
    expected: '<img src=x onerror=alert(1)>こんにちは。',
    message: 'expect(locator).toHaveText(expected) failed\n' +
      '\n' +
      "Locator:  locator('.chat-message')\n" +
      'Expected: "<img src=x onerror=alert(1)>こんにちは。"\n' +
      'Received: "こんにちは。"\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toHaveText" locator('.chat-message') with timeout 5000ms\n` +
      "  - waiting for locator('.chat-message')\n" +
      '    14 × locator resolved to <p class="spoken chat-message assistant">…</p>\n' +
      '       - unexpected value "こんにちは。"\n',
    pass: false,
    actual: 'こんにちは。',
    log: [
      `  - Expect "toHaveText" locator('.chat-message') with timeout 5000ms`,
      "  - waiting for locator('.chat-message')",
      '    14 × locator resolved to <p class="spoken chat-message assistant">…</p>',
      '       - unexpected value "こんにちは。"'
    ],
    timeout: 5000,
    ariaSnapshot: '- paragraph:\n  - img\n  - text: こんにちは。'
  }
}

Node.js v24.15.0
/workspaces/sodashitsu-desktop-assistant-chat/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
```

## Restored-source verification

- Package build and typecheck: exit0.
- `pnpm exec vitest run --project @sodashitsu/desktop-assistant`:9 files /56 tests passed,1.80s.
- Generated headless keyboard UI: exit0. Start, scoped actor send, literal HTML-like conversation text, stale state refusal and explicit adoption all verified.
- `pack:win`: exit0; unsigned x64 development zip generated. ASAR main/preload/chat/RPC/identity/bubble files byte-equal current dist/assets; ws/zod/protocol dependencies present.
- No actual Windows desktop/real agent/model/login/OS trust/media was exercised. Claude/Codex conversation record decoding is tested with generated records, not real model inference. Exact-notice replies/targeted terminal/forms, OCR/transcription/standard tools and plugins remain subsequent tasks.

Logs: `/tmp/soda-assistant-chat-build.log`, `-types.log`, `-tests.log`, `-ui.log`, `-pack.log`. B2 source full-suite results are in test-session.md; unchanged browser smoke visibility limitation remains.
