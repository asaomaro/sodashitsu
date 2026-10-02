# タスク: `sodactl ask`（pane のプログラムからブラウザ版の画面へ質問のフォームを出す）

## 実装方針

design の「インターフェース」をそのまま実装する。protocol（型・検査・回答の集め方・方式・イベント・code）を先に固め、その上に server（台帳）・cli（コマンド）・web（ストア → 係 → ダイアログ → 配線）を載せる。
検査と回答の集め方は protocol の純関数 1 組だけを使い、cli・server・web に写しを作らない。E2E と docs は全ての層が揃ってから。subtask には分けない（decisions D5）。

## 作業順序と依存関係

下の `依存:` に従う。依存では表せない順序の理由は 2 つ。

- T1 の `collectAsk`・`normalizeAskSpec` を最初に、`form.html` の規則（research F46・F47）を写した期待値のテストごと固める。ここが ask-form と食い違うと、上の層を全部作ってから気づくことになる。
- T8（ダイアログ）は T2（サーバ）を待たない——ストアに質問を入れて部品だけを単体で作れる。実物のサーバと通すのは T9 の配線から。

## リスク / 留意点

- **PR #73（ファイルのリンクとドロップ。未マージ）と同じファイルの近い場所を触る**（`messages.ts`・`errors.ts`・`clientError.ts`・`composeServer.ts`・`surface/methods/deps.ts`・`index.ts`・web の `main.ts`）。
  このブランチは `main` から切ってあるので、#73 が先にマージされたら `main` を取り込んで衝突を直す（どちらも「隣に足す」変更）。
- `USAGE_LINES` に `ask` を足すと、`SKILL.md` に `sodactl ask` が無い限り `skill.test.ts` が落ちる（research F23）。T4 で両方を同時に変える。smoke の `sodactl skill | cmp` も `SKILL.md` を見る。
- happy-dom の `<dialog>` は `open` 属性を付けるだけで、inert・Esc・フォーカスの復帰が無い（research F42）。フォーカスの閉じ込め・キーとホイールの漏れ・戻り先は E2E（T10）でだけ確かめられる。
- 閉じた接続への `sendText`（切断後に解決した `ask.open` の応答）が投げないかは未確認（design「依拠する既存の事実」）。T2 の結合テストで確かめ、投げるなら `AskService` の側で握る。
- `jsonBytes` は今 `messages.ts` の中だけの関数（design）。`ask.ts` から使うために外へ出すと、`messages.ts` ⇄ `ask.ts` の循環 import になりうる——`ask.ts` 側に置いて `messages.ts` が import する向きにする。
- iOS Safari の実機での `<dialog>` の高さ（画面のキーボード）は自動のテストで見られない。`docs/verification.md` に手元の項目として残す（T11）。
- E2E は `.aidev/conventions/e2e-observe-browser.md` に従い、合否をブラウザの側（DOM・ブラウザが送ったフレーム・フォーカス）で見る。テストのクライアントに届いた `ask.opened` を、ブラウザに出た合図にしない。
- 既存の E2E は `main` の時点で 19 件落ちる（PR #73 の検証で確かめた。設定画面・テーマ等）。この work の合否は、新しい spec と、落ちていない既存の spec が増えて落ちないことで見る。

## テスト方針

- 単体: `protocol/src/ask.test.ts`（検査の誤りの各種・既定と丸め・上限・`collectAsk` を `form.html` の規則の期待値と比べる・`checkAskAnswer`・`isAskColor`。確かめ用の定義〔7 問・テーマ 13 件〕を fixture に写す）、
  `server/src/ask/AskService.test.ts`（偽の時計・偽の bus。購読・`unavailable`・`ask_busy`・最初の回答・取り消し・時間切れ・`pane.closed`・切断・`dispose`）、
  `cli/src/commands/ask.test.ts`・`cliArgs.test.ts`（引数・stdin・終了コード・何も送らない・要求の時間切れ）、
  `web` の `store/ask.test.ts`・`ask/AskController.test.ts`・`components/AskDialog.test.ts`（出どころの行・文字としての表示・確定のキー・IME・即確定・未回答の強調・取り消し・背景クリック）。
- 結合: 実物の `/ws` 越し（`server/src/ask/ask.integration.test.ts`。`image/imagePaste.integration.test.ts` の形）——sodactl 相当の `external` の接続の `ask.open`、ブラウザ相当の `desktop` の接続の `ask.subscribe`／`ask.get`／`ask.answer`、
  端末版相当（`desktop` で hello しただけ）では `unavailable`、ログに中身が出ない。中継越し（`machine/machines.integration.test.ts` にケースを足す）。
- E2E（実物の Chromium。`e2e/src/specs/ask-form.spec.ts`）: ビルドした `sodactl` を子プロセスで起動し、ダイアログの DOM・stdout の 1 行・終了コードを見る。2 つのブラウザ・再読み込み・SIGINT・時間切れ・サーバの再起動・
  キーボードだけ・モバイルのエミュレーション・フォーカスの行き先・キーとホイールが漏れない・ほかのダイアログとの重なり・`<script>` が動かない。
- 回帰の負の確認（`.aidev/conventions/regression-negative-control.md`）: 新しい機能なので「直す前に落ちる」対象は無いが、主要な判定（`showIf` の判定・最初の回答だけ採る・購読者の判定・出どころの行・IME の守り・即確定の条件）は
  変異させてテストが落ちることを確かめ、`test-result.md` に残す。
- 全体: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・変更したファイルの lint・`aidev smoke`。
- 手元でしか確かめられないもの（別のマシンのブラウザ・実機のスマートフォン・保存した SSH のマシン・ask-form 本体との同じ結果）は `docs/verification.md` に項目として書き、`test-result.md` に未検証として残す。

## タスク

- [x] T1: protocol に `ask.ts`（上限の定数・型・`normalizeAskSpec`・`initialAskState`・`collectAsk`・`checkAskAnswer`・`isAskColor`・`jsonBytes`）、方式 5 つ（`ask.open`・`ask.subscribe`・`ask.get`・`ask.answer`・`ask.cancel`）、
      イベント 2 つ（`ask.opened`・`ask.closed`）、エラーコード 3 つ（`invalid_ask_spec`・`ask_busy`・`ask_closed`）と client-core の文言を足し、単体テスト（確かめ用の定義の fixture を含む）を書く
      対象: `packages/protocol/src/ask.ts`（新規）・`packages/protocol/src/ask.test.ts`（新規）・`packages/protocol/src/messages.ts:461` `jsonBytes`・`:710-786` `METHOD_SCHEMAS`・`:790-` `MethodResultMap`・`packages/protocol/src/events.ts:168-195` `ServerEvent`・`packages/protocol/src/errors.ts:2-71`・`packages/protocol/src/index.ts`・`packages/client-core/src/net/clientError.ts:14` `MESSAGES` / 根拠: research A1〜A4・F46・F47・design「インターフェース」
      依存: なし
      AC: AC3, AC6, AC12
- [x] T2: server の `AskService`（購読者・pane ごとの台帳・`open`／`get`／`answer`／`cancel`・時間切れ・`pane.closed`・`onClientGone`・`dispose`・中身を出さないログ）と単体テスト
      対象: `packages/server/src/ask/AskService.ts`（新規）・`packages/server/src/ask/AskService.test.ts`（新規） / 手本: `packages/server/src/commands/CommandService.ts:40-45, 270-285`・`packages/server/src/metadata/MetadataService.ts:80-83, 97-100` / 根拠: research A5・F12・F20・F27・design「AskService」
      依存: T1
      AC: AC5, AC8, AC9, AC10, AC13
- [x] T3: server の方式の登録（`surface/methods/ask.ts`・`index.ts`・`deps.ts`）、`composeServer` の配線（生成・2 つの `onClientGone`・`close()` の finally）、実物の `/ws` 越しの結合テスト
      （`external` の `ask.open`・`desktop` の `ask.subscribe`／`ask.get`／`ask.answer`・端末版の形〔hello だけ〕では `unavailable`・2 つの購読者・切断で閉じる・`server.log` に定義と回答の文字列が出ない）
      対象: `packages/server/src/surface/methods/ask.ts`（新規）・`packages/server/src/surface/methods/index.ts:27-46`・`packages/server/src/surface/methods/deps.ts:19`・`packages/server/src/composeServer.ts:297` 付近・`:338-357`・`:383-388`・`:392-397`・`:721` 付近・`packages/server/src/ask/ask.integration.test.ts`（新規） / 根拠: research A6・A8・F1・F28・F31
      依存: T2
      AC: AC1, AC5, AC8, AC10, AC13
- [x] T4: cli の `sodactl ask`（`USAGE_LINES`・`Command`・`parseArgs`〔`--timeout`・`--machine` と余分な引数は使い方の誤り〕・`main.ts` の switch と help・`commands/ask.ts`〔呼び出し元の pane・stdin を丸ごと読む・検査・`ask.open`・
      結果の 1 行・`invalid_ask_spec` を終了コード 2 に写す・切断の検知〕）、`wsClient` の要求ごとの時間切れ、`SKILL.md` への記載、単体テスト
      対象: `packages/cli/src/cliArgs.ts:25-66, 167, 339-384, 611-620, 943-954`・`packages/cli/src/main.ts:28-64, 74-138`・`packages/cli/src/commands/ask.ts`（新規）・`packages/cli/src/commands/ask.test.ts`（新規）・`packages/cli/src/wsClient.ts:62, 140-161` `requestRaw`・`packages/cli/src/paneTarget.ts:15-34`・`packages/cli/src/output.ts:94-128`・`packages/cli/skills/sodactl/SKILL.md`・`packages/cli/src/skill.test.ts:70-81`・`packages/cli/src/cliArgs.test.ts` / stdin を丸ごと読む処理は未特定（既存に無い。新しく書く——research A17） / 根拠: research A9・A10・F17・F21〜F26
      依存: T1
      AC: AC1, AC5, AC6, AC14
- [x] T5: 中継（`/ws?machine=`）越しの結合テスト: リモートのサーバへ中継でつないだ `desktop` の接続が `ask.subscribe` すると、リモートの pane の `ask.open` がその接続へ `ask.opened` を出し、`ask.answer` で結果が返る。
      軽い接続（`external`）だけのときは `unavailable` がすぐ返る
      対象: `packages/server/src/machine/machines.integration.test.ts` / 根拠: research F6・F7・F9・design AC7
      依存: T3
      AC: AC7
- [x] T6: web のストア（`store/ask.ts`：受けた順のキュー・`replaceAll`・`add`・`remove`・`clear`）と `view.ts` の `modalOpen`（`askOpen` を含める・`setAskOpen`）、単体テスト
      対象: `packages/web/src/store/ask.ts`（新規）・`packages/web/src/store/ask.test.ts`（新規）・`packages/web/src/store/view.ts:317-323` `modalOpen`・`:439-442` `resetForMachineSwitch` / 根拠: research A11・F34・F35
      依存: T1
      AC: AC8, AC9, AC-I5
- [x] T7: web の `AskController`（`onOpened` で `ask.subscribe`・`onClosed` で空に・`ask.opened` → `ask.get`・`ask.closed` → 外す・`answer`／`cancel`・古いサーバでは黙って何もしない・マシンの切り替えで世代を進める）と単体テスト
      対象: `packages/web/src/ask/AskController.ts`（新規）・`packages/web/src/ask/AskController.test.ts`（新規） / 手本: `packages/web/src/term/ImagePaster.ts`（世代での捨て方） / 根拠: research F14・F10・design「AskController と配線」
      依存: T6
      AC: AC8, AC9, AC10
- [x] T8: web の `AskDialog.vue`（出どころの行・定義の表示〔文字だけ・色の検証〕・質問の部品〔radio・checkbox・その他・text・補足〕・`showIf`・番号の振り直し・未回答の強調とスクロール・確定のキー〔Ctrl/Cmd+Enter・1 行の入力欄の Enter・IME の守り〕・
      即確定〔クリックと Space／Enter だけ〕・取り消し〔Esc・ボタン〕・背景クリックで閉じない・見出しへのフォーカス・戻り先の 3 つの場合・寸法とスクロール・モバイル）と単体テスト
      対象: `packages/web/src/components/AskDialog.vue`（新規）・`packages/web/src/components/AskDialog.test.ts`（新規） / 手本: `packages/web/src/components/OnboardingDialog.vue:152-162, 226-232, 336-346`・`packages/web/src/components/graph/LinkPanel.vue:244-256`・`packages/web/src/components/SettingsDialog.vue:957-993, 1074-1104`・`packages/web/src/components/graph/GraphView.vue:1243-1245`・`packages/client-core/src/workspace/paneName.ts:11-13`・`packages/client-core/src/notify/describe.ts:31, 44`・`packages/web/src/actions/paneFocus.ts:14-19` / 根拠: research A12・A13・F33〜F41・Q9・design「AskDialog.vue」
      依存: T6, T7
      AC: AC2, AC3, AC4, AC11, AC12, AC-I1, AC-I2, AC-I3, AC-I4
- [x] T9: web の配線（`StoreAdapter` のイベントの口・`main.ts` の `AskController` の生成と `connection.onOpened`／`onClosed`・マシンの切り替え・provide、`App.vue` のマウント）と、既存のテストが通ることの確認
      対象: `packages/web/src/store/StoreAdapter.ts:83, 178-190`・`packages/web/src/main.ts:144-146, 273, 353-357, 420-436`・`packages/web/src/App.vue:85-104`・`packages/web/src/injection.ts` / 根拠: research A11・F38
      依存: T7, T8
      AC: AC1, AC2, AC9, AC10, AC-I5
- [x] T10: E2E（`ask-form.spec.ts`）: ビルドした `sodactl` を子プロセスで起動する補助と、design「受け入れ基準との対応」の E2E の項目——決定で結果の 1 行と終了コード 0・新しいページが開かない・確かめ用の定義の結果・13 件のスクロール（デスクトップとモバイル）・
      キャンセル・時間切れ・2 つのブラウザ・再読み込み・SIGINT・サーバの再起動・別の tab を表示中でも出る・出どころの行・`<script>` が動かない・キーボードだけ・フォーカスの行き先（3 つの場合）・キーとホイールが漏れない・設定のダイアログとの重なり
      対象: `packages/e2e/src/specs/ask-form.spec.ts`（新規）・`packages/e2e/src/support/`（sodactl の子プロセスの補助を足す。置き場所は未特定——既存の `appServer.ts`・`keys.ts` の並びに新しいファイル） / 手本: `packages/e2e/src/specs/keys-mouse-dialogs.spec.ts:19, 101`・`mobile.spec.ts`・`reconnect-restore.spec.ts`・`multi-client.spec.ts`・`packages/e2e/src/support/frames.ts` `watchSentInput` / 根拠: research A15・F42
      依存: T3, T4, T9
      AC: AC1, AC2, AC3, AC4, AC5, AC8, AC9, AC10, AC11, AC12, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T11: docs（`docs/sodactl.md` にコマンド・節「質問のフォーム」・「サーバ側の上限」の項目・`timeout` の 2 つの意味・`form.html` との違い、`docs/tui-parity.md` に 1 行、`docs/machines.md` にリモートの pane の扱い、
      `docs/verification.md` に手元で確かめる項目）と、`sodactl help`・`sodactl skill` の出力の確認
      対象: `docs/sodactl.md:20`（コマンド一覧）・`:198-211`（サーバ側の上限）・`:403-`（pane の中から使う）・`docs/tui-parity.md`（W の表の末尾）・`docs/machines.md`（クリップボードの画像の段落の隣）・`docs/verification.md`（「共通：クリップボードの画像の貼り付け」の隣） / 根拠: research F30・design「docs」
      依存: T4, T10
      AC: AC7, AC14
- [x] T12: 追補（未対応の型の質問は `unavailable`）: `normalizeAskSpec` が対応していない型を `unsupportedType` として返し、CLI は接続せず・サーバは台帳に置かず `unavailable` を返す。docs・SKILL.md・テスト（protocol・server・cli・E2E）
      対象: `packages/protocol/src/ask.ts` `normalizeAskSpec`・`unsupportedTypeReason`・`packages/server/src/ask/AskService.ts` `open`・`packages/cli/src/commands/ask.ts` `readAskSpec`・`runAsk`・`docs/sodactl.md`・`packages/cli/skills/sodactl/SKILL.md` / 根拠: 追補 §1
      依存: T1, T2, T4
      AC: AC15
