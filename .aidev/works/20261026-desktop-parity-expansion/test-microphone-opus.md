# マイクOpusの検証

source b64fcf51、fixture終了待機のみ00fab928。build/typecheck・生成ブラウザ5件が通過。通常PCM/Opusと、暗号化WSS/UDPの生成tone/virtual mic/file/rich clipboardを確認した。Opus packetは生成試験で384byte未満、B sinkはRMS>1000。32kbpsは目標であり実通信量の保証ではない。

全体は11760件が通過し、新Relay fixture1件は終了時ENOTEMPTY、PTY1suiteは負例source復元後のmtimeでdist freshness拒否となった。新fixtureのfinallyで実helper closeを待つ修正後にfresh buildし、全Relay+PTY140件が通過した。他の製品コードは変更せず、全体を二重に流さなかった。独立worktreeでbuild/smokeも通過。

一度追加したDesktopOptionsのobject refineは既存.pick()と衝突しブラウザ起動を壊した。browser2のtraceで実行時例外を確認し、refineを除去してProviderの検査を維持。修正後browser3の5件を最終結果とする。テスト用旧cap castとBuffer型は型だけの修正。

負例4件: viewer feature/B capabilityの積、B固定duration、encoder出力停止の期限を個別に戻すと失敗。finallyでbyte一致復元後にfresh buildした。実録音・再生・OS入力・driver導入は行っていない。

## 生出力


### No viewer feature

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone-opus

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (139 tests | 1 failed | 138 skipped) 147ms
   × negotiates microphone Opus only with both viewer feature and B support: viewer 145ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates microphone Opus only with both viewer feature and B support: viewer
AssertionError: expected 'opus' to be undefined // Object.is equality

- Expected:
undefined

+ Received:
"opus"

 ❯ src/desktop/DesktopRelay.test.ts:1164:271


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 138 skipped (139)
   Start at  17:10:46
   Duration  1.19s (transform 71%, import 16%, tests 13%)


```

### Old provider

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone-opus

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (139 tests | 1 failed | 138 skipped) 142ms
   × negotiates microphone Opus only with both viewer feature and B support: provider 140ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates microphone Opus only with both viewer feature and B support: provider
AssertionError: expected 'opus' to be undefined // Object.is equality

- Expected:
undefined

+ Received:
"opus"

 ❯ src/desktop/DesktopRelay.test.ts:1164:271


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 138 skipped (139)
   Start at  17:10:47
   Duration  1.18s (transform 69%, import 18%, tests 13%)


```

### Duration

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone-opus

 ❯ |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts (8 tests | 1 failed | 7 skipped) 1080ms
   × decodes generated Opus only into the fixed private PCM sink: oversize-duration 1079ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts > decodes generated Opus only into the fixed private PCM sink: oversize-duration
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopMicrophone.test.ts:47:100


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopMicrophone.test.ts:47:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  17:10:49
   Duration  1.79s (tests 65%, transform 28%, import 7%)


```

### Encoder stall

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone-opus

 ❯ |@sodashitsu/web| src/desktop/microphoneClient.test.ts (5 tests | 1 failed | 4 skipped) 13ms
   × bounds Opus encoder backlog and stops the generated capture when output stalls 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/microphoneClient.test.ts > bounds Opus encoder backlog and stops the generated capture when output stalls
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/microphoneClient.test.ts:30:530


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  17:10:52
   Duration  909ms (transform 65%, environment 18%, import 15%, tests 2%)


```

### Full suite

```text
    at file:///workspaces/sodashitsu-desktop-microphone-opus/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:416:80
    at new Promise (<anonymous>)
    at Fetch.sendRequest (file:///workspaces/sodashitsu-desktop-microphone-opus/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:415:16)
    at Fetch.send (file:///workspaces/sodashitsu-desktop-microphone-opus/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/fetch/Fetch.js:188:27)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at BrowserFrameNavigator.navigate (file:///workspaces/sodashitsu-desktop-microphone-opus/node_modules/.pnpm/happy-dom@20.14.5/node_modules/happy-dom/lib/browser/utilities/BrowserFrameNavigator.js:202:24)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/launch/soda.pty.integration.test.ts > soda（引数なし）を本物の端末で（node-pty。dist が無ければ skip：先に pnpm build。Windows は対象外）
Error: dist is older than src (run pnpm build first): src/desktop/DesktopMicrophone.ts, src/desktop/DesktopRelay.ts
 ❯ src/launch/soda.pty.integration.test.ts:133:15
    131|       const stale = [...staleOutputs(SERVER_PKG), ...staleOutputs(TUI_…
    132|       if (stale.length > 0)
    133|         throw new Error(
       |               ^
    134|           `dist is older than src (run pnpm build first): ${stale.slic…
    135|         );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates microphone Opus only with both viewer feature and B support: provider
Error: ENOTEMPTY: directory not empty, rmdir '/tmp/soda-desktop-test-JqYx1e'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed | 785 passed (787)
      Tests  1 failed | 11760 passed | 1 skipped (11762)
   Start at  17:11:00
   Duration  372.21s (tests 81%, import 10%, environment 5%, transform 4%)

Environment  |@sodashitsu/web| happy-dom was created 227 times · 63.20s total, 29% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments


```

### Focused recheck

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-microphone-opus


 Test Files  2 passed (2)
      Tests  140 passed (140)
   Start at  18:20:31
   Duration  60.21s (tests 93%, transform 6%, import 1%)


```

### Browser final

```text
{"ts":"2026-10-27T08:10:03.420Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T08:10:03.430Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ds7R6U/commands.json","count":0}
{"ts":"2026-10-27T08:10:03.862Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T08:10:03.862Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T08:10:03.863Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T08:10:03.863Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-lCHmHM/commands.json","count":0}
{"ts":"2026-10-27T08:10:06.904Z","level":"info","msg":"machine link closed","machine":"399060bcfa4475d0c2427432aa4a5fb1","kind":"transient","reason":"接続が切れました"}
  ✓  5 src/specs/remote-desktop-microphone.spec.ts:9:44 › explicit microphone sends generated opus to B, stops tracks and never restarts on reopen (4.1s)

  5 passed (31.9s)

```

### Typecheck

```text
packages/tui typecheck: Done
packages/web typecheck: Done
packages/server typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/server typecheck: Done
packages/cli typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/e2e typecheck$ tsc --noEmit -p tsconfig.typecheck.json
packages/cli typecheck: Done
packages/e2e typecheck: Done

```

### Independent smoke

```text
{"ts":"2026-10-27T09:21:20.094Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"a0441fc5-3b60-45a7-9bfc-a360c70cd276","paneId":"ccf7fc46-3cd4-4f61-a321-afa74bfc012f"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane ccf7fc46-3cd4-4f61-a321-afa74bfc012f
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS

```
