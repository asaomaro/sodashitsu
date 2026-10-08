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

---

# テスト結果（PR2: pane の移動の制限。T6〜T12）

2026-10-08。worktree `feature/pane-move-scope`（`feature/web-tab-dnd` の先頭から切った）。

## 全体

- `pnpm build`: 成功。`pnpm typecheck`: 成功。
- `pnpm test`（全体）: 438 ファイル中 437 通る。8594 件中 8591 件が通り、失敗 3 件は `packages/server/src/tui.integration.test.ts` の 3 件（既知。worktree のパスが長いと main でも落ちる）だけ。
- 足したテスト: `paneMoveScope.test.ts` 14 件・`SessionModel.test.ts` 19 件（`pane の移動の範囲`）・`SessionService.test.ts` 3 件・`index.test.ts`（ハンドラ）3 件・`Sidebar.test.ts` 4 件・`ActionDispatcher.test.ts` 5 件・`TuiDispatcher.test.ts` 4 件。E2E `pane-move-scope.spec.ts` 6 件。

## 前提を直した既存のテスト（期待は変えていない）

`git: null` どうしで `cwd` が違う workspace の間で移していたものを、移動先を移動元と同じ `cwd` で作るようにした。
- `SessionModel.test.ts`: 「移動元 tab が移動元 workspace の active tab のまま空になり…（AC4）」（`/home/u/other` → `/home/u`）・同（AC5）・「moveToTab that empties the source workspace」（`/b` → `/a`）・「moveToNewTab that empties the source workspace」（同）。
- `SessionService.test.ts`: 「移動元 workspace も連鎖して空になるとき（D18）」（moveToTab・moveToNewTab の 2 つ。`/home/u/other` → `/home/u`）・「別 workspace への移動: pane.updated → …」・「moveToTab (the source workspace becomes empty)」・「moveToNewTab (the source workspace becomes empty)」（`/b` → `/a`）。
- `packages/cli/src/paneCurrent.integration.test.ts`: `pane.move_to_new_tab` を、`reason` がある間は 100ms おきに試し直す形に（上限 10 秒。固定の待ちではない）。
- `ActionDispatcher.test.ts`・`TuiDispatcher.test.ts`・`mouse.test.ts`・`PaneFrame.test.ts`・`Sidebar.test.ts` の既存の pane の移動のテストは、ストアに移動元が無い・`git: null` で `cwd` が同じ、のため直しなしで通った。

## 負の対照（T7）

`SessionModel.moveToTab`・`moveToNewTab` の確認の 2 行（`if (this.paneMoveBlockFor(...) !== null) return false;`・`return null;`）だけを消して `SessionModel.test.ts` を流した出力（要約）:

```
 × (2) 違う worktreeKey（同じ repoKey の本体と linked worktree）は断り、何も変わらない   （moveToTab）
 × (2) 違う worktreeKey（別の repoKey）は断り、何も変わらない
 × (3) 判定の無い workspace どうし（update 無し）: cwd が同じなら移り、違えば断る
 × (3) 判定の無い workspace どうし（unmanaged）: ...
 × (3) 判定の無い workspace どうし（unknown だけ）: ...
 × (4) 片方だけ判定がある間は（cwd が同じでも）断り、無い側に同じ worktreeKey が入ると移る
 × (6) 保存から戻した workspace: worktreeKey つきは同じなら移り、違えば断る。repoKey だけで worktreeKey が無いものは断る
 （moveToNewTab でも同じ 7 件）
 Test Files  1 failed (1)
      Tests  14 failed | 171 passed (185)
```

元に戻して再実行: 185 件すべて通る（差分は意図した変更だけ）。E2E (5)（直接の RPC でも断られ、ブラウザにイベントが届かない）は、サーバの確認が無ければ `{ok: true}` が返るので落ちる。

## E2E

- `pane-move-scope`（6 件）・`workspace-groups`・`multi-client`・`workspace-tab-pane`・`sidebar-sections`・`keys-mouse-dialogs`: 72 件中 71 件が通る。失敗 1 件は `workspace-tab-pane.spec.ts:305`（既知。main でも落ちる）。
- スクリーンショット（ドラッグ中に落とせない行が薄くなり、B の行が点線の枠になっている状態・断られたときのトースト）: scratchpad の `pane-move-scope/dragging-blocked-row.png`・`declined-toast.png`。

## 目で確かめる項目（AC19）

`docs/herdr-parity.md`（H41）・`docs/tui-parity.md`（H41・W03）・`docs/tui.md`（「マウス」）・`docs/sodactl.md`・`docs/verification.md` を直した。実機の手での確認（端末版を含む）は未実施。
