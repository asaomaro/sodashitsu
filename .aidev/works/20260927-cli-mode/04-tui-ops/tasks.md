# タスク: 04-tui-ops（全操作・モード・マウス・狭い幅）

## 実装方針

03 の骨組み（`TuiApp`・`SessionModel`・`TuiDispatcher`・`computeLayout` の当たりの矩形〔`sidebarHits`・`tabHits`・`dividers`〕・`KeyRouter`）の上に、web と同じ意味の全操作・モード・マウス・狭い幅の表示を載せる。
操作の意味と呼ぶ RPC は web の `packages/web/src/actions/ActionDispatcher.ts` を正として写す（同じ RPC・同じ確認）。モードのキーの解釈は client-core の `NavigateMode`・`CopyMode`・`ResizeMode`、
ヘルプの表は client-core の `bindings.ts`（`helpHidden` を除く）と `chordDisplay`。Web の拡張のうち対応にするものは `research-inventory.md` §3-3 の分類に従う。

- オーバーレイの枠組み（`modes/`）: 1 つずつ・戻り先の焦点を覚える・オーバーレイの間のキー/ホイール/ドラッグは pane へ流さない（architecture「状態遷移」、AC-I1・AC-I4・AC-I5）。
- 部品: 入力欄（名前変更。Enter 確定・Esc 取り消し）、確認（閉じる・削除・停止）、メニュー（右クリック・navigate の space）、ヘルプ（`prefix+?`・絞り込み）、goto（`prefix+g`）、navigate（`prefix+w`）、resize（`prefix+r`）、copy（`prefix+[`）。
- マウス: design「マウス」の一覧（herdr M1〜M14＋Web の拡張）。pane がマウスを受け付けていれば pane ローカルの座標で SGR 符号化して送る（shift で端末版が扱う）。
- 狭い幅（`tui.narrowThreshold` 未満）: herdr の 1 列表示（焦点の pane だけ＋上辺の選び直しのメニュー）。

## 作業順序と依存関係

下の `依存:` に従う。T2 は T1 の後（確認・入力欄を使う操作があるため）。

## リスク / 留意点

- web の `ActionDispatcher` は 1273 行ある。操作ごとの細かい条件（実行中のプロセスの確認・worktree の完全一致・`closeOnCancel` 等）を落とさない。操作ごとに web のテストを読み、同じ場合を端末版のテストにする。
- `edit_scrollback`（`prefix+e`）は web でどう実現しているかを確かめ、端末版では手元の `$EDITOR` を開けるなら開く（外側の端末を一時的に明け渡す）。
- マウスのドラッグの状態機械は、pane への受け渡しと衝突しやすい（押した場所で決め、離すまで変えない）。

## テスト方針

- 操作: 偽の接続（03 の `testing/fakeSocket`）で、各 `Action` が web と同じ RPC と引数を送ることを表で確かめる（56 操作）。
- モード・オーバーレイ: キーの列 → 画面の文字（headless に流す）と送った RPC。開く/閉じる/確定/取り消し/焦点の戻り先（AC-I1〜AC-I5）。
- マウス: SGR の列 → 当たり判定 → RPC・pane への符号化。
- 結合: 実物のサーバで「分割 → 名前変更 → 入れ替え → 閉じる（確認）」を端末版の入力だけで行う。

## タスク

- [x] T1: `TuiDispatcher` に全操作（web の 56 操作）を実装する（RPC・焦点の移り先・確認や入力欄が要るものは T2 の部品を呼ぶ口だけ先に）
      対象: `packages/web/src/actions/ActionDispatcher.ts`・`packages/tui/src/actions/TuiDispatcher.ts`・`packages/client-core/src/keys/bindings.ts`
      依存: なし
      AC: AC5, AC8, AC-I3, AC-I4
- [x] T2: オーバーレイの枠組みと部品（入力欄・確認・メニュー・ヘルプ〔絞り込み〕）
      対象: `packages/tui/src/modes/`（新規）・`packages/web/src/components/ConfirmDialog.vue`・`ContextMenu.vue`・`HelpOverlay`（web の該当部品。名前は未特定）
      依存: T1
      AC: AC5, AC-I1, AC-I2, AC-I4, AC-I5
- [x] T3: モード（navigate・goto・resize・copy〔選択・検索・コピー〕）と `edit_scrollback`
      対象: `packages/client-core/src/keys/NavigateMode.ts`・`CopyMode.ts`・`ResizeMode.ts`・`packages/web/src/term/`（copy の実装。名前は未特定）
      依存: T2
      AC: AC5, AC7, AC8, AC-I1, AC-I3
- [x] T4: マウスの全操作（焦点・境界のドラッグ・サイドバーと tab の操作と並べ替え・サイドバーの幅と区切り・pane の名前のドラッグでの入れ替え/分割/移動・右クリックのメニュー・ホイール・選択とコピー・リンク・pane への受け渡し）
      対象: `packages/tui/src/input/mouse.ts`（新規）・`packages/tui/src/layout/computeLayout.ts`・`packages/web/src/term/MouseBridge.ts`・`packages/web/src/term/paneDragZone.ts`
      依存: T2
      AC: AC7, AC9, AC-I1, AC-I5
- [x] T5: 狭い幅の 1 列表示（herdr の mobile 相当）
      対象: `packages/tui/src/layout/computeLayout.ts`・`scratchpad/herdr/src/client/shell/mobile.rs`（参考）
      依存: T2
      AC: AC2, AC5
