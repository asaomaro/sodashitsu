# タスク: クリップボードの画像を pane へ貼り付ける（herdr H44）

## 実装方針

protocol（型・定数・判定）→ server（保存 → 送信の状態 → 方式・配線）→ web（関所 → クリップボード → 貼り付け係 → キー・paste イベント・メニュー → 配線）→ docs の順に、
下の層を先に固めて上の層から使う。design の「インターフェース」をそのまま実装し、上限の値は design（decisions D7）の値を既定値にする。

## 作業順序と依存関係

下の `依存:` に従う。T6（中継越しの結合テスト）は T3 の配線の後に置く——既存の `machines.integration.test.ts` の仕組みで手元とリモートの実物のサーバを通す。

## リスク / 留意点

- `bindings.test.ts`・`keymap.test.ts` 等の件数を固定したテストは、操作を 1 つ足すと変わる（意図した変更として値を直す）。
- happy-dom の `navigator.clipboard`・`navigator.permissions`・`DataTransfer` は実物と違う——クリップボードは注入できる形にして偽物で試す（design の `ImagePasterOptions.clipboard`）。
- 既存の `Ctrl+Shift+V`・メニューのテストは `imagePaste` を渡さない形で今の経路のまま通ること（後方互換）。
- prettier は新しいファイルと HEAD で整形済みのファイルにだけかける。

## テスト方針

- 単体: `protocol/src/image.test.ts`（判定）、`server/src/image/ImageStore.test.ts`（実物の一時ディレクトリで権限・名前・wx・後片付け・lstat の検査）、
  `ImageUploads.test.ts`（偽の時計・偽の store で検査・上限・時間切れ・切断）、方式の登録（`surface/methods/image.test.ts`）、
  web の `InputGate.test.ts`（first・timeoutMs）、`clipboard.test.ts`（許可・読み取り・DataTransfer）、`ImagePaster.test.ts`（偽の conn・端末・クリップボード。順序・失敗・パスの検査・直列）、
  `KeyInputController.test.ts`（remote_image_paste の経路・handleDomKey・外したとき）、`TerminalRegistry.test.ts`（paste イベント）、`ActionDispatcher.test.ts`（メニュー）、`bindings`/`keymap` の件数。
- 結合: `WsGateway` 越しの begin/chunk/commit（`ws/WsGateway.integration.test.ts` の形）、中継越し（`machine/machines.integration.test.ts`）。
- 回帰の負の確認: 規約 `regression-negative-control.md` に従い、主要な判定（先頭のバイト・順序・上限・パスの検査・first の順序・fallback）を変異させてテストが落ちることを確かめる（test 工程）。
- 全体: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`。E2E・負荷テストは回さない。

## タスク

- [x] T1: protocol に画像の定数・判定（`image.ts`）・方式 4 つ・エラーコード 6 つを足し、判定の単体テストを書く
      対象: `packages/protocol/src/image.ts`（新規）・`messages.ts` の `PaneEditScrollbackParams` の隣と `METHOD_SCHEMAS`・結果の表・`errors.ts` `ErrorCode`・`index.ts` / 根拠: research A10
      依存: なし
      AC: AC7, AC8, AC11
- [x] T2: server の `ImageStore`（ディレクトリの確かめ・0700/0600・乱数の名前・wx・後片付け）と単体テスト
      対象: `packages/server/src/image/ImageStore.ts`（新規） / 根拠: research F20・F21・design「サーバ（保存）」
      依存: T1
      AC: AC1, AC7, AC8
- [x] T3: server の `ImageUploads`（送信の状態・検査・上限・時間切れ・cancel・切断）、方式の登録（`surface/methods/image.ts`・`index.ts`・`deps.ts`）、`composeServer` の配線（`onClientGone`・`close` での `dispose`＝時計を全て止める）と単体・`WsGateway` 越しの結合テスト
      対象: `packages/server/src/image/ImageUploads.ts`（新規）・`packages/server/src/surface/methods/image.ts`（新規）・`surface/methods/index.ts` `registerAllMethods`・`deps.ts` `MethodDeps`・`composeServer.ts:267`・`:306-313`・`:555` `close` / 根拠: research A11・A12・F16・F18
      依存: T2
      AC: AC1, AC7, AC9
- [x] T4: web の `InputGate` に保持ごとの時間（`timeoutMs`）と、`release(to, first?)`・`cancel(first?)` の先頭に差し込む `first`（終わった保持なら普通に送る）を足し、単体テスト
      対象: `packages/web/src/net/InputGate.ts` `holdInput`・`finish` / 根拠: research A6・F14
      依存: なし
      AC: AC2, AC10, AC-I1, AC-I5
- [x] T5: web のクリップボード（`canReadClipboardByKey`・`readClipboardImage`・`readClipboardForPaste`・`imageFromDataTransfer`）と `ImagePaster`（直列・送信・cancel・パスの検査・列の組み立て・toast）、`clientError.ts` の文言、単体テスト
      対象: `packages/web/src/term/clipboard.ts`・`packages/web/src/term/ImagePaster.ts`（新規）・`packages/web/src/net/clientError.ts` `MESSAGES` / 根拠: research A7・A8・F7・F13
      依存: T1, T4
      AC: AC1, AC2, AC3, AC4, AC10, AC11, AC-I1, AC-I2, AC-I4
- [x] T6: 中継（`/ws?machine=`）越しに begin/chunk/commit を通し、リモートの状態ディレクトリにファイルができることを確かめる結合テスト
      対象: `packages/server/src/machine/machines.integration.test.ts` / 根拠: research F17・design AC5
      依存: T3
      AC: AC5
- [x] T7: web のキー（カタログ `remote_image_paste`・`Action` の `pasteImage`・`KeyInputController` の端末／端末以外／追加キーの経路と `Ctrl+Shift+V`）、件数を固定したテストの更新と単体テスト
      対象: `packages/web/src/keys/bindings.ts` `ACTIONS`・`keys/actions.ts` `Action`・`keys/KeyInputController.ts` `resolveTerminalKey`/`dispatch`/`handleDomKey`/`inject` / 根拠: research A1〜A3
      依存: T5
      AC: AC1, AC2, AC4, AC6, AC-I3, AC-I5
- [x] T10: web の paste イベント（`TerminalRegistry`）、メニュー（`ActionDispatcher`）、`main.ts` の配線と単体テスト
      対象: `term/TerminalRegistry.ts` `create`・`actions/ActionDispatcher.ts:1177-1190`・`main.ts:119` 付近 / 根拠: research A4・A5・A9
      依存: T7
      AC: AC3, AC4, AC-I4
- [x] T8: docs（`herdr-parity.md` H44・`machines.md` の「できないこと」・`verification.md` の手順）。herdr との違い（使えるブラウザと経路・置き場所と寿命・キーの既定）に加え、
  Chromium で初めて Ctrl+V を押すと許可の画面が出ること（decisions D6）と、状態ディレクトリは自分だけが書ける場所に置く前提（D9）を書く
      対象: `docs/herdr-parity.md:77`・`docs/machines.md:106`・`docs/verification.md` / 根拠: research「影響範囲」
      依存: T10
      AC: AC12
- [x] T9: 全体の確認（build・typecheck・全テスト・smoke）——test 工程で消化する
      対象: リポジトリ全体（`pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`）
      依存: T6, T8
      AC: AC13
