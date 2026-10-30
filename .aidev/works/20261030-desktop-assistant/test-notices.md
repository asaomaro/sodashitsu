# B1 notice verification

Package build/typecheck PASS.41 tests/6 files PASS (1.39s), including17 earlier foundation tests and24 additional notice/auth/lifecycle tests. Generated headless keyboard UI PASS, with literal HTML text and stale revision rejection. Generated localhost WS confirms exact Origin/cookie and only client.hello/notification.state requests; generated TLS confirms no cookie delivery to an untrusted certificate and successful verified trust through an internal test adapter. Existing repository test-only PEM fixtures are used; no certificate installation or actual user endpoint/device/model is touched.

Source Windows x64 unsigned zip generated; ASAR main/backend/preload/bubble bytes equal build outputs, including ws/zod/workspace protocol. Native Windows desktop and OS CA integration still require separate real-device checks. A's whole-workspace result (12,777 pass/1 TUI timing failure) and source/main smoke limitation remain documented in test-result.md; these were not relabelled as all-green or repeated for the isolated native-package-only change. Windows generated CI for A PR309 succeeded; B1 CI is pending push.

Early fresh-worktree unit invocation preceded protocol build and failed import resolution; rerun occurred after build. After introducing a promise-finally cookie owner, three tests initially awaited only one microtask; they now wait for the actual socket/login precondition. Neither is treated as a product/negative-control assertion.

## Source negative controls

Seven isolated source ablations each fail at the intended assertion/expect; originals are restored byte-for-byte. Idle guard, current-event key, named-cookie selection, TLS verification, monotonic expiry, inbox revision and shared deferred state are covered. Final package41 tests and generated UI pass after the first six restorations; after the deferred control the full feed file9 tests passes again.

### idle-only

```text
FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > does not announce an old completion while working or unknown, and retires it on work restart
AssertionError: expected [ { …(7) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "at": 123,
+     "id": "d040f8fa-4bda-44ab-b83d-958b63aa2d35",
+     "key": "done:2ff23997-d0d9-48eb-a1a0-a9d7916a2d1d:1",
+     "kind": "done",
+     "message": "「操舵室 / worker」の作業が完了しました。",
+     "source": {
+       "agentInstanceId": "2ff23997-d0d9-48eb-a1a0-a9d7916a2d1d",
+       "machineId": "local",
+       "paneId": "8ea3b508-b8b8-41d8-94d9-51559dd81693",
+       "serverOrigin": "https://soda.test",
+       "workspaceId": "1e6850c7-9a45-4d85-93ef-d594540a80c8",
+     },
+     "title": "操舵室 / worker",
+   },
+ ]

 ❯ src/noticeFeed.test.ts:139:28
    137|     f.feed.snapshot(f.snapshot);
    138|     f.feed.shared({ notices: [] });
    139|     expect(f.feed.notices).toEqual([]);
       |                            ^
    140|   }
    141|   const f = fixture();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### event-key

```text
FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > expires an older event when the next completion or blocked state was already resolved
AssertionError: expected [ { …(7) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "at": 123,
+     "id": "44daeb91-6f2c-45fe-8daf-13a0255ca4f3",
+     "key": "done:2c07e8f6-9312-42ec-9651-f7a429923241:1",
+     "kind": "done",
+     "message": "「操舵室 / worker」の作業が完了しました。",
+     "source": {
+       "agentInstanceId": "2c07e8f6-9312-42ec-9651-f7a429923241",
+       "machineId": "local",
+       "paneId": "82e44d1f-055a-4b34-9196-3ec1f186a4af",
+       "serverOrigin": "https://soda.test",
+       "workspaceId": "e0e4245d-a438-4670-9c1d-e63f8fb0d3ac",
+     },
+     "title": "操舵室 / worker",
+   },
+ ]

 ❯ src/noticeFeed.test.ts:166:28
    164|     const key = attention ? `blocked:${f.ids.agent}:20` : `done:${f.id…
    165|     f.feed.shared({ notices: [{ paneId: f.ids.pane, key, status: "reso…
    166|     expect(f.feed.notices).toEqual([]);
       |                            ^
    167|   }
    168| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### named-cookie

```text
FAIL  |@sodashitsu/desktop-assistant| src/cookieHeader.test.ts > includes default and named sessions for the URL-filtered browser cookie scope only
AssertionError: expected 'soda_session=generated-default' to be 'soda_session=generated-default; soda_…' // Object.is equality

Expected: "soda_session=generated-default; soda_session_A.b-c_1=generated-named"
Received: "soda_session=generated-default"

 ❯ src/cookieHeader.test.ts:11:5
      9|       { name: "soda_session_other", value: "not-forwarded", path: "/ot…
     10|     ]),
     11|   ).toBe("soda_session=generated-default; soda_session_A.b-c_1=generat…
       |     ^
     12|   expect(sodaCookieHeader([])).toBeNull();
     13| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### tls-verification

```text
FAIL  |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts > validates TLS before sending cookies, using an internal generated trust adapter only
AssertionError: expected last "vi.fn()" call to have been called with [ 'offline' ]

- Expected
+ Received

  [
-   "offline",
+   "connected",
  ]

 ❯ src/noticeConnection.test.ts:241:45
    239|   try {
    240|     bad.start();
    241|     await vi.waitFor(() => expect(rejected).toHaveBeenLastCalledWith("…
       |                                             ^
    242|     bad.stop();
    243|     expect(cookies).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### absolute-deadline

```text
FAIL  |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts > rejects an expired shared reply or a callback crossing the original monotonic deadline
AssertionError: expected last "vi.fn()" call to have been called with [ 'offline' ]

- Expected
+ Received

  [
-   "offline",
+   "connected",
  ]

 ❯ src/noticeConnection.test.ts:292:22
    290|     } else ticks = 10_000;
    291|     f.socket.message({ id: "assistant-shared", result: { notices: [] }…
    292|     expect(f.status).toHaveBeenLastCalledWith("offline");
       |                      ^
    293|     expect(f.status).not.toHaveBeenCalledWith("connected");
    294|     expect(f.socket.terminate).toHaveBeenCalledOnce();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### revision

```text
Error: expect(locator).toContainText(expected) failed

Locator: locator('.notice')
Expected substring: "確認してください。"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('.notice') with timeout 5000ms
  - waiting for locator('.notice')

    at captureRawStack (/workspaces/sodashitsu-desktop-assistant-events/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-desktop-assistant-events/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toContainText (/workspaces/sodashitsu-desktop-assistant-events/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-desktop-assistant-events/packages/desktop-assistant/scripts/verify-ui.mjs:129:41 {
  matcherResult: {
    name: 'toContainText',
    expected: '確認してください。',
    message: 'expect(locator).toContainText(expected) failed\n' +
      '\n' +
      "Locator: locator('.notice')\n" +
      'Expected substring: "確認してください。"\n' +
      'Timeout: 5000ms\n' +
      'Error: element(s) not found\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toContainText" locator('.notice') with timeout 5000ms\n` +
      "  - waiting for locator('.notice')\n",
    pass: false,
    actual: undefined,
    log: [
      `  - Expect "toContainText" locator('.notice') with timeout 5000ms`,
      "  - waiting for locator('.notice')"
    ],
    timeout: 5000,
    ariaSnapshot: '- main:\n' +
      '  - img "船長"\n' +
      '  - strong: 船長\n' +
      '  - paragraph: 専用アシスタント\n' +
      '  - button "吹き出しを閉じる": ×\n' +
      '  - log:\n' +
      '    - paragraph: こんにちは。操舵室の船長です。\n' +
      '    - paragraph: エージェントへの接続は準備中です。今は操舵室から会話を開けます。\n' +
      '  - navigation "アシスタントの操作":\n' +
      '    - button "操舵室を開く"\n' +
      '    - button "設定"\n' +
      '  - text: 船長へのメッセージ\n' +
      '  - textbox "船長へのメッセージ" [disabled]:\n' +
      '    - /placeholder: 専用セッションに接続すると会話できます\n' +
      '  - button "送信" [disabled]\n' +
      '  - status: 操舵室との接続が切れました。再接続を待っています。'
  }
}

Node.js v24.15.0
```

### deferred

```text
FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > keeps a shared deferred notice in the inbox without automatically reopening it
AssertionError: expected last "vi.fn()" call to have been called with [ [ { …(7) } ], false ]

- Expected
+ Received

@@ -14,7 +14,7 @@
          "workspaceId": "9a5d7407-0466-48e8-9069-9c72efaba40c",
        },
        "title": "操舵室 / worker",
      },
    ],
-   false,
+   true,
  ]

 ❯ src/noticeFeed.test.ts:177:21
    175|   f.feed.shared({ notices: [{ paneId: f.ids.pane, key, status: "deferr…
    176|   expect(f.feed.notices).toHaveLength(1);
    177|   expect(f.changed).toHaveBeenLastCalledWith(f.feed.notices, false);
       |                     ^
    178|   f.feed.shared({ notices: [{ paneId: f.ids.pane, key, status: "resolv…
    179|   expect(f.feed.notices).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```
