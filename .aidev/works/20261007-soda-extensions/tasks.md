# タスク: soda 拡張の表示の面（ブラウザ版）— `sodactl display`・パネルと帯・隔離した枠

実装するのは、この文書を読む別のエージェント。**読む順**: この `tasks.md` → `design.md`（型・操作の表・枠とのやりとり・脅威の表 H1〜H16 は、そこが正）→ `requirements.md`（AC の本文）→ `research.md` の追補（R1〜R9・実装アンカー A1〜A18・実装時の注意）。
`decisions.md` の D12〜D20 は、この作業の範囲と、勧める案で進めた点。**範囲の外**（拡張の登録と起動〔`20261007-ext-host`〕・端末版のパネル・観測・割り込み・作者のスクリプト）には手を出さない。

## 実装方針

3 段に積み、各段の終わりで `pnpm build`・`pnpm typecheck`・該当パッケージのテストが通る状態にする。

- **S1（画面なしで動く）**: protocol（T1・T2）→ サーバの台帳と登録（T3・T4）→ sodactl（T5・T6）。この段の終わりに、`sodactl display set`・`list`・`close`・`--features`・`wait`・`events` が、ログインなしの受け口と、ログイン済みの `/ws` の両方を通る（T5・T6 の結合テスト。vitest がソースから動かす）。
- **S2（画面に出る）**: 静的ページと配信（T7・T8）→ ブラウザの状態と通信（T9）→ 枠（T10）→ パネル・帯の部品（T11）→ pane への差し込み（T12）→ **最初の E2E（T13。不確かな点をここで確かめる）**。
- **S3（操作・モバイル・確かめ・文書）**: キーの操作とフォーカス（T14）→ モバイル（T15）→ E2E（T16・T17・T18）→ handoff の起動確認（T19）→ 文書（T20）→ 負の対照（T21。test 工程）。

純粋な検査（引数・操作・行の形）は protocol に置き、サーバ・sodactl・ブラウザが同じ関数を使う。大きさの丸め・枠からの知らせの検査は、web の純粋なモジュールに置いて単体テストする。
**`/ws` の handler を受け口に登録しない**（受け口の操作は、引数に `paneId` を持たない別の schema。design「操作」）。

独立点検（`aidev taskcheck`）は、壊れやすいタスク（サーバの状態・プロトコル・安全に関わるもの）だけに掛ける: **T1・T2・T3・T4・T6・T7・T8・T10**（各タスクの末尾に `点検: あり`）。
見た目・配線・E2E・文書のタスクには掛けず、全タスクの後に `cross` を 1 回掛ける（AGENTS.md「点検とテストの掛け方」。autonomous の既定は「全タスク」だが、プロジェクトの規約を優先する。`decisions.md` D17）。
最後の独立レビュー（差分全体）は省かない。

## 作業順序と依存関係

下の `依存:` に従う。補足:

- **不確かな 4 点と、だめだったときの扱い**（design「依拠する既存の事実」の未確認）。どれも、だめなら代えを採って `decisions.md` に追記する。
  1. `MessagePort` を、sandbox の不透明 origin の枠へ `postMessage` の transfer で渡せること → **T13**。だめなら、design「枠とのやりとり」の「代替」（乱数の合言葉）に切り替える（直すのは `DisplayFrame.vue` と `frame.js` だけ）。
  2. Playwright の `frame.evaluate` が、`script-src 'self'` の枠の文書の中で式を評価できること → **T13**（探りの式を 1 つ評価してみる）。だめなら、T17 (1) の探り（`parent.document`・Cookie・`localStorage`・`fetch`・`WebSocket`）は測れない。
     そのときは、枠の origin が不透明であること（親から見た `iframe.contentDocument === null`・応答ヘッダと `sandbox` 属性の値）だけを見て、**AC15 の「枠の中から触れない（実測）」は未検証の穴として `test-result.md` と `decisions.md` に残す**（黙って緑にしない）。
  3. sandbox に `allow-forms` があれば、枠の中の `form` の `submit` のイベントが起き、実際の送信は起きないこと → **T16 (8)**。`submit` が起きないなら、`decisions.md` D18 の 4 の代替案（送信ボタンの `click` と欄の `Enter` を `frame.js` が拾う）に切り替え、`allow-forms` を外す（T7・T8・T10 の定数を直す）。
  4. marked が、Markdown の中の HTML（`<button data-soda-action>`）をそのまま通すこと → **T16 (8)**。通さないなら、`markdown` では操作を宣言できないと T20 の文書に書き、requirements の AC10 の後半（`markdown` のボタン）を外す。
- `composeServer.ts`・`HttpServer.ts`・`main.ts`（web）・`cliArgs.ts`・`ActionDispatcher.ts` は、複数のタスクが触る。`依存:` の順に 1 つずつ（並行させない）。
- 並行してよい組: T3 と T5 の引数の解析（server と cli。T2 の後）、T7・T8 と T9（静的ページ・配信と web のストア）、T14 と T15。

## リスク / 留意点

- **葉（`.pane-layout-leaf`）と `TerminalPane.vue` の中に何も足さない**。足すのは `.pane-frame-body` の中の、葉の兄弟（research R3・実装時の注意）。足し方を誤ると、端末の端が切れる。
- **`PaneFrame` は `enabled=false`（モバイル・単体テスト）でストアに触れない**。面の部品も同じ条件で描かない。既存の `PaneFrame.test.ts`・`PaneLayout.test.ts` を壊さない。
- **`/ask-view/*` の応答ヘッダ・`ASK_VIEW_*` の定数・`packages/web/public/ask-view/` の中身は変えない**（既存の E2E の負の対照が見ている）。`HttpServer.ts` で共通の関数にまとめるときも、出るヘッダの値を変えない（既存の統合テストが守る）。
- **枠の sandbox（`DISPLAY_VIEW_SANDBOX`＝T10、`DISPLAY_VIEW_CSP`＝T8）に `allow-same-origin` を付けない。CSP の `script-src` に `'unsafe-inline'`・`'unsafe-eval'` を付けない**（`style-src 'unsafe-inline'` は要る。負の対照は T21）。
- **面の出現・更新で、アプリは `focus()` を呼ばない**。`frame.js` が `focus()` を呼ぶのは、親の `focus` の知らせのときと、枠の文書が既にフォーカスを持つとき（`document.hasFocus()`）の持ち越しだけ。
- 受け口の待ち（`display.wait`）は、受け口の同時接続 64 を ask と分け合う。待ちの上限（pane 4・全体 16）を必ず入れる。
- `/ws` の `not_found` は「pane が無い」と「古いサーバ」の両方で返る。sodactl は `display.features` で見分ける。受け口の `unknown_op` は、`/ws` へ落とさずに古いサーバとする（design「sodactl」）。
- パネルの開閉で pane の列数が変わる。幅をアニメーションさせない（100ms ごとに大きさの変更が飛ぶ）。
- ログに、面の中身・題・操作に添えた値を書かない。
- 新しいテーマの変数を足さない（既存の変数を `color-mix` で薄める）。文言は日本語の直書き。
- `USAGE_LINES` を変えるのは T5 だけ（`wait`・`events`・`--wait` の行も T5 で足す）。同じコミットで `packages/cli/skills/sodactl/SKILL.md` も直す（`skill.test.ts` が見る）。
- 動いている 7780 番のサーバには触らない。E2E・結合テストは、テストが立てるサーバ（空きポート・一時の状態ディレクトリ）だけを使う。E2E の sodactl には、テストのサーバの `SODA_PANE_SOCKET` を明示して渡し、走らせた人の環境の値を消す（`packages/e2e/src/support/ask.ts:56-64` と同じ）。
- 識別子（pane の id・面の id）の形に依存しない。

## テスト方針

- **単体**（各ファイルの隣の `*.test.ts`）:
  - protocol: `checkDisplaySet`（名前・種類・形・題・大きさ・中身の上限のちょうどと超過・`ttlMs`）・`checkDisplayAction`（名前・組の数・欄の名前・バイト数）・`parseDisplayLine`（知らない `type`・知らない項目を落とさない・JSON でない行は `null`）・受け口の schema に `paneId` が無いこと・`METHOD_SCHEMAS` の表。
  - server: `TokenBucket`（偽の時計。続けて 10 回は通り 11 回目は落ちる・1 秒で戻る）・`DisplayService`（新規と置き換えの `rev`・数と合計の上限・頻度・`close`/`all`/`ttl`/`pane.closed`・列の `seq` とあふれ・`wait` の 4 つの分岐〔`epoch` 違い・すぐ返す・待って起きる・時間切れ〕・待ちの上限・
    `signal` の abort と `clientId` の切断で待ちが外れる・`subscribe`/`renderers`/`onClientGone`・`get`/`action`/`dismiss` の権限・操作の頻度の超過は捨てて成功・`features` の `epoch`・`dispose`・`pane.closed` の処理の中で例外が出ても bus の次の購読者が動く）。
  - cli: 引数の解析（中身の指定は 1 つだけ・`--format` は標準入力のときだけで省くと `text`・どれも無くて標準入力が端末なら誤り・標準入力は 1 MiB まで読んで 256 KiB 超は誤り・要求の 1 行が 1 MiB を超える中身は誤り・`--size` の範囲・`--all` と名前の排他・`--machine` に `--pane` が要る）・
    経路の選択（呼び出し元と違う `--pane` は `/ws`・受け口の `unknown_op` は `/ws` を呼ばずに `unsupported`）・`/ws` の `not_found` の見分け・`runWaitLoop`（`epoch` を必ず渡す・`dropped`・`reset`・繋ぎ直しの 5 秒・途中の `not_found`・`--timeout`・stdout が閉じた）。受け口・`/ws`・時計は差し替える。
  - web: `frameMessages.ts`・`displayLayout.ts`・`frameRegistry.ts`・`store/display.ts`・`DisplayController`（購読・イベント・取得の 1 本化・古い世代の破棄・古いサーバ）・`DisplayFrame.vue`（送り主の違う `message`・2 回目の `display-ready`・`load` の 2 回目で作り直す・port 以外を受けない・フォーカスのある枠が消えたら端末へ戻す）・
    `PanePanel.vue`（タブ・たたむ・固定のラベル・題が文字・［×］とたたむが `button`）・`PaneBands.vue`・`sanitize.js`（`?raw` で読み込んで評価する）。
- **結合**（実サーバ。vitest がソースから動かす）: 受け口（`paneSocket.integration.test.ts`）・`/ws`（`display.integration.test.ts`）・中継越し（`machines.integration.test.ts` の方式）・`HttpServer.integration.test.ts`（`/display-view/*`）・cli（`packages/cli/src/display.integration.test.ts`: 受け口〔ログインなし〕と `/ws`〔ログイン済み・`--pane`〕の両方）。
- **E2E**（実ブラウザ。`.aidev/conventions/e2e-observe-browser.md` に従う）: 合否は、ブラウザの DOM・枠の中の DOM（`page.frameLocator("iframe[data-display-frame]")`）・要素の箱（`boundingBox`）・ブラウザが送った要求
  （`client.view` の列数は `support/panes.ts` の `watchClientView`、`display.action`・入力のフレームは CDP の記録）・ブラウザの要求の記録（`page.on("request")`）で判定する。
  テスト自身の接続は、pane の用意と、サーバ側の確かめ（PTY の列数）にだけ使う。**テストの接続に `display.updated` が届いたことを、画面に出た合図にしない**（枠の中の DOM を待つ）。固定時間の待ちを根拠にしない。
  端末（WebGL）の文字は DOM から読めないので、「打ったキーが pane に届いた」は、ブラウザが送った入力のフレームで見て、spec のコメントに書く。
  sodactl は、ビルドした `packages/cli/dist/main.js` を子プロセスで動かす（`support/display.ts`）。
- **起動確認**: `handoffSmoke.ts` に 1 段（T19）。`aidev smoke` は、作業フォルダの外の worktree で流す（AGENTS.md）。
- **負の対照**（`.aidev/conventions/regression-negative-control.md`）: T21。対策を外した版でテストが落ちることを確かめ、生の出力を `test-result.md` に残す（test 工程で消化する。`decisions.md` D17）。
- 実装のセッションは、最後に `pnpm build`・`pnpm typecheck`・`pnpm test` と、`packages/e2e` の新しい 3 つの spec（`display.spec.ts`・`display-isolation.spec.ts`・`display-mobile.spec.ts`）・既存の `ask-view.spec.ts`・`resize-handles.spec.ts`・`workspace-tab-pane.spec.ts`・`mobile.spec.ts`・`key-bindings.spec.ts`
  （`PaneFrame`・`MobileShell`・キーの表を触るため）を流して、結果（出力と終了コードを別々に）を報告する。

## タスク

独立点検（`taskcheck`）を掛けるのは T1・T2・T3・T4・T6・T7・T8・T10。

- [ ] T1: protocol の型・定数・検査を新しいファイルに作る: design「定数と型」の全部（`DISPLAY_*` の定数・`DisplayInfo`・`DisplayContent`・`DisplayRenderers`・`DisplayLimits`・`DisplayFeatures`〔`epoch` つき〕・`DisplaySetBody`・`DisplaySetResult`・`DisplayWaitResult`・`DisplayEvent`・`DisplayClosedReason`・`DisplayLine`）と、
      `checkDisplaySet`・`checkDisplayAction`・`displayLimits`・`parseDisplayLine`。題は制御文字を拒否し、前後の空白を除く。中身のバイト数は UTF-8 で数える。`index.ts` から export。単体テスト（上限のちょうどと超過・知らない `type` と項目を落とさない）
      対象: `packages/protocol/src/display.ts`（新規）、`packages/protocol/src/display.test.ts`（新規）、`packages/protocol/src/index.ts` / 根拠: design「定数と型」、手本は `packages/protocol/src/ask.ts`（定数と手書きの検査）
      依存: なし
      AC: AC23, AC25
      点検: あり
- [ ] T2: protocol の通信: `/ws` の 9 つの方式の引数の zod schema と結果（`display.set`・`close`・`list`・`wait`・`features`・`subscribe`・`get`・`action`・`dismiss`）を `METHOD_SCHEMAS`・`MethodResultMap` に足す。`display.close` と `display.dismiss` は「どちらか 1 つ」を `superRefine` で検査。`display.wait` の `timeoutMs` は 1,000〜60,000・`names` は 8 個まで。
      受け口の操作の名前の定数 5 つと、`paneId` を除いた schema（`PaneDisplaySetParams` など）。イベント `display.updated`・`display.removed` を `ServerEvent` に。エラーの code `invalid_display`・`display_limit`・`display_busy`・`display_closed`。
      `clientError.ts` に 4 つの code の日本語。テスト（表に載っていること・受け口の schema が `paneId` を受け取らない＝ `strict` で拒否すること）
      対象: `packages/protocol/src/messages.ts:920` 付近（`METHOD_SCHEMAS`）・`1017` 付近（`MethodResultMap`）、`packages/protocol/src/paneSocket.ts`（`PANE_OP_ASK_OPEN` の近く）、`packages/protocol/src/events.ts`（`AskOpenedEvent` の近く・`ServerEvent`）、`packages/protocol/src/errors.ts:84-86` の後、`packages/client-core/src/net/clientError.ts:96` 付近、`packages/protocol/src/messages.test.ts`・`paneSocket.test.ts` / 根拠: research A6、design「操作」
      依存: T1
      AC: AC14, AC23
      点検: あり
- [ ] T3: server の台帳: `TokenBucket`（`take(now): boolean`。`perSec`・`burst`）と `DisplayService`（design「サーバ: `DisplayService`」のとおり。`set`・`close`・`list`・`wait`・`features`・`subscribe`・`get`・`action`・`dismiss`・`onClientGone`・`dispose`、bus の `pane.closed` の購読〔処理の中を `try` で囲み、例外はログに残して続ける〕、`ttl` のタイマー、pane ごとの列と `seq`、`epoch`）。
      時計・id の生成は差し替えられる形にする。サーバはファイルを読まない・外へ通信しない（`node:fs`・`node:http`・`node:https`・`node:net` を import しない）。ログに中身・題・値を書かない。規則の外は `RpcError` で投げる（ほかの例外を投げない）。単体テスト（「テスト方針」の server の項目の全部）
      対象: `packages/server/src/display/DisplayService.ts`（新規）、`packages/server/src/display/rateLimit.ts`（新規）、各 `.test.ts`（新規） / 根拠: research A5（手本は `packages/server/src/ask/AskService.ts` の `subscribers`・`pane.closed` の購読・`onClientGone`・`dispose`）
      依存: T2
      AC: AC2, AC3, AC8, AC12, AC13, AC20, AC22, AC25
      点検: あり
- [ ] T4: server の登録と配線: 受け口の操作 5 つ（`ctx.paneId` だけを対象に。`displayWaitOp` は `{ signal: ctx.signal }`）、`/ws` の方式 9 つ（`display.wait` は `{ clientId: ctx.clientId }`。`subscribe`・`get`・`action`・`dismiss` は `ctx.clientId`。handler は `RpcError` 以外を投げない）、
      `composeServer.ts`（`DisplayService` の組み立て〔`isScreenKind` は `AskService` に渡している `isBrowserKind` と同じ関数〕・`paneOps.register` × 5・`registerAllMethods` の依存・2 つの `onClientGone`・`close()` の `finally` で `dispose`）、`MethodDeps`、`testkit.ts` の export（E2E・結合テストが要るもの）。
      結合テスト: 受け口（ログインなしで `set` → `list` → `wait`〔`/ws` から `action` を入れて起きる〕・**pane A を名乗って、pane B の面の名前で `close`/`list`/`wait` しても B に届かない。さらに、引数（`params`）に `paneId: <B の id>` を載せて送っても B に届かない**（通常の版では、受け口の schema が知らない項目として `invalid_params` で断る。T21 (a) の対になる筋）・待ちの上限 `display_busy`・接続を切ると待ちが外れる）、
      `/ws`（名乗り → `display.updated` → `get` → `action` → `dismiss` → `display.removed`・名乗らない接続の `get` は `display_closed`・`external` の `subscribe` は `invalid_params`・pane を閉じると面が消える）、中継越し（別のマシンの pane の面が、中継の接続の `display.subscribe` に出る）
      対象: `packages/server/src/panesocket/displayOps.ts`（新規）、`packages/server/src/surface/methods/display.ts`（新規）、`packages/server/src/surface/methods/index.ts`・`deps.ts`、`packages/server/src/composeServer.ts:334-352`（組み立てと登録）・`411`（`registerAllMethods`）・`460-475`（`onClientGone`）・`close()`、`packages/server/src/testkit.ts`、
      `packages/server/src/panesocket/paneSocket.integration.test.ts`、`packages/server/src/display/display.integration.test.ts`（新規）、`packages/server/src/machine/machines.integration.test.ts` / 根拠: research A1〜A4
      依存: T3
      AC: AC1, AC3, AC14, AC26
      点検: あり
- [ ] T5: sodactl の `display` の引数の全部と、`set`・`close`・`list`・`--features` の実行: `USAGE_LINES`（design「sodactl」の 6 行。`wait`・`events`・`--wait` も含む）・`Command` の union・`parseCommand`（中身の指定は 1 つだけ・`--format` は標準入力のときだけで省くと `text`・`--size` の範囲・`--all` と名前は排他・`--machine` には `--pane` が要る・`--since` と `--epoch` は組）、
      `main.ts` の switch と `printHelp`（`wait`・`events`・`set --wait` の実行は T6。T5 の時点では「未実装」の誤りで終わってよい）、
      `commands/display.ts`（ファイルと標準入力の読み込み〔通常ファイル・256 KiB・UTF-8。標準入力は 1 MiB まで読む。どれも無くて標準入力が端末なら使い方の誤り〕・送る前の `checkDisplaySet` と「要求の 1 行が 1 MiB を超えない」の確かめ・
      経路の包み〔受け口の `unknown_op` は `/ws` へ落とさずに古いサーバとする。繋げない・`bad_request` は `/ws` へ落ちる。`callPaneOp` の結果を見る。`viaPaneSocketOrSession` をそのままは使わない〕・呼び出し元と違う `--pane` は受け口を使わない・
      `invalid_display` は使い方の誤りに読み替える・`/ws` の `not_found` を受けたら `display.features` で古いサーバと「pane が無い」を見分ける・古いサーバは `{"status":"unsupported",…}` で終了コード 0・`--features` は常に終了コード 0）、SKILL.md（`USAGE_LINES` に合わせる分）。
      単体テスト（受け口と `/ws` を差し替える。ログインなしの pane の中で、受け口が `unknown_op` → `unsupported`・終了コード 0 になること〔`/ws` を呼ばない〕を含む）と、
      結合テスト（実サーバ: ログインなし・受け口の経路で `set` → `list` → `close` → `--features`、ログイン済み・`SODA_PANE_SOCKET` なし・`--pane <id>` の `/ws` の経路で `set` → `list`〔AC26〕・無い pane の `--pane` は `not_found` で終了コード 1）
      対象: `packages/cli/src/cliArgs.ts`（`USAGE_LINES`・`Command`・`parseCommand` の `ask` の近く）、`packages/cli/src/main.ts`、`packages/cli/src/commands/display.ts`（新規）、`packages/cli/src/commands/display.test.ts`（新規）、`packages/cli/src/display.integration.test.ts`（新規）、`packages/cli/src/cliArgs.test.ts`、`packages/cli/skills/sodactl/SKILL.md`
      / 根拠: research A14（手本は `commands/ask.ts` の `runAsk`・`runFeatures`・`probeServer`、`packages/cli/src/paneSocket.ts` の `callPaneOp`・`paneSocketFor`）
      依存: T4
      AC: AC1, AC2, AC3, AC20, AC21, AC22, AC26
- [ ] T6: sodactl の `display wait`・`display events`・`set --wait` の実行: `runWaitLoop`（design「sodactl」の「`wait`・`events` の繰り返し」のとおり。まず `display.features` で `epoch` を得る〔古いサーバもここで分かる〕・`events` は最初の行 `display.ready`・
      **`display.wait` には必ず `epoch` を渡す**・1 回の待ちは 30 秒で、空なら次を呼ぶ・`dropped`・`reset`・5 秒の繋ぎ直し〔受け口の `connection_closed`・`ECONNREFUSED`・`pane_socket_busy`、`/ws` の切断〕・
      途中の `not_found` は `pane_closed`・stdout が閉じたら終了コード 1・`--timeout` は全体の待ち時間で、省くと待ち続ける）。`set --wait` は `set` の結果の `epoch`・`next` から待つ。終了コードは design の表。`main.ts` の「未実装」を実行につなぐ。単体テスト（時計と受け口を差し替える）と、
      結合テスト（実サーバ: 受け口の経路で `events` を起動 → `/ws` から `action` → 行が出る・`/ws` の経路〔`SODA_PANE_SOCKET` なし・ログイン済み・`--pane`〕でも同じ・`wait <名前>` が 1 行出して終わる・pane を閉じると `display.end`〔`pane_closed`〕で終了コード 0）
      対象: `packages/cli/src/commands/display.ts`（T5 のファイル）、`packages/cli/src/commands/display.test.ts`、`packages/cli/src/display.integration.test.ts`（T5 のファイル）、`packages/cli/src/main.ts`、`packages/cli/src/paneSocket.ts`（`callPaneOp` の繋ぎ直しを使う。変えるなら `connection_closed` を呼び出し側で扱えるようにするだけ）
      / 根拠: research R7（NDJSON を出し続ける先例は `packages/cli/src/commands/sessionStream.ts`）
      依存: T5
      AC: AC10, AC12, AC21, AC24, AC26
      点検: あり
- [ ] T7: 枠の静的ページ: `frame.html`（既定のスタイル・4 つの `<script src>`）・`sanitize.js`（`self.__sodaDisplaySanitize(root)`。design「静的ページ」の消す要素・消す属性・`a`・`img`・`form` の決まり）・
      `frame.js`（`display-init` を親から 1 回だけ・port・`render` の 3 つの形・差し替えの前後でスクロールと欄の値を保つ・**フォーカスの持ち越しは、枠の文書が既にフォーカスを持つ〔`document.hasFocus()`〕ときだけ**・`click` と `submit` の拾い方〔`submit` は必ず `preventDefault()`〕・
      `Esc` と、`render` で渡された `relayKeys` に一致するキー（prefix）の取り次ぎ・`focus`・壊れた中身は `<pre>`）。
      `sanitize.js` の単体テスト（`?raw` で読み込んで評価。消える要素と属性の一覧・`javascript:` と `data:` のリンクが外れる・`http(s)` は `_blank`・`data:image/png` の `img` は残り外の `src` は外れる・`form` の `action` が消える・`autofocus` が消える・SVG の `a` と SMIL が消える）
      対象: `packages/web/public/display-view/frame.html`・`frame.js`・`sanitize.js`（新規）、`packages/web/src/display/displayViewSanitize.test.ts`（新規） / 根拠: research A8（手本は `packages/web/public/ask-view/markdown.js:37` `sanitize`・`keys.js`・`links.js`。読み込むだけで、書き換えない）、テストの型は `packages/web/src/ask/askViewLinks.test.ts:1`
      依存: T1
      AC: AC6, AC11, AC16, AC17, AC19
      点検: あり
- [ ] T8: 静的ページの配信: `HttpServer.handle` に `/display-view/` の経路（許可リスト `frame.html`・`frame.js`・`sanitize.js`。GET・HEAD だけ。`frame.html` は design の CSP と `X-Frame-Options: SAMEORIGIN`、`.js` は CSP と `X-Frame-Options` を外す）。
      定数 `DISPLAY_VIEW_CSP` を export（テストと負の対照が読む）。統合テスト（ヘッダが design の文字列と一致・**全体に `allow-same-origin` が無い・`script-src` の指定が `'self'` だけ**〔`'unsafe-inline'`・`'unsafe-eval'` は `script-src` に無い。`style-src 'unsafe-inline'` はある〕・
      許可リストの外と `/display-view/` は 404・POST は 405・**アプリ本体と `/ask-view/*` のヘッダが変わっていない**）。テストは、一時の配布フォルダに `display-view/frame.html` などを自分で書いて用意する（既存の `/ask-view/*` のテストと同じ。`HttpServer.integration.test.ts:154-156`）ので、T7 のファイルを待たない
      対象: `packages/server/src/http/HttpServer.ts:49-52`（定数）・`132`（経路）・`137-160`（`handleAskView` の隣）、`packages/server/src/http/HttpServer.integration.test.ts:149` の後 / 根拠: research A7
      依存: なし
      AC: AC15, AC16, AC17
      点検: あり
- [ ] T9: web の状態と通信: `useDisplayStore`（`infos`・`contents`・`collapsed`・`activePanel`・`panelsOf`・`bandsOf`）、`DisplayController`（`onOpened` で `display.subscribe {features:["panel","band","actions"]}`・`onClosed`・`resetForMachineSwitch`・`onEvent`・`ensureContent`〔同じ id は 1 本・古い世代を捨てる・`display_closed` は消えた扱い〕・`sendAction`〔毎秒 20 回で捨てる〕・`dismiss`。
      古いサーバ〔`not_found`〕では何もしない）、`StoreAdapter` の case とコールバック `onDisplayEvent`、`main.ts` の配線（作る・`onOpened`/`onClosed`・マシンの切り替え・`provide`）、`injection.ts` のキー `DisplayControllerKey`。単体テスト
      対象: `packages/web/src/store/display.ts`（新規）、`packages/web/src/display/DisplayController.ts`（新規）、各 `.test.ts`、`packages/web/src/store/StoreAdapter.ts:51`・`200-202`、`packages/web/src/main.ts:133`・`198`・`298-299`・`398`・`519`、`packages/web/src/injection.ts` / 根拠: research A11（手本は `packages/web/src/ask/AskController.ts`・`store/ask.ts`）
      依存: T2
      AC: AC1, AC3, AC22
- [ ] T10: web の枠の部品: `frameMessages.ts`（`readFrameMessage`・型 `FrameMessage`。design「枠とのやりとり」5）、`themeVars.ts`（`readThemeVars`）、`frameRegistry.ts`（面の id → `{ focusInside(): void }` の登録簿。`registerFrame(id, api)`・`unregisterFrame(id)`・`focusFrame(id): boolean`。T14 の `ActionDispatcher` がここから枠へ届く）、
      `DisplayFrame.vue`（iframe〔定数 `DISPLAY_VIEW_SANDBOX`・`DISPLAY_VIEW_PAGE` を export。`data-display-frame` と、`load` の回数を出す `data-display-loads`〕・`display-ready` を、送り主・状態・`load` が 1 回以下、で 1 回だけ受ける・`MessageChannel` を渡す・以後は port だけ・
      `render` を中身と `rev` の変化で送る〔`relayKeys` は、設定のストアの解決済みのキーの表の prefix を `chordToKeyInput`（`packages/client-core/src/keys/chord.ts:388`）で `{key, ctrl, alt, shift, meta}` にしたもの 1 つ〕・`action` を `DisplayController.sendAction` へ・
      `key` の `escape` は `focusPaneIfShown`、`prefix` は端末へ戻して `keyInput.injectPrefix()`・`load` の 2 回目で作り直す〔1 分に 3 回まで。超えたら固定の文言〕・10 秒で `display-ready` が来なければ固定の文言・載っている間は `frameRegistry` に登録・
      片づけで port を閉じ、**フォーカスがその枠にあれば pane の端末へ戻す**）。単体テスト（別の窓からの `message`・形の違うもの・上限の超過・2 回目の `display-ready`・`load` の 2 回目・port 以外の経路の `action` が `sendAction` を呼ばない・フォーカスのある枠が外れると端末へ戻す関数が呼ばれる）
      対象: `packages/web/src/display/frameMessages.ts`・`themeVars.ts`・`frameRegistry.ts`（新規）、`packages/web/src/components/DisplayFrame.vue`（新規）、各 `.test.ts` / 根拠: research A8（手本は `packages/web/src/components/AskViewer.vue` の `onMessage`）、A13（`packages/web/src/keys/KeyInputController.ts:190`）、`packages/web/src/actions/paneFocus.ts` の `focusPaneIfShown`
      依存: T7, T9
      AC: AC2, AC10, AC18, AC19, AC-I4, AC-I5
      点検: あり
- [ ] T11: パネル・帯の部品（まだ pane には差し込まない）: `displayLayout.ts`（`panelWidth`・`visibleBands`。純粋）、`PanePanel.vue`（props: `paneId`・`paneWidthPx`・`cellWidthPx`。`role="complementary"`・固定のラベル「pane のプログラムの表示（隔離）· 〈面の名前〉」・題は `textContent`・
      タブ〔`role="tablist"`。矢印・`Home`・`End`〕・たたむ〔`button`。幅 24px の見出しだけにする。自動でたたむ条件は `panelWidth`〕・［×］〔`button`。`dismiss {id}`〕・選ばれた面の `DisplayFrame`・載ったときと戻したときに `ensureContent`）、
      `PaneBands.vue`（props: `paneId`・`paneHeightPx`。1 本ごとに固定の印・`DisplayFrame`・［×］。あふれは「ほか N 件」）。単体テスト（`displayLayout` の境目・タブのキー・ラベルが題で変わらない・［×］とたたむが `button` で `Enter` で効く）
      対象: `packages/web/src/display/displayLayout.ts`（新規）、`packages/web/src/components/PanePanel.vue`・`PaneBands.vue`（新規）、各 `.test.ts` / 根拠: research R3・R8、design「ブラウザ」
      依存: T10
      AC: AC5, AC7, AC8, AC25, AC-I1, AC-I2
- [ ] T12: pane への差し込みと、まとめて閉じる: `PaneFrame.vue`（`enabled` のときだけ: `.pane-frame-body` を縦の flex にし、`PaneBands` と、`.pane-frame-row` の中の `.pane-frame-main`〔この中に `<slot />`〕・`PanePanel`。葉の CSS には触らない。
      pane の幅・高さは、`.pane-frame-body` に張った `ResizeObserver` で測って部品へ渡す。セルの幅は、その pane の端末から `getCellSize`〔`packages/web/src/term/measure.ts:30`〕で取り、取れなければ 9）、
      右クリックのメニュー「表示をすべて閉じる」（面があるときだけ）と `ActionDispatcher.dismissDisplays(paneId)`。単体テスト（`enabled=false` で何も描かない・面が無ければ DOM が今までと同じ・既存の `PaneFrame.test.ts`・`PaneLayout.test.ts` が通る）
      対象: `packages/web/src/components/PaneFrame.vue:305`（`.pane-frame-body`）・`478`（CSS）、`packages/web/src/components/PaneFrame.test.ts`、`packages/web/src/components/ContextMenu.vue:61-70`、`packages/web/src/actions/ActionDispatcher.ts` / 根拠: research A9・A12、R3
      依存: T11
      AC: AC4, AC8
- [ ] T13: 最初の E2E と helper（不確かな点 1・2 の確かめ）: helper `support/display.ts`（`runDisplay(appServer, paneId, args, { stdin?, login? })`: ビルドした sodactl を `["display", …]` で子プロセスに。ログインなしはテストのサーバの `SODA_PANE_SOCKET` を渡す。`spawnAsk` と同じく、走らせた人の環境の値を消す。
      出し続けるコマンド用に、行を 1 つずつ待てる形〔`nextLine()`〕も。CDP でブラウザが送った `display.action` を数える `watchSentDisplayActions(page)`）。spec の最初の筋: ログインなしの `set --kind panel` と `--kind band` で、枠の中に中身が出る（`frameLocator`）・パネルの箱が端末の箱の右・帯の箱が端末の箱の上・
      枠の `sandbox` 属性が `DISPLAY_VIEW_SANDBOX`。あわせて、(a) 中身が port 経由で届いている（＝`MessagePort` を渡せた）こと、(b) `frame.evaluate(() => 1 + 1)` が枠の文書の中で動くか、を確かめ、結果を `decisions.md` に 1 行残す（だめなら「作業順序」の 1・2 の代えを採る）
      対象: `packages/e2e/src/support/display.ts`（新規。手本は `packages/e2e/src/support/ask.ts:54` `spawnAsk`・`askSent.ts`）、`packages/e2e/src/specs/display.spec.ts`（新規）/ 根拠: research A15
      依存: T5, T8, T12
      AC: AC1
- [ ] T14: キーの操作とフォーカス: `ACTIONS` に `focus_display`（既定 `prefix+i`。`group: "pane"`・`action: { type: "focusDisplay" }`）、`keys/actions.ts` の種類、web の `ActionDispatcher`（フォーカス中の pane の、選ばれているパネル〔たたんであれば戻して、描かれるのを待つ〕。パネルが無ければ最初の帯。その面の id で `frameRegistry.focusFrame(id)`。面が無ければトースト「この pane に表示はありません」）、
      端末版は「ブラウザで使えます」の知らせ（`openGraph` と同じ形）。既存のキーの検査（既定どうしの衝突・プリセットとの衝突・`bindings.test.ts`・`presets.test.ts`・`keymap.test.ts`）が通ること。
      `prefix+i` がどれかと衝突するなら、別の空いているキー（`prefix+u`）にして、requirements の AC-I3 の括弧・T16 (13)・T20 の文書をその値に合わせ、`decisions.md` に書く（既定を空にはしない）
      対象: `packages/client-core/src/keys/bindings.ts:79-86` の近く（`open_graph` が手本）、`packages/client-core/src/keys/actions.ts:94` の近く、`packages/web/src/actions/ActionDispatcher.ts:264` の近く、`packages/tui/src/actions/TuiDispatcher.ts:257` の近く、各テスト / 根拠: research A13
      依存: T12
      AC: AC-I3, AC-I4
- [ ] T15: モバイル: `MobileShell.vue` に、`.mobile-shell-bar` と `.mobile-shell-pane` の間の `PaneBands`（フォーカス中の pane の分）と、バーのボタン（パネルがあるときだけ。「表示」と件数）。`MobileDisplaySheet.vue`（`<dialog>`。固定のラベル・タブ・［閉じる］でシートだけ閉じる・［この表示を消す］で `dismiss`・`DisplayFrame`）。
      パネルを出しても `.mobile-shell-pane` の箱が変わらないこと。単体テスト
      対象: `packages/web/src/mobile/MobileShell.vue:81`・`94`、`packages/web/src/mobile/MobileDisplaySheet.vue`（新規）と `.test.ts` / 根拠: research A10、R3
      依存: T12
      AC: AC9
- [ ] T16: E2E（出す・更新する・閉じる・操作）。`display.spec.ts` に足す:
      (2) 同じ名前の `set` で中身が替わり、枠の要素が同じ（作り直されない。`data-display-loads` が 1 のまま）・スクロールと入力途中の欄の値が残る・`rev` が増える。**2 回目の `set` は、標準入力と `--format html` で渡す**（`--html-file` と同じに出る）、
      (3) パネルを出すとブラウザが送る `client.view` の列数が減り、サーバの PTY の列数も減る。たたむ・閉じると戻る。端末の箱とパネルの箱が重ならない、(4) パネル 2 つでタブ・帯 2 本で縦積み、
      (5) `text` の `<b>` が文字のまま・`markdown` が整形され mermaid はコードのまま・`html` の CSS が効く・`http(s)` のリンクは `target=_blank` で、ほかのリンクは `href` が無い、(6) 固定のラベルが、題に HTML や似た文言を書いても変わらない（枠の外の要素の文字を見る）、
      (7) ［×］で消えて `events` に `dismissed`・右クリックの「表示をすべて閉じる」・**フォーカスが枠の中にある面を閉じると、フォーカスがその pane の端末へ戻り、続けて打ったキーが pane に届く**、
      (8) ボタンで `wait` と `set --wait` が 1 行出して終わる・**フォームの送信で `submit` が拾われて値が届き（不確かな点 3）、枠の URL が変わらず、外への要求が無い**・**`markdown` の中の `<button data-soda-action>` も届く（不確かな点 4）**、
      (9) 2 つのブラウザ: 両方に出る・どちらで押しても 1 件・古い中身の画面で押すと古い `rev`、(10) 画面が無いとき `set` の `renderers` が 0 で、後から開くと出る・`--features` の数（画面あり・なし）、(11) `close`・`--all`・`--ttl-ms`・pane を閉じると消える。無い名前の `close` は `closed: []`、
      (12) 幅の丸め（狭い pane で半分まで・40 列を下回ると自動でたたむ）と帯の「ほか N 件」、(13) キーボード: `prefix+i` で枠へ → `Tab` → `Enter` で操作が届く → `Esc` で端末へ戻り、続けて打ったキーが pane に届く。枠の中で prefix を押すと端末へ戻って prefix の状態になる（続くキーが操作になる）。
      タブを矢印で切り替える。**見出しの［×］・たたむに `Tab` で届き、`Enter` で効く**、(14) 面を出した状態で既存の操作が動く: 枠の上でホイールを回すと枠の中がスクロールし、端末のスクロール位置（`.xterm-viewport` の `scrollTop`）は変わらない・分割の境をドラッグすると `client.view` が変わる・
      拡大（zoom）してもパネルが出ている・コピーモードに入れる（既存の spec の観測の仕方に合わせる）
      対象: `packages/e2e/src/specs/display.spec.ts`（T13 のファイル）、`packages/e2e/src/support/display.ts`、`packages/e2e/src/support/panes.ts`（`watchClientView` を使う）/ 根拠: research A15
      依存: T6, T13, T14
      AC: AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC10, AC11, AC12, AC13, AC20, AC22, AC25, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T17: E2E（隔離）: (1) 枠の `sandbox` 属性と応答ヘッダに `allow-same-origin` が無い。枠の文書の中で式を評価して（`frame.evaluate`）、`parent.document`・`document.cookie`・`localStorage` が SecurityError、`fetch`・`new WebSocket(アプリの /ws)` が拒否される（`frame.evaluate` が使えないと T13 で分かった場合は、「作業順序」の 2 の代えと、未検証の穴の記録）、
      (2) 中身の `<script>`・`<img src="data:image/png;base64,（壊れた値）" onerror=…>`（読み込みに失敗して、操作なしで `onerror` が起きる形）・`<button onclick>`（押す）・`<a href="javascript:…">`（押す）が動かない（枠の文書に実行の印が付かない。`markdown` でも同じ）。
      **通常の版では、CSP の違反が出ることは合否にしない**（取り除きが先に消す。違反の記録は T21 の (c1) で見る）。なお、`<script>` の要素は、中身を `DOMParser`・`<template>` を通して差し込むので、守りを外しても実行されない見込み（HTML の仕様の理解。実測していない）。
      負の対照で落ちるのは、イベント属性（`onerror`・`onclick`）の筋、
      (3) 外の画像・`<link rel=stylesheet>`・`@import`・`url()` の背景・フォントへの要求が 0（`page.on("request")`。テストが立てた待ち受けにも届かない）、
      (4) `<meta http-equiv=refresh>`・`<form action=外>` の送信・`<base>`・`<iframe>`・`<object>`・`<embed>` で枠が移らない（`data-display-loads` が 1 のまま・枠の URL が `/display-view/frame.html` のまま）・外を読まない、
      (5) 親のページに別の iframe を作って、同じ形の `message`（`display-ready`・`action`）を送っても、ブラウザは `display.action` を送らない、
      (6) **枠が移った場合の扱い**（H4）: Playwright で枠を別の URL へ移す（`frame.goto`。`/display-view/frame.html?moved` など）と、親が枠を作り直し（iframe の要素が替わる）、中身が出直す。移った先の文書から `parent.postMessage` で `display-ready`・`action` を送っても、`display.action` は送られない。作り直しが 1 分に 3 回を超えると、固定の文言になる、
      (7) 端末にフォーカスを置いて、`autofocus` つきの中身を `set` → 更新 → もう一度 `set`。その間に打った文字が全部 pane に届き（ブラウザが送った入力のフレーム）、`document.activeElement` が iframe でない、
      (8) 同じことを、**フォーカスを奪い続ける中身**で行う: 壊れた `data:` の `img` の `onerror`（操作なしで起きる）から、`setInterval` で `window.focus()` と欄の `focus()` を 50ms ごとに繰り返す（`<script>` の要素では書かない。上の理由で、守りを外しても動かないため）。
      通常の版ではイベント属性が動かないので、打った文字が全部 pane に届く（T21 の (c3) の対になる筋）、
      (9) 既存の `ask-view.spec.ts` が通る（`/ask-view/*` を壊していない）
      対象: `packages/e2e/src/specs/display-isolation.spec.ts`（新規。手本は `packages/e2e/src/specs/ask-view.spec.ts`）
      依存: T16
      AC: AC15, AC16, AC17, AC18, AC19
- [ ] T18: E2E（モバイル）: 幅 767px 以下の画面（既存の `mobile.spec.ts`・`ask-form-mobile.spec.ts` の立て方）で、パネルを `set` しても端末の横に出ず、バーのボタンから重ね表示が開いて枠の中身が出る。帯は端末の上に出る。パネルの前後で、ブラウザが送る `client.view` の列数が変わらない
      対象: `packages/e2e/src/specs/display-mobile.spec.ts`（新規）
      依存: T13, T15
      AC: AC9
- [ ] T19: 起動確認: `handoffSmoke.ts` に 1 段。入れ替えの前に、ビルドした `sodactl display set` で面を出し、`sodactl display events` を子プロセスで待たせる → 実物の `soda handoff` → `events` が終わらずに `display.reset` の行を出す → `display list` が空 → `set` で出し直すと `list` に出る →
      **出し直した面を `display close` すると、待ち続けている `events` に `display.closed`（`closed`）の行が出る**（入れ替えの後の出来事を受け取れている）→ サーバを止めると、`events` が `display.end`（`connection_closed`）を出して終了コード 1。
      ログインなし（受け口の経路）で行う。Windows では何もしない（既存の段と同じ）
      対象: `packages/server/src/handoffSmoke.ts:145-170`（`runSodactlAsk` の近くに `display` 用の起動）・`299` の段の後 / 根拠: research A16
      依存: T6
      AC: AC24
- [ ] T20: 文書: `docs/display.md`（新規: 使い方と例〔帯の 1 行・パネルと `set --wait`・`events` の読み方〕・中身の 3 つの形・`data-soda-action` と `data-soda-value` とフォーム・枠の中で使える CSS の変数・行の決まり〔知らない `type` と項目は無視〕と行の一覧・終了コード・どの画面に出るか・モバイル・キーの操作・
      隔離の仕組み〔sandbox・CSP・取り除く要素と属性・通り道〕・**限界**〔design「残る限界」の全部と、「秘密を面の欄に打たせない」「スクリプトは動かない」「`soda handoff`・再起動で消える」〕・上限の一覧・新旧の表・別のマシン・Windows）、
      `docs/sodactl.md`（コマンド一覧・「サーバ側の上限」・「ログイン不要の受け口」の「今載っている操作」と 4 条件の表・`display` の節は `docs/display.md` への案内）、`docs/verification.md`（手で確かめる手順）、`docs/tui-parity.md` と `docs/tui.md`（端末版は面を出さない・`focus_display` は知らせだけ）、
      `packages/cli/skills/sodactl/SKILL.md`（エージェント向けの使い方。T5 で `USAGE_LINES` に合わせた分に、例と「機能の問い合わせをしてから使う」を足す）、`AGENTS.md` の案内の 1 行。不確かな点 3・4 の結果（`allow-forms`・`markdown` の中の操作）を、決まった形で書く
      対象: `docs/display.md`（新規）、`docs/sodactl.md:21`（コマンド一覧）・`213`（上限）・`718`（受け口）、`docs/verification.md`、`docs/tui-parity.md`、`docs/tui.md:137` の近く、`packages/cli/skills/sodactl/SKILL.md`、`AGENTS.md`
      依存: T16, T17
      AC: AC27
- [ ] T21: 負の対照（test 工程で消化する）: 次の版（7 つ）で、対応するテストが落ちる（または、二重の守りの片方だけ外した版では**落ちない**）ことを確かめ、戻して通ることも確かめ、生の出力を `test-result.md` に残す。
      (a) 受け口の `displayCloseOp`・`displayListOp`・`displayWaitOp` が、引数の `paneId`（schema にも足す）を対象にする版 → T4 の「引数に `paneId: <B>` を載せて送っても B に届かない」が落ちる、
      (b) `DISPLAY_VIEW_SANDBOX` と `DISPLAY_VIEW_CSP` の両方に `allow-same-origin` を足した版 → T17 (1) が落ちる（T13 で `frame.evaluate` が使えないと分かった場合は、`iframe.contentDocument === null` の筋が落ちる）、
      (c1) `sanitize.js` の `script`・`on*` の取り除きだけを外した版（`autofocus` の取り除きは残す）→ T17 (2)・(8) は**落ちない**（CSP が止める）。このとき、枠のコンソールに CSP の違反が記録されることを確かめる、
      (c2) `DISPLAY_VIEW_CSP` の `script-src` に `'unsafe-inline'` を足しただけの版 → T17 (2)・(8) は**落ちない**（取り除きが消す）、(c3) c1 と c2 の両方 → T17 (2) のイベント属性の筋（`onerror`・`onclick`）と (8) が落ちる（イベント属性が動き、フォーカスを奪う）、
      (d) `DisplayFrame.vue` の送り主の検査（`ev.source`）と port を外し、`window` の `message` をそのまま受ける版 → T17 (5)・(6) の「送られない」と T10 の単体が落ちる、
      (e) `sanitize.js` の `meta` の取り除きを外した版 → T17 (4) の「枠が移らない」が落ちる（`data-display-loads` が増える）。このとき、親が枠を作り直し、移った先から操作が届かないこと（T17 (6) と同じ観測）は保たれる
      対象: `packages/server/src/panesocket/displayOps.ts`、`packages/web/src/components/DisplayFrame.vue`、`packages/server/src/http/HttpServer.ts`（`DISPLAY_VIEW_CSP`）、`packages/web/public/display-view/sanitize.js`、`.aidev/works/20261007-soda-extensions/test-result.md`
      依存: T4, T17
      AC: AC28
