# レビュー: tab の D&D と、pane の移動の制限

実装（Sonnet の別エージェント）とは別のコンテキスト（Sonnet の別エージェント）で、読むだけの独立レビューを掛けた。PR ごとに記録する。

## PR1: ブラウザ版の tab の D&D での並べ替え（T1〜T5）

タスクごとの独立点検（T1・T2）と、PR1 の全体の点検を、1 回のレビューにまとめた。レビューの側で、`TabBar.test.ts`・`tabReorder.test.ts`・`uiTokens.test.ts`（271 件）と `tab-dnd.spec.ts`（13 件）を流して通ることを確かめた。

### 1 回目（origin/main...feaaa24 の後）

must 0・should 1・nit 3。判断は「直してから（軽い修正 1 件）」。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | `suppressClick` が残る: `pointerup` が tab に届かない取り消し（`pointercancel`・`lostpointercapture`・つかんだ tab が閉じた、など）の後、次の「＋」などの click が 1 回捨てられる（レビューは読んで導いた。再現はしていない） | 直した（8d9f5c7。根の `pointerdown` の capture でどの押下でも旗を下ろす。`pointercancel`・`lostpointercapture` ではその場で下ろす。回帰テスト 2 つと負の確かめ） |
| nit | ペンで横になぞると、ブラウザのパンが `pointercancel` を出して取り消される | 直さない（仕様の範囲内。decisions D17・`docs/verification.md` に「ペンは未確認」） |
| nit | 「＋」や右端の表示の上でも右へ自動スクロールし続ける | 直さない（誤動作はしない） |
| nit | ドラッグ中は `Ctrl+R`・`F5` も効かない | 直さない（`useResizeDrag` と同じ流儀） |

問題なしと確かめた点: 順の計算、取り消しの 6 つの経路の後始末、`view.paneDrag`（pane の名前の D&D）との分離、クリック・右クリック・ホイール・「＋」、確定・取り消しの後のフォーカス、E2E が実際のポインタの操作で DOM の順と送った要求を観測していること。AC は 15 件すべて満たす（上の 1 件を除く）。つかんだ tab の薄さを 0.4 → 0.7 にした件（D16。`uiTokens.test.ts` の決まり）は妥当。

8d9f5c7 は、製品コードの差分が十数行で、監督のセッションが差分を読んで確かめた（別のコンテキストの再レビューは掛けていない）。

### 確かめたこと

- `pnpm build`・`pnpm typecheck`: 成功
- web の単体テスト: 124 ファイル・2734 件すべて通過（feaaa24）。8d9f5c7 の後は `TabBar.test.ts`（44 件）ほか 273 件が通過
- 全体の `pnpm test`（feaaa24 の前）: 14 件失敗 → 既知の `tui.integration.test.ts` 3 件・負荷による時間切れ 10 件（単独では通る）・この作業の退行 1 件（`uiTokens.test.ts`。直した）
- E2E `tab-dnd.spec.ts`（8d9f5c7。監督のセッションが単独で流した）: 13 件すべて通過
- 既存の E2E（`appearance-settings`・`keys-mouse-dialogs`・`workspace-tab-pane`）: 失敗 3 件は main でも落ちる（`workspace-tab-pane:305`・`appearance-settings:113`〔古い期待〕・`:130`〔WebAssembly が CSP で拒まれる〕）
- `aidev smoke`（8d9f5c7）: pass（10 本）

### 確かめていないこと

- Firefox・Safari・ペン・タッチの実機。実測は Chromium だけ。

## PR2: pane の移動の制限（T6〜T12）

タスクごとの独立点検（T6・T7・T8）と、PR2 の全体の点検を、1 回のレビューにまとめた。レビューの側で、`SessionModel.test.ts`・`SessionService.test.ts`・`surface/methods/index.test.ts`（417 件）と `paneMoveScope.test.ts`（14 件）を流して通ることを確かめた。

### 1 回目（824d335...a9af896）

must 0・should 2・nit 2。判断は「マージしてよい」。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | ドラッグ中、落とせない行（薄さ 0.7）と落とせる行が見分けにくい。落とせない行にポインタを乗せると点線の枠が出て、落とせるように見える | 直した（b4f9a47。落とせる行に弱い強調〔左の縁の線と淡い背景〕。落とせない行の上では枠を出さない。decisions D19） |
| should | 断ったときの知らせが薄く写っている | 撮り直して確かめた（フェードの途中だった。通常の明るさで出ている） |
| nit | `normalizeCwd` が Windows の区切りの末尾を落とさない | 直した（b4f9a47） |
| nit | 判定が入らないままの workspace は、理由の文言が「別の worktree」になる | 直さない（D12） |

問題なしと確かめた点: pane の `tabId` を書き換えるのは `moveToTab`・`moveToNewTab` の 2 か所だけ（分割・置き換え・tab の移動・workspace の操作・復元は、別の workspace へ動かさない）／断るときは、ハンドラと `SessionModel` の二重で、状態・イベント・保存のどれにも触れない／`sodactl`・エージェントの連携・グラフは `pane.move_*` を呼ばない／既存のテスト 9 件の直しは、期待を変えず、意図を保っている。

変異の確かめ（レビューの側。worktree の写しで実施）: サーバのハンドラの事前確認と `SessionModel` の確認を全部外すと、E2E (5)（直接の RPC でも断られ、イベントが届かない）が落ちた。`SessionModel` の確認の 2 行だけを外すと、単体テスト 14 件が落ちる（実装の側）。

b4f9a47 は、見た目（`Sidebar.vue` のクラスと CSS）と `normalizeCwd` の小さな差分で、監督のセッションがスクリーンショット（明るい・暗い。落とせる行・落とせない行・ポインタを乗せた場合）と差分を見て確かめた（別のコンテキストの再レビューは掛けていない）。

### 確かめたこと

- `pnpm build`・`pnpm typecheck`: 成功
- `pnpm test`（main を取り込んだ後。b4f9a47）: 8597 件中 8594 件通過。失敗 3 件は `tui.integration.test.ts`（worktree のパスが長いと main でも落ちる）
- E2E（b4f9a47。`--workers=1`）: `pane-move-scope`・`tab-dnd`・`workspace-groups`・`sidebar-sections` の 63 件すべて通過（実装の側）。`pane-move-scope` の 8 件は、監督のセッションも単独で流して通過
- `aidev smoke`（b4f9a47）: pass（10 本）

### 確かめていないこと

- 端末版の実機（単体テストだけ）。Firefox・Safari。
