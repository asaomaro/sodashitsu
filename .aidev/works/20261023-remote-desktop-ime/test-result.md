# リモートデスクトップのIME ON/OFF

依頼: ウィンドウにフォーカスがある場合にIME ON/OFFを接続先へ送る。

## 実装

IMEOn/ImeOn・IMEOff/ImeOffのキーの意味と、専用キーLang1/Lang2をImeOn/ImeOffへ正規化する。ウィンドウ内のfocus・操作許可・ready・helper対応があるときだけcaptureで既定処理と伝播を抑止し、変換中でも専用キーは送る。文字送信欄と設定のinput/textarea/select/contenteditableではローカルIMEを維持する。

物理keyupがないキーにも対応するためkeydown時に押下/解放を一組で送る。repeatとkeyupで再送しない。操作バーにもIME ON/OFFボタンを用意。WindowsのVirtualKeyは0x16/0x1Aで、ready.imeKeysにより対応を通知する。Provider/Relay/agent経路は対応通知のないhelperへ送らない。初期lock coverではIMEを受け付けない。

認証画面の対応にはインストール済みサービスのHostも更新する必要がある。OSが先に処理するキー割り当ては保証せず、ボタンを代替にする。

仕様の出典: https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/keyboard-japan-ime （VK_IME_ON/OFF、LANG1/2、breakなし）。

## 検証

- main基点の隔離worktree: build/typecheck成功、関連unit 3ファイル40件成功。
- ブラウザ: IME 2件成功。focus内/toolbar/文字入力欄/外部focus/readonly/composition/repeat/押下と解放/ボタン/未対応helperをDOMとブラウザの送受信WSで確認。既存lock cover/unlock 6件も成功。
- 初回のIME E2Eでは「文字入力欄から外へfocusを移すと操作権も解除される」という既存挙動にない期待で1件失敗。IME転送の条件を観測し、閲覧専用への切替は明示操作で検証するようテストを修正した。
- Windowsのvalidate-unlock-helper.ps1成功。実際のVirtualKeyを反射で呼びIME用の2値を確認。撮影/SendInput/IME状態変更/サービス導入は行っていない。
- 元の作業フォルダへも今回の差分だけを反映し、他の未コミット変更を維持。root build、関連unit 45件、IME E2E 2件成功。
- pnpm smoke: 成功。
- 全体テスト: 実行中（完了後に更新）。
- 別コンテキストreview_transferによる実装全体とテスト修正の独立レビュー: 指摘なし。
- 実物キーボードからのOSイベント配送・実アプリのIME状態切替は未確認。sr-pcへの配置・サービス再インストールは実施していない。

## 回帰の負対照

修正部分だけを外して試験し、失敗を確認してから修正済みソースをバイト一致で復元。ブラウザ用には変更版をビルドし直し、復元後もWebを再ビルドした。Windowsの負対照は独立したfixture上で対応表だけを戻してコンパイルし、実機の共有や入力を行わずに確認した。

### 旧プロトコルの許可キー

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-ime

 ❯ |@sodashitsu/protocol| src/desktop.test.ts (7 tests | 1 failed | 6 skipped) 8ms
   × accepts only named IME ON/OFF keys and optional helper support 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktop.test.ts > accepts only named IME ON/OFF keys and optional helper support
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop.test.ts:150:108
    148| it("accepts only named IME ON/OFF keys and optional helper support", (…
    149|   for (const code of ["ImeOn", "ImeOff"])
    150|     for (const down of [true, false]) expect(RemoteDesktopInput.safePa…
       |                                                                                                            ^
    151|   expect(RemoteDesktopInput.safeParse({kind:"key",code:"VK_IME_ON",dow…
    152|   const ready={type:"ready",title:"test",allowInput:true,width:640,hei…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  16:45:47
   Duration  220ms (transform 48%, import 44%, tests 6%, worker 3%)


```

### 旧Nativeの仮想キー対応

```text
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
"1" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Unsupported key"
発生場所 C:\Users\makku\AppData\Local\Temp\soda-ime-hms2utln\validate-unlock-helper.ps1:8 文字:1
+ [SodaDesktopTests.UnlockProcessChecks]::Run($PSScriptRoot)
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### ウィンドウcaptureを外した場合

```text

Running 1 test using 1 worker

(node:4125759) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-23T07:46:44.151Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-23T07:46:44.152Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-23T07:46:44.152Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-23T07:46:44.157Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-IS5YTW/commands.json","count":0}
{"ts":"2026-10-23T07:46:44.615Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-23T07:46:44.616Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-23T07:46:44.616Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-23T07:46:44.616Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-4HqLzX/commands.json","count":0}
{"ts":"2026-10-23T07:46:46.804Z","level":"info","msg":"machine link closed","machine":"fbe3bf1d370af15efa1f66dcb98847c5","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-ime.spec.ts:8:40 › IME keys follow focused remote window and helper support=true (3.2s)


  1) src/specs/remote-desktop-ime.spec.ts:8:40 › IME keys follow focused remote window and helper support=true 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 5
    + Received  + 5

      Array [
    -   true,
    -   true,
    -   true,
    -   true,
    -   true,
    +   false,
    +   false,
    +   false,
    +   false,
    +   false,
      ]

      57 |       return results;
      58 |     });
    > 59 |     expect(prevented).toEqual([true,true,true,true,true]);
         |                       ^
      60 |     await expect.poll(()=>ime().length).toBe(4);
      61 |     expect(ime().map(m=>[m.input.code,m.input.down])).toEqual([["ImeOn",true],["ImeOn",false],["ImeOff",true],["ImeOff",false]]);
      62 |     await expect.poll(()=>received.some(m=>m.type==="input_ack"&&m.seq===ime().at(-1)!.seq)).toBe(true);
        at /workspaces/sodashitsu-desktop-ime/packages/e2e/src/specs/remote-desktop-ime.spec.ts:59:23

    Error Context: test-results/remote-desktop-ime-IME-key-34d6a-dow-and-helper-support-true/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-ime-IME-key-34d6a-dow-and-helper-support-true/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-ime-IME-key-34d6a-dow-and-helper-support-true/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-ime.spec.ts:8:40 › IME keys follow focused remote window and helper support=true 
undefined
/workspaces/sodashitsu-desktop-ime/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-ime.spec.ts --grep support=true

```

### Windows検証の出力

```text
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_unlock_checks_passed
desktop_unlock_no_console_utf8_passed

```
