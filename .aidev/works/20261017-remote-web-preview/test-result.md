# リモートWebプレビューの検証

以下のP0欄は当時の結果。後段の「CLI・転送・UI」で初期実装の追加検証を記録する。

2026-10-17。Linux / Node 24.15.0 / Playwright 1.63.0 / Chromium 153.0.8010.12。

## 実装・確認範囲

`packages/cli/src/preview/LoopbackGateway.ts`は、app/sessionごとに直接の子`p<uuid>.localhost`を生成し、127.0.0.1だけにbindする共通gateway。Host完全一致、1回限りbootstrap、HttpOnly/Secureの認証cookie、同名認証cookieの重複拒否、Origin検査、gateway cookieのupstream除去、Set-Cookie予約名拒否/Domain除去、最大接続/要求数、HTTP量/期限、終了時cancelを持つ。

これは基礎部品であり、CLIコマンド・本物のmachine接続・Sodashitsuのアプリ画面にはまだ配線していない。PoCのHTTP先はfixtureアプリ、WebSocket transportはfixture。Vite/Nextの本物のHMR、B発の既存委譲経路、実公開HTTPSのSodashitsu、Windows/macOS/Firefox/Safariの検証結果ではない。

## 合格したチェック

- `pnpm build`: pass。最初にCLIだけをbuildした際はserverの未build成果物参照で失敗したため、通常のworkspace順でbuildして解消。以後のCLI buildもpass。
- `pnpm typecheck`: 全packageとscripts pass。最終修正後のCLI typecheckも確認。
- `pnpm exec vitest run --project @sodashitsu/cli`: 最終状態で54ファイル・1016テストpass。
- gateway単体: 7件pass。不正Host/未認証asset、bootstrapの1回性、重複cookie/異Origin/不正path、アプリ資格情報保持とgateway資格情報除去、不正WS後の枠解放、非ASCII cookie拒否を確認。
- 文書の相対リンクと差分の空白点検: 不正なし。

## ブラウザPoC

実行入口: `scripts/remote-web-preview-poc.mjs`。事前に`pnpm build`が必要。OSへ証明書を登録せず、一時ディレクトリ内に作るテスト用証明書だけをテストcontextで許可する。全listenerをloopbackへbindし、終了時に停止・一時ファイル削除。

```sh
SODA_PREVIEW_POC_REPORT=/tmp/sodashitsu-preview-entry-poc.json node scripts/remote-web-preview-poc.mjs
SODA_PREVIEW_POC_REPORT=/tmp/sodashitsu-preview-entry-public-poc.json node scripts/remote-web-preview-poc.mjs --simulated-public-parent --grant-local-network
```

両方pass。利用者のブラウザDOM、ブラウザ内fetch、WebSocket/EventSourceの受信で判定した。確認項目:

- HTTPS親のsandbox iframe内にapp-0/app-1が表示される。
- root絶対pathのdynamic import/API/CSS、upload、SSE先頭イベントが成立する。
- WebSocketは実gatewayの認証upgradeを通り、fixtureメッセージを受け取る（本物のremote HMR転送は未検証）。
- `isSecureContext=true`、2app同名cookie/localStorageが分離される。
- JSで`Domain=localhost`のcookieを書いても相手appへ混ざらない。
- JSで認証cookieの同名・異Path・親Domainの値を注入しても認証cookieを置換できず、後続APIが動く。
- app APIへ渡るCookieは`session=app-n`で、gateway認証cookieを含まない。
- app-0からapp-1のcredential付きfetchはブロックされる。この試験に伴うCORS console errorは期待どおり。
- SW登録はこのブラウザで成立したが、失効後cacheや製品としてのSW対応の合格には数えない。

レポートは上記`/tmp` JSONに保存。認証cookie値は`[redacted]`に置き換えて出力する。

## ローカルネットワークアクセスの対照

`--simulated-public-parent`はPlaywrightのroute fulfillで`https://soda-preview.invalid`の親を模擬し、実際の公開network接続を使わない。localhostの親だけで成立したことを外部公開originへ一般化しないための追加試験。

ブラウザの標準LNA権限を与えない実行は、iframe文書の要求が次のエラーで拒否された。

```text
"error": "net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS"
```

同じ試験で親originに`local-network-access`権限を付与すると通過した。製品では利用者が標準UIで許可し、エージェントからのopenで安全機能を無効化したり、権限を勝手に付与したりしない。この挙動は[Chrome公式LNA説明](https://developer.chrome.com/blog/local-network-access)とも整合するが、他browserの挙動は未確認。

## 回帰テストの負の対照（生出力）

独立点検で発見したWS枠リークを修正する前に、新しいテストが失敗することを確認した。ログ: `/tmp/preview-gateway-negative.log`。

```text
 FAIL  |@sodashitsu/cli| src/preview/LoopbackGateway.test.ts > LoopbackGateway > releases concurrency slots when a WebSocket handshake is rejected
AssertionError: expected 429 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 429

 ❯ src/preview/LoopbackGateway.test.ts:92:52
```

非ASCII cookieの修正前にも新しいテストの失敗を確認した。独立点検側ではWS upgradeでプロセス終了も再現している。テストでは同じ原因のHTTP側の拒否を先に観測し、worker全体のクラッシュを避けた。ログ: `/tmp/preview-gateway-unicode-negative.log`。

```text
 FAIL  |@sodashitsu/cli| src/preview/LoopbackGateway.test.ts > LoopbackGateway > rejects non-ASCII auth values without throwing or breaking later HTTP/WS requests
AssertionError: expected 502 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 502

 ❯ src/preview/LoopbackGateway.test.ts:98:52
```

修正後は両方passし、独立再レビューで解消を確認した。

## 残る作業

P1登録/CLI/grant、P2既存マシン接続上の本物のHTTP/WS転送、P3製品画面とagent open、P4 Vite/Next・負荷/失効・実機検証は未実施。P0の成立をこれらの完成と取り違えない。

## CLI・転送・UI（2026-10-17）

実2サーバーA/Bをloopbackへ起動し、BからAへの既存外向き操作委譲を接続。AブラウザでB/pane選択→表示許可→ブラウザPCの実CLI helper→B pane.sockのtokenなしregister/openを実行した。開発アプリも実HTTP/WS serverで、ブラウザDOM/ブラウザ受信を判定に使う。HTTP/module/API/SSE先頭イベント/upload/WS text・upstreamが選ぶ第2subprotocol/cookie非漏洩/絶対Location変換/停止でiframe除去がpass。最終E2Eログ: `/tmp/preview-final-e2e.log`、1 passed (13.3s)。スクリーンショット: `/tmp/sodashitsu-remote-web-preview.png`。

独立レビューはreview.md。以下は回帰の対照確認の生出力。ソースを一時的に戻した検査は終了後byte-for-byteで復元し、最終成果物にも管理port検査/queue上限が残ることを確認した。

### 停止と非同期検査の競合（修正前の失敗）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-web-preview

 ❯ |@sodashitsu/server| src/preview/PreviewService.test.ts (1 test | 1 failed) 10ms
   ❯ PreviewService (1)
     × does not enqueue an open after its app was stopped during port validation 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewService.test.ts > PreviewService > does not enqueue an open after its app was stopped during port validation
AssertionError: expected [ { …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "app": {
+       "generation": "786d97d7-2d50-4e58-b47b-3984ffdcacd6",
+       "id": "ac713990-e027-4eaa-a896-a2d871dc37d5",
+       "name": "web",
+       "paneId": "4ca9bc9c-f022-4163-b6bd-0e1401cd53e6",
+       "port": 5173,
+       "state": "stopped",
+       "workspaceId": "fd3e1d01-7347-45bb-8435-564b3381b699",
+     },
+     "requestId": "e7eb9277-bcca-46df-a9fa-1ef370b11dfd",
+   },
+ ]

 ❯ src/preview/PreviewService.test.ts:23:37
     21|     x.s.stop(app.id); release([]);
     22|     await new Promise((resolve) => setImmediate(resolve));
     23|     expect(x.s.work("helper").jobs).toEqual([]);
       |                                     ^
     24|   });
     25| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  14:14:04
   Duration  630ms (transform 74%, import 23%, tests 2%, worker 1%)

```

### 依頼元disconnect/abortと非同期検査の競合（修正前の失敗）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-web-preview

 ❯ |@sodashitsu/server| src/preview/PreviewService.test.ts (7 tests | 2 failed) 20ms
   ❯ PreviewService (7)
     × does not enqueue after owner disconnect during port validation 9ms
     × does not enqueue after owner abort during port validation 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewService.test.ts > PreviewService > does not enqueue after owner disconnect during port validation
AssertionError: expected [ { …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "app": {
+       "generation": "56a0ff90-127f-494d-a34a-c0b622d74d50",
+       "id": "c5412155-f0ca-42ce-8d18-5dd7ae838e8e",
+       "name": "web",
+       "paneId": "82d09874-47e6-4f0b-8878-9067093012ac",
+       "port": 5173,
+       "state": "registered",
+       "workspaceId": "64725656-90fe-490e-bc2b-7302ad4f8549",
+     },
+     "requestId": "6a5abbf3-6dcd-4210-9e99-501da5a16dbc",
+   },
+ ]

 ❯ src/preview/PreviewService.test.ts:48:37
     46|     if (action === "disconnect") x.s.clientGone("agent"); else x.s.abo…
     47|     release([]); await new Promise((resolve) => setImmediate(resolve));
     48|     expect(x.s.work("helper").jobs).toEqual([]);
       |                                     ^
     49|   });
     50|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewService.test.ts > PreviewService > does not enqueue after owner abort during port validation
AssertionError: expected [ { …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "app": {
+       "generation": "e2e3d873-1e69-4ffc-ac27-730af7859013",
+       "id": "aea91fb9-822c-43d8-b0ed-c945113a2e1a",
+       "name": "web",
+       "paneId": "35a98492-0235-449c-8741-85068e362cde",
+       "port": 5173,
+       "state": "registered",
+       "workspaceId": "a1fb6204-8329-4e7f-85cd-19549a15b681",
+     },
+     "requestId": "af73254d-4541-456e-beb3-0c87f421e244",
+   },
+ ]

 ❯ src/preview/PreviewService.test.ts:48:37
     46|     if (action === "disconnect") x.s.clientGone("agent"); else x.s.abo…
     47|     release([]); await new Promise((resolve) => setImmediate(resolve));
     48|     expect(x.s.work("helper").jobs).toEqual([]);
       |                                     ^
     49|   });
     50|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
   Start at  14:21:25
   Duration  591ms (transform 70%, import 25%, tests 4%, worker 1%)

```

### helperの空WSメッセージ待ち行列（修正前の失敗）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-web-preview

 ❯ |@sodashitsu/cli| src/preview/RpcPreviewTransport.test.ts (1 test | 1 failed) 6ms
   × bounds empty WebSocket messages while upstream RPC writes are stalled 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/preview/RpcPreviewTransport.test.ts > bounds empty WebSocket messages while upstream RPC writes are stalled
AssertionError: expected "vi.fn()" to be called at least once
 ❯ src/preview/RpcPreviewTransport.test.ts:21:24
     19|   const running = prepared.attach(socket as unknown as WebSocket);
     20|   for (let i = 0; i < 300; i++) socket.emit("message", Buffer.alloc(0)…
     21|   expect(socket.pause).toHaveBeenCalled();
       |                        ^
     22|   expect(socket.close).toHaveBeenCalledWith(1009, "preview message lim…
     23|   controller.abort(); finishRead({ kind: "end" }); await running;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  14:21:40
   Duration  483ms (transform 76%, import 22%, tests 1%, worker 1%)

```

### 接続時の管理port再検査とB側WS件数上限（修正前の失敗）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-web-preview

 ❯ |@sodashitsu/server| src/preview/PreviewStreams.test.ts (5 tests | 2 failed) 120ms
   ❯ PreviewStreams (5)
     × rechecks management ports at every HTTP and WS connection 10ms
     × bounds the message count even when every incoming WS message is empty 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewStreams.test.ts > PreviewStreams > rechecks management ports at every HTTP and WS connection
AssertionError: promise resolved "{ streamId: '8cabfe6c-d6f0-4cf2-bd21…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "streamId": "8cabfe6c-d6f0-4cf2-bd21-af613f740e2e",
  }

 ❯ src/preview/PreviewStreams.test.ts:54:123
     52|   it("rechecks management ports at every HTTP and WS connection", asyn…
     53|     const x = await setup(); x.setBlocked();
     54|     await expect(x.streams.begin("helper", { requestId: randomUUID(), …
       |                                                                                                                           ^
     55|     await expect(x.streams.wsBegin("helper", { requestId: randomUUID()…
     56|     expect(x.streams.stats().streams).toBe(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/preview/PreviewStreams.test.ts > PreviewStreams > bounds the message count even when every incoming WS message is empty
AssertionError: expected 1000 to be less than or equal to 256
 ❯ src/preview/PreviewStreams.test.ts:71:46


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
   Start at  14:23:57
   Duration  884ms (transform 59%, import 24%, tests 16%, worker 1%)

```

## 最終確認

- `pnpm build`: pass（`/tmp/preview-final-build.log`）。
- `pnpm typecheck`: 全package/scripts pass（`/tmp/preview-final-typecheck.log`）。
- gateway/service/stream/helper/CLI skillのfocused検証: 5 files / 31 tests pass（`/tmp/preview-final-focused.log`）。
- 関連ブラウザE2E: 1 pass（`/tmp/preview-final-e2e.log`）。
- `/tmp`をcwdに実行した独立worktree成果物のsmoke: CLI/PTY往復、ブラウザログイン・端末描画・入力往復pass（`/tmp/preview-final-smoke.log`）。
- `git diff --check`と今回文書の相対リンク: pass。
- 全体unit/integrationテスト: 673 files、10,911 pass / 2 fail / 1 skip、1 suiteは鮮度検査で失敗（413.70秒）。再起動前に完走済み。全体passとは扱わない。
  - `soda.pty.integration.test.ts`: 対照検査でsourceのmtimeが更新されたことによるdist鮮度検査。server再ビルド後の単独再実行は1 test pass（28.20秒）。
  - `agent.test.ts`: `agent.prompt`のdelayMs期待1000に対し実装300。変更前の94f53f12でも同じ失敗を確認。今回これらの実装/testファイルは変更していない。
  - `SettingsDialog.test.ts`: 画面幅変更時のフォーカス試験が15秒timeout。再実行中に環境が再起動したため、その実行結果は未確定。再起動後は該当試験を限定して確認する。
- 再起動で一時ログ/PoCサーバー/helperは消失した。本文に記録済みの結果は再起動前のもの。再起動後の実行は下段に分ける。

ビルドと回帰対照の作業が時間的に重なったため、最終dist/preview/PreviewStreams.jsにHTTP/WS双方のcheckPortとqueue件数上限が残ることを機械で確認した。対照修復後のfocused31件と最終実ブラウザE2Eもpass。

## 再起動後の復元確認

専用worktree/branch、未コミット差分、node_modules、build成果物が残存。外部公開や稼働サーバーの変更はせず、試験が自動生成するloopbackの実2サーバー/helperを再起動する。

- focused: 5 files / 31 tests pass。
- 既存失敗の限定再実行: 設定画面の該当フォーカス試験はpass。agent.promptの1000/300不一致は再現。対象実装/testは94f53f12から差分なし。

既存不一致の生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-web-preview

 ❯ |@sodashitsu/server| src/surface/methods/agent.test.ts (27 tests | 1 failed | 26 skipped) 285ms
   ❯ agent.prompt (14)
     × 本文と Enter を 2 部分にして1000msの間を置くモード付き入力として書き、送信を始めた時点のエージェントを返す（AC2・AC4） 259ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt > 本文と Enter を 2 部分にして1000msの間を置くモード付き入力として書き、送信を始めた時点のエージェントを返す（AC2・AC4）
AssertionError: expected 300 to be 1000 // Object.is equality

- Expected
+ Received

- 1000
+ 300

 ❯ src/surface/methods/agent.test.ts:88:38
     86|     expect(result).toEqual({ ok: true, result: { agent: agent() } });
     87|     expect(s.host.modal).toHaveLength(1);
     88|     expect(s.host.modal[0]!.delayMs).toBe(1000);
       |                                      ^
     89|     expect(s.host.written).toEqual(["line1\nline2", "\r"]);
     90|     expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 1 passed | 170 skipped (172)
   Start at  14:51:17
   Duration  39.36s (transform 75%, import 17%, tests 5%, environment 2%)

  Transform  |@sodashitsu/web| transforming modules took 28.17s · 72% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

  Transform  |@sodashitsu/server| transforming modules took 12.54s · 84% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

再起動後の遠隔ブラウザE2E: **1 passed (37.6s)**。実2サーバー/B発委譲/helper/pane.sock登録→open→HTTP/WS→stopの一巡を復元し合格。ログ: `/tmp/preview-restart-e2e.log`。

## 実Vite 8.3.0 HMR（再起動後）

実行: `SODA_PREVIEW_VITE_REPORT=/tmp/sodashitsu-preview-vite-report.json node scripts/remote-web-preview-vite-poc.mjs`。exit 0。既存依存だけ使用。実2サーバーとB発外向き委譲、実helper、実iframeを通す。Vite appへbase/HMR URL/allowedHosts/proxyの追加設定はせず、JS/CSS更新でDOMとcomputed CSSが変わり、document stampが維持されることを確認。ブラウザがlocalhost側でVite connected/js-update/css-updateを受信し、直結fallbackだけで成功とする判定にはしない。stop後iframe 0、pageErrors=[]。

独立レビュー: 追加PoCのDOM判定・直結fallbackの誤認防止・loopback限定・cleanupを確認し、重要指摘なし。Nextは既存依存になく、インストールしない範囲のため未検証。実公開HTTPS親/別PC間ネットワーク/他OS/browserは未検証。

再現用ソース: `scripts/remote-web-preview-vite-poc.mjs`。永続記録: [vite-poc-report.json](vite-poc-report.json)。

```json
{
  "status": "passed",
  "platform": "linux",
  "node": "v24.15.0",
  "browser": "153.0.8010.12",
  "vite": "8.3.0",
  "route": "loopback Vite → B → B-initiated delegation to A → authenticated CLI helper → isolated localhost iframe",
  "moduleHmr": true,
  "cssHmr": true,
  "documentPreserved": true,
  "stopRevoked": true,
  "browserReceivedViteFrames": [
    {
      "type": "connected"
    },
    {
      "type": "update",
      "updates": [
        {
          "type": "js-update",
          "path": "/main.js"
        }
      ]
    },
    {
      "type": "update",
      "updates": [
        {
          "type": "css-update",
          "path": "/style.css?direct"
        }
      ]
    }
  ],
  "pageErrors": [],
  "limitations": "Linux Chromium only. Both Sodashitsu hosts are separate server instances on one PC; no external network, real HTTPS parent, Next, other OS/browser, or production TLS tested."
}
```
