# B3b/C scoped source replies and expansion

Native notification rows preserve their draft while unrelated state updates arrive. Buttons pin notice UUID and source metadata in main, then the server verifies key/agent/workspace/tab/project again inside the existing final queued agent input guard. Explicit confirmation keys are Enter/Esc/y/n; blocked free text requires the existing terminal/ask-form expansion. Uncertain sends are not replayed. Opening a source checks the original live/visible bubble epoch after its asynchronous lookup.

Targeted ordinary Soda panels reuse existing terminal, exactly-once ask forms and isolated plugin display handling. Static input guard is installed before mount/connect/input controllers, holds inert until original binding verification, reads replaced store Maps and checks again synchronously for every input. Closed/moved/replaced targets block the panel; normal login is an explicit separate choice. Panel load failures are caught and older failed navigations cannot overwrite newer ones.

Generated verification: in-memory source/queue tests, browser-DOM input fences, native mock hide/late lookup, navigation failure/recovery, and400x640 bubble keyboard source reply/open/draft preservation. No real agent/PTY/window/input/OS capture. Initial wrong Vitest project/filter selected no tests; reran the correct three-package paths. Initial native assertion expected the unnormalized origin; updated for URL.href trailing slash.

Independent taskcheck found pre-verification input, seen done-event reuse, late source-open after hidden bubble, and replacement workspace reference mistakes; corrected each with regressions. Whole review found reused-panel unhandled loadURL rejection; caught through generation-aware loading and added a native regression. Final review receipt follows.

Four valid negative controls follow. Each source was restored byte-for-byte in finally. Initial hidden-open control removed the wrong earlier visibility clause and passed, so it is not counted; targeted the post-await guard and reran to the intended rejected-promise assertion failure.

## soda-assistant-b3-negative-hidden-open

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (10 tests | 1 failed | 9 skipped) 759ms
   × does not open a source panel after its original bubble is hidden 69ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > does not open a source panel after its original bubble is hidden
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/main.test.ts:602:34
    600|     { noticeId: notice.id },
    601|   );
    602|   const rejected = expect(opened).rejects.toThrow("対象");
       |                                  ^
    603|   bubble.hide();
    604|   const count = fixture.windows.length;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 9 skipped (10)
   Start at  14:32:42
   Duration  901ms (tests 92%, transform 6%, import 1%)
```

## soda-assistant-b3-negative-input

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts (1 test | 1 failed) 13ms
   × blocks before connection, re-reads replaced maps and synchronously fences stale input 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts > blocks before connection, re-reads replaced maps and synchronously fences stale input
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/actions/assistantPanelGuard.test.ts:46:33
     44|   const late = new KeyboardEvent("keydown", { key: "y", bubbles: true,…
     45|   document.getElementById("terminal")!.dispatchEvent(late);
     46|   expect(late.defaultPrevented).toBe(true);
       |                                 ^
     47|   expect((document.getElementById("app") as HTMLElement).inert).toBe(t…
     48|   update.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  14:32:01
   Duration  748ms (transform 57%, environment 24%, import 16%, tests 2%)
```

## soda-assistant-b3-negative-seen

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/assistant/SourceTarget.test.ts (6 tests | 1 failed | 5 skipped) 6ms
   × expires done notifications when seen or zero sequence even before queued input 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/SourceTarget.test.ts > expires done notifications when seen or zero sequence even before queued input
AssertionError: expected [Function] to throw an error
 ❯ src/assistant/SourceTarget.test.ts:116:27
    114|   const t = sourceTarget(f.deps, f.source, key);
    115|   f.pane.agent.serverSeenSeq = 1;
    116|   expect(() => t.guard()).toThrow();
       |                           ^
    117|   f.pane.agent.serverSeenSeq = 0;
    118|   f.pane.agent.completionSeq = 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  14:31:59
   Duration  1.13s (transform 82%, import 17%, tests 1%)
```

## soda-assistant-b3-negative-workspace

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/assistant/SourceTarget.test.ts (6 tests | 1 failed | 5 skipped) 7ms
   × rejects a replacement workspace object with the same UUID and a new project 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/SourceTarget.test.ts > rejects a replacement workspace object with the same UUID and a new project
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/assistant/SourceTarget.test.ts:130:179
    128|
    129| it("rejects a replacement workspace object with the same UUID and a ne…
    130|  const f=fixture();const target=sourceTarget(f.deps,f.source,f.key);f.…
       |                                                                                                                                                                                   ^
    131| });
    132|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  14:31:57
   Duration  1.13s (transform 82%, import 17%, tests 1%)
```

Final related check:19 files /124 tests PASS. Bubble generated UI PASS. Independent whole/correction reviewer confirmed final loadPanel correction and records; no additional must/should.
