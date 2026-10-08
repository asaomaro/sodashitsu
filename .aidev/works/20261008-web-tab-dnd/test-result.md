# テスト結果（PR1: tab の D&D。T1〜T5）

2026-10-08。worktree `feature/web-tab-dnd`。

## 全体

- `pnpm build`: 成功。`pnpm typecheck`: 成功。
- `pnpm test`（全体）: 14 件失敗（11 ファイル）。内訳:
  - `packages/server/src/tui.integration.test.ts` の 3 件: 既知（worktree のパスが長いと main でも落ちる）。
  - 負荷による時間切れ・並列の影響（単独で流すと通る）: `perf.integration.test.ts`（フック 10 秒の時間切れ）、web の `App.test.ts`・`AskDialog.keys.test.ts`・`KeySettings.test.ts`・`SettingsDialog.test.ts`・`Sidebar.test.ts`・`GraphView.test.ts`・`MobileShell.test.ts`・`FileTransfer.test.ts`。
  - `theme/uiTokens.test.ts`「部品の CSS の透明度」1 件: **この作業の退行**（つかんだ tab の `opacity: 0.4` が `MUTED_TEXT_ALPHA`=0.7 未満）。0.7 に直した（decisions D16）。
- 直した後の `pnpm --filter @sodashitsu/web test`: 124 ファイル・2734 件すべて通る（TabBar.test.ts は 42 件。うち今回の追加は 17 件）。`tabReorder.test.ts` は 9 件。

## E2E

`tab-dnd`（13 件）・`appearance-settings`・`keys-mouse-dialogs`・`workspace-tab-pane`: 42 件中 39 件が通る。失敗 3 件はどれも tab のドラッグと無関係:

- `workspace-tab-pane.spec.ts:305`: 既知（main でも落ちる）。
- `appearance-settings.spec.ts:113`（`.tab-bar-clock`）: 製品コードに `.tab-bar-clock` が無い古い期待で、main でも落ちる（`git grep` で確認）。
- `appearance-settings.spec.ts:130`（枠・隙間の太さ）: ページの `CompileError: WebAssembly.instantiate() ... violates the following Content Security policy directive`。作業ブランチ 2 回・main（別 worktree で build し直したもの）2 回、同じ出力で落ちる。退行ではない。

`tab-dnd.spec.ts` の内容: 4 個の tab の並べ替え（線の出方・`tab.move` が 2 回・`tab.focus` が 1 回・サーバと再読み込み後の順・端末にフォーカス）、先頭/末尾/「＋」の上、取り消し 3 通り（`Escape`・端末の上・自分の上）で送信 0、既存の操作（3px・右クリック・ホイール）、pane の名前を tab へ落とす移動、ドラッグ中のキー（対照つき）、あふれと自動スクロール、tab バー「下」、外からの変化、2 つのブラウザ、タッチ、明るい/暗い配色のスクリーンショット。

- 「ドラッグ中に別の tab を `tab.move` で動かされたとき」の Chromium での実際: ドラッグは取り消されず続き、離した位置で `tab.move` の回数が決まった（Vue が keyed の並べ替えをしても、ポインタの捕捉は保たれた）。
- 未確認のまま残る: Firefox・Safari での、捕捉した要素の上で離した後の `click` の出方（どちらでも壊れない作りにしてある）。

## 目で確かめる項目（AC10）

`docs/tui-parity.md`・`docs/herdr-parity.md`・`docs/verification.md` を直した（verification.md に手で確かめる項目を足した）。実機の手での確認は未実施。

## レビュー指摘の修正（旗 `suppressClick` の取りこぼし）の負の対照

`onBarPointerDownCapture`（根の pointerdown の capture で旗を下ろす）と、`pointercancel`・`lostpointercapture` での旗下ろしを外すと、
回帰テスト「旗の取りこぼし: pointercancel・lostpointercapture・つかんだ tab が閉じた後に「＋」を押すと…」が落ちる。戻すと 44 件すべて通る。

```
## 旗を下ろす処理を全部外したとき
     × 旗の取りこぼし: pointercancel・lostpointercapture・つかんだ tab が閉じた後に「＋」を押すと、新しい tab の操作が呼ばれる 11ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: cancel: expected "vi.fn()" to be called with arguments: [ 'w1' ]
      Tests  1 failed | 43 passed (44)
```
