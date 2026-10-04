# タスク: ask-form の画像・音・コード・成果物（view）・edit/rank/table を画面内ダイアログで出す

## 実装方針

design の 3 段（S1 メディア → S2 型 → S3 view）の順に積み、各段の終わりで `pnpm build`・該当パッケージのテストが通る（動く状態）にする。
protocol（型・検査・上限）→ server（読む・取得・台帳・RPC）→ cli → web → E2E の向きに作る。純粋な検査は protocol に置き、サーバとブラウザと sodactl が同じ関数を使う。
独立点検（`aidev taskcheck`）は壊れやすいタスク（protocol の検査 T1・T2・T9、`AskMedia` T3、SSRF の T4、台帳の T5、HTTP ヘッダの T11、取り次ぎの T12）だけに掛け、文書・E2E・見た目だけのタスクは掛けず、最後に `cross` を 1 回掛ける。

## 作業順序と依存関係

下の `依存:` に従う。補足: T9（型）は S1 の protocol が固まってから。T11（静的ページ・ヘッダ）は `HttpServer.ts` を T7 と共有するので T7 の後。T12 は `AskDialog.vue` を T7・T10 と共有するので T10 の後（既存の高さ合わせとの干渉を、型の対応が済んだ後に 1 度に見る）。すべて直列に近いが、対象が重ならない T3/T4（server の読む・取得）と T6（cli）・T1 後の T9 は並行してよい。

## リスク / 留意点

- `resolveMedia` は同期で 1 回だけ呼ばれる → メディアは `store.add` の前に全部揃える（T7）。
- 外部 URL の SSRF は、DNS 解決の検査と接続先 IP の固定を同時にやらないと DNS リバインディングで抜ける（T4）。
- html の枠に `allow-same-origin` を付けると、隔離が全部崩れる（T12 の定数と T13 の負の対照）。
- AskDialog の再構成（view あり: 幅・高さを固定）は既存の高さ合わせ（`applyHeight`）と干渉する。view の無い定義は経路を変えない（既存のテストが守る）。
- 識別子（askId・pane の id）の形に依存しない。

## テスト方針

- 単体: protocol（検査・回答・参照分類・上限の境界）・`mediaSniff`・`AskMedia`・`RemoteImageFetcher`（`lookup`/`request` を差し替え。IP の表）・`AskService`（5 つの閉じ方で `mediaBytes` が 0 に戻る）・`AskController`・`sodactl ask`。
- 結合: `ask.integration.test.ts`（`ask.media`・`ask.features`・購読なしの拒否）・`machines.integration.test.ts` の方式（リモートの中継越し）・`pane.sock` の `ask.features`。
- E2E（実ブラウザ。`e2e-observe-browser`）: DOM の実測（`naturalWidth`・`securitypolicyviolation`・`sandbox` 属性・`parent.document` の SecurityError・枠内のキーが親へ届く）。負の対照（範囲外のパス・巨大ファイル・SVG のスクリプト・SSRF の宛先・`allow-same-origin` を足した版）。音は `Audio` の包みで観測し、コメントに書く。
- 負の対照（`regression-negative-control`）の戻して落ちることの確認と生の出力は test 工程（T15）。

## タスク

独立点検（`taskcheck`）を掛けるのは T1・T2・T3・T4・T5・T9・T11・T12（各タスクの末尾の `点検: あり`）。それ以外は掛けない（AGENTS.md の方針。autonomous の既定は「全タスク」だが、依頼元の指示でプロジェクトの規約を優先する。decisions D5）。

- [ ] T1: protocol の定義: 型・上限の定数・選択肢の `image`/`audio`/`code`/`lang`/`group`・質問の `preview`/`thumb`・全体の `view`（検査）・参照の分類 `classifyMediaRef`・`view` があれば `paging: false`。単体テストと Sodashitsu 用の fixture に例
      対象: `packages/protocol/src/ask.ts`（`normalizeAskSpec`・定数）、`packages/protocol/src/ask.test.ts`、`packages/protocol/src/ask.fixture.json`
      依存: なし
      AC: AC3, AC4
      点検: あり
- [ ] T2: protocol の通信: `ask.media`・`ask.features` の params/result（messages）・`AskPending` に `media`/`view`/`warnings`・`ask.answer` に `edited`・回答の値に辞書・pane.sock の操作名 `PANE_OP_ASK_FEATURES`・`AskResult.edited`
      対象: `packages/protocol/src/messages.ts`（`AskGetParams` の近く・表の 2 か所）、`packages/protocol/src/paneSocket.ts`、`packages/protocol/src/ask.ts`（`AskPending`・`AskResult`）、各 `.test.ts`
      依存: T1
      AC: AC17, AC18
      点検: あり
- [ ] T3: server `mediaSniff`（先頭バイトの判定）と `AskMedia`（ローカル・`data:`・view の読み出し・種類確認・通常ファイルだけ・個数/個別/合計の上限・重複の統合・`media:N` への付け替え）。偽の `RemoteImageFetcher` で外部 URL の分岐も通す
      対象: `packages/server/src/ask/mediaSniff.ts`・`AskMedia.ts`（新規）と各 `.test.ts`
      依存: T1
      AC: AC3, AC4, AC5
      点検: あり
- [ ] T4: server `RemoteImageFetcher`（https/443 のみ・全アドレスの検査・接続先 IP の固定・リダイレクト 3 回の再検査・ヘッダ・時間・サイズ・Content-Type と先頭バイト・同時 4）と `isBlockedAddress`。`lookup`/`request` を差し替えた単体テスト
      対象: `packages/server/src/ask/RemoteImageFetcher.ts`（新規）と `.test.ts`、`mediaSniff.ts`（T3 のものを使う）
      依存: T3
      AC: AC12, AC13, AC14, AC15
      点検: あり
- [ ] T5: server `AskService` の統合: `open` の非同期化（占有を先に取る・`prepare`・中断）・メディアの保持と全体 128 MiB・閉じるときの破棄・`ask.media`/`ask.features`（`/ws` と `pane.sock`）の登録・`composeServer` の `askMedia` 差し替え口・`ask.opened` はメディアが揃ってから。結合テスト（購読なしの拒否・別のマシンの中継越し）
      対象: `packages/server/src/ask/AskService.ts`、`packages/server/src/surface/methods/ask.ts`、`packages/server/src/panesocket/askOp.ts`、`packages/server/src/composeServer.ts`（`AskService` の組み立て付近）、`ask.integration.test.ts`、`packages/server/src/machine/machines.integration.test.ts`、`packages/server/src/ask/AskService.test.ts`（閉じる 5 経路・`mediaBytes`）、`packages/server/src/panesocket/paneSocket.integration.test.ts`（`ask.features`）
      依存: T2, T3, T4
      AC: AC4, AC16, AC17, AC18, AC20
      点検: あり
- [ ] T6: cli `sodactl ask`: 相対パス・`~/` の絶対化（`image`/`audio`/`view.file`）・上限の事前確認（理由つきで終了コード 2）・新しい項目があれば `ask.features` を先に確かめて古いサーバは `unavailable`・`sodactl ask --features`
      対象: `packages/cli/src/commands/ask.ts`、`packages/cli/src/cliArgs.ts`（`ask` の引数）、`ask.test.ts`、`packages/cli/src/cliArgs*.test.ts`
      依存: T2
      AC: AC18, AC19
- [ ] T7: web のメディア: `AskController` が `ask.media` を取り（3 並列・片の連結・`data:` URL・view は文字列）、揃ってから `store.add`。`view` のメディアが取れなければ取り消し。`AskDialog.vue` の `resolveMedia`。CSP に `media-src data:`。単体テスト
      対象: `packages/web/src/ask/AskController.ts`、`packages/web/src/ask/mediaUrl.ts`（新規）、`packages/web/src/store/ask.ts`、`packages/web/src/components/AskDialog.vue`（`loadSpec`）、`packages/server/src/http/HttpServer.ts`（`SECURITY_HEADERS`）、各テスト
      依存: T2
      AC: AC1, AC2, AC12
- [ ] T8: E2E（S1）: 画像（`naturalWidth`・`data:`・違反なし）・音（`Audio` の包み）・`code`/`diff`/`group`/`thumb`・SVG のスクリプトが動かない・範囲外/偽装/巨大/存在しない・上限・SSRF の宛先と偽の取得の成功・失敗（件数の行）・外へのリクエスト 0・`--features`
      対象: `packages/e2e/src/specs/ask-media.spec.ts`（新規）、`packages/e2e/src/support/ask.ts`（`composeServer` の差し替えを渡す口）、`packages/e2e/src/support/appServer.ts`
      依存: T5, T6, T7
      AC: AC1, AC2, AC3, AC4, AC5, AC12, AC13, AC14, AC18
- [ ] T9: protocol の型 `edit`/`rank`/`table`: 検査（`row_default_unknown` 等）・`collectAsk`・`checkAskAnswer`（並べ替え・行と値・`edited`）・`AskFormState` の拡張。単体テスト
      対象: `packages/protocol/src/ask.ts`（`normalizeAskSpec` の型の判定・`valueOf`・`checkAskAnswer`）、`ask.test.ts`、`ask.fixture.json`
      依存: T1, T2
      AC: AC6, AC7
      点検: あり
- [ ] T10: web の型への対応: `AskDialog.vue` が `ask-submit` の `edited` と辞書の回答を送る・サーバの検査の通過・E2E（3 型の操作と `sodactl` の出力・画像との混在）。部品の `supports.fields` と protocol の通す項目の突き合わせのテスト
      対象: `packages/web/src/components/AskDialog.vue`（`onSubmit`）、`packages/web/src/ask/askFormElement.ts`、`packages/web/src/ask/askFormElement.test.ts`、`packages/e2e/src/specs/ask-types.spec.ts`（新規）
      依存: T5, T7, T9
      AC: AC6, AC7
- [ ] T11: 静的ページと配信: `packages/web/public/ask-view/`（`markdown.html`/`.js`・`html.html`/`.js`・`vendor/`・SOURCE.json・ライセンス）・`HttpServer` の `/ask-view/*`（許可リスト・専用ヘッダ）・sha256 の固定テスト・ヘッダの統合テスト（アプリ本体の CSP が `media-src data:` 以外変わらないことも）
      対象: `packages/server/src/http/HttpServer.ts`（`handle` の前に経路を足す）、`packages/web/public/ask-view/`（新規）、`HttpServer.integration.test.ts`、`packages/web/src/askViewVendor.test.ts`（新規）
      依存: T7
      AC: AC9, AC11
      点検: あり
- [ ] T12: web の成果物の枠: `AskViewer.vue`（固定ラベル・タブ・text/image/markdown/html・`sandbox` 定数・`postMessage` の ready/本文・キーの取り次ぎ）・`AskDialog.vue` の view あり構成（幅・高さ・モバイルの縦積み）・単体テスト（`sandbox` に `allow-same-origin` が無い・`source` の検査・取り次ぎの 3 種以外は無視）
      対象: `packages/web/src/components/AskViewer.vue`（新規）、`packages/web/src/components/AskDialog.vue`（テンプレート・スタイル・`onKeydown`）、`AskViewer.test.ts`（新規）
      依存: T10, T11
      AC: AC8, AC10, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
      点検: あり
- [ ] T13: E2E（S3）: 4 種の view・mermaid の SVG・`sandbox` 属性・`parent.document`/`localStorage` の SecurityError・`fetch` 拒否・Markdown の `<script>`/`onerror` が動かない（違反）・枠の中の `Escape`/`Ctrl+Enter` が `cancelled`/`answered`・キーボードだけで通す・固定ラベルの偽装不可・モバイルの縦積み・負の対照（`allow-same-origin` を足した枠で検査が落ちる）
      対象: `packages/e2e/src/specs/ask-view.spec.ts`（新規）
      依存: T10, T12
      AC: AC8, AC9, AC10, AC11, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T14: 文書: `docs/sodactl.md`（受け取れる項目・上限・view・機能確認・新旧の組み合わせの表・パスの解かれ方）・`docs/verification.md`・`packages/cli/skills/sodactl/SKILL.md`（`skill` コマンドの出力と `cmp` する smoke があるので `packages/cli` の skill ファイルを直す）・`AGENTS.md` の索引・`decisions.md` に public_docs の `ask.py`/`SKILL.md` の改修案
      対象: `docs/sodactl.md`・`docs/verification.md`・`packages/cli/skills/sodactl/SKILL.md`・`AGENTS.md`・`.aidev/works/20261004-ask-media-popup/decisions.md`
      依存: T8, T13
      AC: AC19, AC21
- [ ] T15: 負の対照の確認（AC22）。対策を外した版（種類確認・IP 検査・`allow-same-origin`・SVG の `<img>` 限定）でテストが落ちることを確かめ、生の出力を `test-result.md` に残す。**coding ではなく test 工程で消化する**（coding の承認時は未チェックで残る前提。decisions D4）
      対象: `packages/server/src/ask/AskMedia.ts`・`RemoteImageFetcher.ts`・`packages/web/src/components/AskViewer.vue`（変異させる箇所。test 工程で一時的に戻す）
      依存: T13
      AC: AC22
