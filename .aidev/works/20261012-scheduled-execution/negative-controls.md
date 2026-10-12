# 修正前に戻した対照実験

## dock

```text

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts (2 tests | 1 failed | 1 skipped) 1080ms
   × restores docked file views beside the terminal, applies placement updates and routes panel input without PTY leakage 1079ms

 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  11:01:37
   Duration  2.89s (transform 51%, tests 39%, import 11%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > restores docked file views beside the terminal, applies placement updates and routes panel input without PTY leakage
AssertionError: expected ' 端末 グラフ 状況 予約   │ t1   +             …' to contain 'README.md'

- Expected
+ Received

- README.md
+  端末 グラフ 状況 予約   │ t1   +                                                              [ビュー＋] session: work
+  ▾ Spaces     開いた順   │┌─ pane p1 ───────────────────────────────────────────────────────────────────[+][│][─][□][×]┐
+      w1                  ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+                          ││                                                                                            │
+  ＋新規 ⋯           🔔0  ││                                                                                            │
+                        « │└────────────────────────────────────────────────────────────────────────────────────────────⋯

 ❯ src/app/TuiApp.dockedViews.test.ts:40:30
     38|   await vi.waitFor(async () => {
     39|     h.app.renderNow();
     40|     expect(await h.screen()).toContain("README.md");
       |                              ^
     41|   });
     42|   expect(h.app.ui.dialogContext).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## focus

```text

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/extensions/ExtensionHost.test.ts (43 tests | 1 failed | 42 skipped) 1988ms
   × refreshes extension pane snapshots on actual session focus events 1987ms

 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  11:01:41
   Duration  2.89s (tests 72%, transform 23%, import 5%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/extensions/ExtensionHost.test.ts > refreshes extension pane snapshots on actual session focus events
Error: until: 条件が成り立ちませんでした
 ❯ Object.until src/extensions/hostHarness.ts:229:13
    227|         await settleIo();
    228|       }
    229|       throw new Error("until: 条件が成り立ちませんでした");
       |             ^
    230|     },
    231|     async run<T>(p: Promise<T>): Promise<T> {
 ❯ src/extensions/ExtensionHost.test.ts:729:2

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## agent-abort

```text

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/surface/methods/agent.test.ts (27 tests | 1 failed | 26 skipped) 10ms
   × an internal cancelled scheduled prompt waiting in the modal queue never writes 9ms

 Test Files  1 failed (1)
      Tests  1 failed | 26 skipped (27)
   Start at  11:01:45
   Duration  1.21s (transform 82%, import 17%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > an internal cancelled scheduled prompt waiting in the modal queue never writes
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/surface/methods/agent.test.ts:289:53
    287|  s.host.writeModal.mockImplementationOnce(async input=>{await new Prom…
    288|  const pending=s.surface.invoke({...s.ctx,signal:abort.signal},'agent.…
    289|  abort.abort();release();expect((await pending).ok).toBe(false);expect…
       |                                                     ^
    290| });
    291|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## shutdown

```text

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/schedule/Scheduler.test.ts (6 tests | 1 failed | 5 skipped) 24ms
   × does not launch an execution when close overlaps durable claim 23ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  11:01:47
   Duration  544ms (transform 71%, import 23%, tests 5%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/schedule/Scheduler.test.ts > does not launch an execution when close overlaps durable claim
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "action": Object {
          "command": "printf ok",
          "type": "command",
          "workspaceId": "w1",
        },
        "enabled": true,
        "id": "303ec861-9c75-4928-8871-a274d2ed19c0",
        "label": "test",
        "nextRunAt": "2026-10-12T02:01:47.674Z",
        "timeoutSeconds": 600,
        "trigger": Object {
          "at": "2026-10-12T02:01:47.674Z",
          "type": "once",
        },
        "updatedAt": "2026-10-12T02:01:47.678Z",
      },
      AbortSignal {
        Symbol(kEvents): Map {},
        Symbol(events.maxEventTargetListeners): 0,
        Symbol(events.maxEventTargetListenersWarned): false,
        Symbol(kHandlers): Map {},
        Symbol(kAborted): true,
        Symbol(kReason): [AbortError: This operation was aborted],
        Symbol(kComposite): false,
      },
    ]


Number of calls: 1

 ❯ src/schedule/Scheduler.test.ts:101:23
     99|   release();
    100|   await Promise.all([run, close]);
    101|   expect(execute).not.toHaveBeenCalled();
       |                       ^
    102|   expect(s.list().runs[0]?.status).toBe("interrupted");
    103| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

