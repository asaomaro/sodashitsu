# 第1段階 検証記録

事前局所試験: protocol6/server controller6/web controller4計16、Relay68、memory clipboard E2E8件通過。Windows fake IBoard/HTML/RTF/PNG→DIB生成画素検証、Host/Unlock/Audio/Rich全体ValidateOnly compile通過。実OS clipboard/input/captureは実行していない。最終pnpm build/typecheck成功。全体761 suites / 11465 tests成功（378.09秒）。復元後browser E2E8件成功（36.7秒）。別worktreeからbuild後pnpm smoke成功。sr-pcは作業treeを変更せずbranch archiveをTEMPでcombined compile/fakeチェック成功、HEAD2b26ba30とtracked cleanを維持。

各修正だけを外した負例で期待失敗後、元bytesに復元し一致をassert。ブラウザは負例build後に実行し最後に復元build。pipe-fallbackのreset/toggleには二重防御がありresetだけ除去では通過、両方を除去すると失敗した。通過を失敗扱いしない。以下は失敗時の生出力（Windows出力は元のCP932から文字コード変換のみ）。

## final-permission

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Cancellation during native preparation must prevent com
mit"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-rich-clipboard\scripts\remote-desktop\validate-rich-clipb
oard.ps1:5 文字:1
+ [SodaDesktopTests.RichClipboardChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## html-context

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Clipboard HTML offsets"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-rich-clipboard\scripts\remote-desktop\validate-rich-clipb
oard.ps1:5 文字:1
+ [SodaDesktopTests.RichClipboardChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidDataException
 
```

## rtf-binary

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "RTF internal NUL must survive"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-rich-clipboard\scripts\remote-desktop\validate-rich-clipb
oard.ps1:5 文字:1
+ [SodaDesktopTests.RichClipboardChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## decoded-chunk

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-rich-clipboard

 ❯ |@sodashitsu/protocol| src/desktopClipboard.test.ts (5 tests | 1 failed | 4 skipped) 7ms
   × rejects a padded base64 chunk whose decoded bytes exceed 16KiB 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktopClipboard.test.ts > rejects a padded base64 chunk whose decoded bytes exceed 16KiB
AssertionError: expected [Function] to throw an error
 ❯ src/desktopClipboard.test.ts:92:5
     90|       data,
     91|     }),
     92|   ).toThrow();
       |     ^
     93|   expect(() =>
     94|     DesktopRichClipboardResult.parse({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  12:43:56
   Duration  167ms (import 52%, transform 37%, tests 8%, worker 3%)

```

## local-input

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-rich-clipboard

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (68 tests | 1 failed | 67 skipped) 288ms
   × does not send a rich clipboard write to a helper whose local input ceiling is disabled 287ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > does not send a rich clipboard write to a helper whose local input ceiling is disabled
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:748:787


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 67 skipped (68)
   Start at  13:23:00
   Duration  1.25s (transform 59%, tests 25%, import 15%, worker 1%)

```

## native-write-ceiling

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Local input ceiling must reject rich clipboard write"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-rich-clipboard\scripts\remote-desktop\validate-rich-clipb
oard.ps1:5 文字:1
+ [SodaDesktopTests.RichClipboardChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## native-cancel

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Explicit cancel during native preparation must prevent 
commit"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-rich-clipboard\scripts\remote-desktop\validate-rich-clipb
oard.ps1:5 文字:1
+ [SodaDesktopTests.RichClipboardChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## native-cancel-overwrite

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Explicit cancel during native preparation must prevent 
commit"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-rich-clipboard\scripts\remote-desktop\validate-rich-clipb
oard.ps1:5 文字:1
+ [SodaDesktopTests.RichClipboardChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception
 
```

## idle

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-rich-clipboard

 ❯ |@sodashitsu/server| src/desktop/DesktopRichClipboard.test.ts (6 tests | 1 failed | 5 skipped) 11ms
   × retires an idle transaction even after the helper has replied, so a new ID can start 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRichClipboard.test.ts > retires an idle transaction even after the helper has replied, so a new ID can start
AssertionError: expected { …(7) } to be undefined

- Expected:
undefined

+ Received:
{
  "generation": 1,
  "id": "22222222-2222-4222-8222-222222222222",
  "last": 1792988586009,
  "offset": 0,
  "read": false,
  "size": 3,
  "started": 1792988586009,
}

 ❯ src/desktop/DesktopRichClipboard.test.ts:120:42
    118|     f.result("begin", { size: 3 });
    119|     await vi.advanceTimersByTimeAsync(5001);
    120|     expect((f.clipboard as any).current).toBeUndefined();
       |                                          ^
    121|     const next = "33333333-3333-4333-8333-333333333333";
    122|     f.clipboard.fromViewer({ type: "clipboard_rich", id: next, operati…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  13:23:05
   Duration  806ms (transform 80%, import 19%, tests 2%)

```

## auto-stop

```text

Running 1 test using 1 worker

(node:1644241) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T04:24:34.652Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:24:34.652Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:24:34.652Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:24:34.657Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-nXqdLi/commands.json","count":0}
{"ts":"2026-10-26T04:24:35.120Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:24:35.121Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:24:35.121Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:24:35.122Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-u0Erke/commands.json","count":0}
{"ts":"2026-10-26T04:24:43.180Z","level":"info","msg":"machine link closed","machine":"1615f28393af510c212daf7697988417","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only auto-stop: HTML/PNG and isolated bounded traffic (9.1s)


  1) src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only auto-stop: HTML/PNG and isolated bounded traffic 

    Error: expect(locator).toBeEnabled() failed

    Locator:  locator('[data-remote-desktop]').locator('[data-rich-clipboard]').getByRole('button', { name: '画像・書式を手元へコピー', exact: true })
    Expected: enabled
    Received: disabled
    Timeout:  5000ms

    Call log:
      - Expect "toBeEnabled" locator('[data-remote-desktop]').locator('[data-rich-clipboard]').getByRole('button', { name: '画像・書式を手元へコピー', exact: true }) with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').locator('[data-rich-clipboard]').getByRole('button', { name: '画像・書式を手元へコピー', exact: true })
        14 × locator resolved to <button disabled data-v-4e426a6d="">画像・書式を手元へコピー</button>
           - unexpected value "disabled"


      201 |           () => (window as any).__clip.events.filter((e: any) => e.operation === "push").length,
      202 |         );
    > 203 |         await expect(read).toBeEnabled();
          |                            ^
      204 |         await read.click();
      205 |         await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(2);
      206 |         const events = await page.evaluate(() => (window as any).__clip.events);
        at /workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e/src/specs/remote-desktop-rich-clipboard.spec.ts:203:28

    Error Context: test-results/remote-desktop-rich-clipbo-13461-nd-isolated-bounded-traffic/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-rich-clipbo-13461-nd-isolated-bounded-traffic/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-rich-clipbo-13461-nd-isolated-bounded-traffic/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only auto-stop: HTML/PNG and isolated bounded traffic 
undefined
/workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-rich-clipboard.spec.ts --grep auto-stop --timeout 20000
```

## busy-start

```text

Running 1 test using 1 worker

(node:1645178) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T04:25:01.609Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:25:01.610Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:25:01.610Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:25:01.615Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-1Slaw2/commands.json","count":0}
{"ts":"2026-10-26T04:25:02.265Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:25:02.266Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:25:02.266Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:25:02.267Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-gwtGsL/commands.json","count":0}
{"ts":"2026-10-26T04:25:09.737Z","level":"info","msg":"machine link closed","machine":"f352c868932873f85e65394a3d9d21a4","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only busy-start: HTML/PNG and isolated bounded traffic (8.6s)


  1) src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only busy-start: HTML/PNG and isolated bounded traffic 

    Error: expect(locator).toBeDisabled() failed

    Locator:  locator('[data-remote-desktop]').getByRole('button', { name: '双方向の自動同期を開始', exact: true })
    Expected: disabled
    Received: enabled
    Timeout:  5000ms

    Call log:
      - Expect "toBeDisabled" locator('[data-remote-desktop]').getByRole('button', { name: '双方向の自動同期を開始', exact: true }) with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByRole('button', { name: '双方向の自動同期を開始', exact: true })
        14 × locator resolved to <button data-v-70974c0a="">双方向の自動同期を開始</button>
           - unexpected value "enabled"


      156 |         await read.click();
      157 |         const auto = view.getByRole("button", { name: "双方向の自動同期を開始", exact: true });
    > 158 |         await expect(auto).toBeDisabled();
          |                            ^
      159 |         await auto.dispatchEvent("click");
      160 |         await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
      161 |         await expect(auto).toBeEnabled();
        at /workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e/src/specs/remote-desktop-rich-clipboard.spec.ts:158:28

    Error Context: test-results/remote-desktop-rich-clipbo-58697-nd-isolated-bounded-traffic/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-rich-clipbo-58697-nd-isolated-bounded-traffic/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-rich-clipbo-58697-nd-isolated-bounded-traffic/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only busy-start: HTML/PNG and isolated bounded traffic 
undefined
/workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-rich-clipboard.spec.ts --grep busy-start --timeout 20000
```

## pipe-fallback

```text

Running 1 test using 1 worker

(node:1664623) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T04:26:24.707Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:26:24.707Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:26:24.707Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:26:24.712Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-JjXL2N/commands.json","count":0}
{"ts":"2026-10-26T04:26:25.154Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:26:25.155Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:26:25.155Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:26:25.156Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-gLHvjK/commands.json","count":0}
{"ts":"2026-10-26T04:26:33.284Z","level":"info","msg":"machine link closed","machine":"3deedba39fb60b87821924915d91d5cb","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only pipe-fallback: HTML/PNG and isolated bounded traffic (9.2s)


  1) src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only pipe-fallback: HTML/PNG and isolated bounded traffic 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "legacy fallback generated"
    Received: "B generated table"

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      184 |           await expect
      185 |             .poll(() => page.evaluate(() => (window as any).__clip.text))
    > 186 |             .toBe("legacy fallback generated");
          |              ^
      187 |           return;
      188 |         }
      189 |         await page.evaluate(() => {
        at /workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e/src/specs/remote-desktop-rich-clipboard.spec.ts:186:14

    Error Context: test-results/remote-desktop-rich-clipbo-fa6a1-nd-isolated-bounded-traffic/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-rich-clipbo-fa6a1-nd-isolated-bounded-traffic/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-rich-clipbo-fa6a1-nd-isolated-bounded-traffic/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only pipe-fallback: HTML/PNG and isolated bounded traffic 
undefined
/workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-rich-clipboard.spec.ts --grep pipe-fallback --timeout 20000
```

## focus-busy

```text

Running 1 test using 1 worker

(node:1665553) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T04:26:51.688Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:26:51.689Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:26:51.690Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:26:51.696Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-LnEPi5/commands.json","count":0}
{"ts":"2026-10-26T04:26:52.135Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:26:52.136Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:26:52.136Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:26:52.137Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ybZH3O/commands.json","count":0}
{"ts":"2026-10-26T04:26:59.617Z","level":"info","msg":"machine link closed","machine":"b7c629664347a86914fd7c8c0bfbc6d2","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only roundtrip: HTML/PNG and isolated bounded traffic (8.5s)


  1) src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only roundtrip: HTML/PNG and isolated bounded traffic 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 1
    Received: 0

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      241 |       }
      242 |       await read.click();
    > 243 |       await expect.poll(() => page.evaluate(() => (window as any).__clip.writes)).toBe(1);
          |                                                                                   ^
      244 |       expect(await page.evaluate(() => (window as any).__clip.html)).toContain(
      245 |         'style="color:green"',
      246 |       );
        at /workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e/src/specs/remote-desktop-rich-clipboard.spec.ts:243:83

    Error Context: test-results/remote-desktop-rich-clipbo-e2491-nd-isolated-bounded-traffic/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-rich-clipbo-e2491-nd-isolated-bounded-traffic/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-rich-clipbo-e2491-nd-isolated-bounded-traffic/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only roundtrip: HTML/PNG and isolated bounded traffic 
undefined
/workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-rich-clipboard.spec.ts --grep roundtrip --timeout 20000
```

## copy-race

```text

Running 1 test using 1 worker

(node:1666450) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T04:27:17.357Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:27:17.357Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:27:17.357Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:27:17.362Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-qe3MGX/commands.json","count":0}
{"ts":"2026-10-26T04:27:17.823Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T04:27:17.824Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T04:27:17.824Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T04:27:17.825Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-GSKPCM/commands.json","count":0}
{"ts":"2026-10-26T04:27:24.537Z","level":"info","msg":"machine link closed","machine":"e128d45f15247eac0e36f1fa98ba6f8d","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only copy-race: HTML/PNG and isolated bounded traffic (7.8s)


  1) src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only copy-race: HTML/PNG and isolated bounded traffic 

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 0
    Received:   0

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      145 |         await view.getByLabel("画像・書式も自動同期する").check();
      146 |         await view.getByRole("button", { name: "双方向の自動同期を開始", exact: true }).click();
    > 147 |         await expect.poll(()=>page.evaluate(()=>(window as any).__clip.events.filter((e:any)=>e.operation==="commit").length)).toBeGreaterThan(0);
          |                                                                                                                                ^
      148 |         await view.getByRole("button", { name: "自動同期を停止", exact: true }).click();
      149 |         await expect(read).toBeEnabled();await read.click();
      150 |         await expect.poll(()=>page.evaluate(()=>(window as any).__clip.writes)).toBeGreaterThanOrEqual(2);
        at /workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e/src/specs/remote-desktop-rich-clipboard.spec.ts:147:128

    Error Context: test-results/remote-desktop-rich-clipbo-14697-nd-isolated-bounded-traffic/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-rich-clipbo-14697-nd-isolated-bounded-traffic/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-rich-clipbo-14697-nd-isolated-bounded-traffic/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-rich-clipboard.spec.ts:16:3 › rich clipboard memory-only copy-race: HTML/PNG and isolated bounded traffic 
undefined
/workspaces/sodashitsu-desktop-rich-clipboard/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-rich-clipboard.spec.ts --grep copy-race --timeout 20000
```
