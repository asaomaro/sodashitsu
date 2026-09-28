# agent-graph 事前調査: web クライアント（packages/web・client-core・tui の関係分）

調査日 2026-09-28。読み取りのみ（repo は変更していない）。パスは `packages/` からの相対。
前提: ノード編集は外部ライブラリを使わず自前（`.aidev/works/20260918-web-terminal-multiplexer/decisions.md:188-193`「D10 の結果」:「ノード編集は、ライブラリ（Vue Flow 等）を使わず自前で実装する（ユーザーの指示）」）。

---

## 1. App のレイアウトと、全画面の画面の差し込み口・キーの横取り

### 1.1 App.vue の構成
- 切り替えの順: `LoginView`（`view.authRequired`）→ `DetachedView`（`connectionState==='detached'`）→ 本体 `.app-shell`（`web/src/App.vue:57-59`）。
- 本体: `isMobileViewport()` なら `MobileShell`、そうでなければ `Sidebar` ＋ `.app-main`（`TabBar` ＋ `.app-panes` の中に `PaneLayout`→`TerminalPane`）（`App.vue:60-83`）。`isMobile` は起動時に 1 回だけ評価（`App.vue:43`）。
- ダイアログ・重ねもの類はモバイル／デスクトップ共通で `.app-shell` の末尾に並ぶ: `ContextMenu, NameDialog, WorktreeCreateDialog, WorktreeOpenDialog, GroupPickerDialog, SessionSwitchDialog, ConfirmDialog, SettingsDialog, HelpDialog, OnboardingDialog, GotoPicker, CommandPopup, PrefixIndicator, Toast, ReconnectOverlay`（`App.vue:84-98`）。どれも「自分の `view.dialogContext.kind` を見て開く」自己完結型。
- `.app-shell` は `display:flex; height:100%`（`App.vue:143-146`）。色の変数は `:root` に dracula の写し（`App.vue:108-131`）。
- 配線（ポートの bind など）は `main.ts` の責務で、App.vue はテンプレートの切り替えだけ（`App.vue:30-37`）。

### 1.2 全画面の画面を入れる場所（案と根拠）
- **案 A（推奨）: `.app-shell` 末尾の重ねもの群に `<GraphView />` を足し、`position:fixed; inset:0` で全画面に重ねる。** `CommandPopup` が同じ形（背景 `position:fixed; inset:0; z-index:900`。`components/CommandPopup.vue:222-227`）。`PaneLayout`／`TerminalPane` は下に mount されたまま残るので、xterm の作り直し・`client.view` の大きさの変化が起きない（`App.vue:66-67` の follow-resize は `.app-panes` の大きさを見る。重ねるだけなら変わらない）。
- 案 B: `App.vue:65-81` の `.app-panes` を `v-if` で差し替える → `TerminalPane` が unmount され端末が dispose／再 acquire され、`client.view` も変わる。閉じたときに元の pane へ戻る（AC-I4）のが重くなるので不向き。
- モバイル（AC20）: `MobileShell` の中身は上部バー＋1 pane（`mobile/MobileShell.vue:78-110`）。重ねものは `.app-shell` 直下なのでモバイルでもそのまま出る（`App.vue:84-98` は `MobileShell` の外）。

### 1.3 既存の開閉の前例
- 開閉の状態は `view` ストアの**単一スロット**: `openDialog: string|null`・`dialogContext: DialogContext|null`・`preDialogFocusPaneId`（`store/view.ts:308-312`）。`openDialogWithContext` が開く前の焦点を覚え（`view.ts:467-471`）、`closeDialog` が戻す（`view.ts:483-488`。AC-I4 の前例）。`DialogContext` の種類一覧は `view.ts:228-296`（`help`・`goto`・`settings`・`commandPopup` など）。
- HelpDialog: `<dialog>`＋`showModal()`、`dialogContext.kind==='help'` を watch して開閉（`components/HelpDialog.vue:133-146`）。`@cancel` を `preventDefault` して `closeDialog`（`HelpDialog.vue:152-155`）。**同じキー `?`・Esc・Enter で閉じる**のは部品自身の keydown（`HelpDialog.vue:196-200`）。
- GotoPicker: 同じ形で、開くと現在行を選ぶ（`components/GotoPicker.vue:179-195`）、Esc は検索欄から離れる／閉じるを分ける（`GotoPicker.vue:208-214`）。
- SettingsDialog: 同じ形（`components/SettingsDialog.vue:106-125`）。`100vh` でなく `100%` を使う理由（iOS Safari）が `SettingsDialog.vue:931-935`。
- CommandPopup: **ネイティブ `<dialog>` を使わない**前例（Esc を端末へ渡す必要があったため。`CommandPopup.vue:21-24`）。枠の中の keydown/keyup/keypress/wheel を `stopPropagation`（`CommandPopup.vue:183-186, 204-208`）、背景で `@mousedown.prevent @wheel.stop.prevent @contextmenu.prevent`（`CommandPopup.vue:191-197`）。
- モバイルの PanePicker: 全画面の `<div role="dialog">` で自前の `@keydown.esc`（`mobile/PanePicker.vue:18, 85`）。

### 1.4 キーが xterm へ漏れない仕組み
- `KeyRouter` のモードは `terminal|prefix|navigate|copy|resize|dialog`（`client-core/src/keys/actions.ts:7`）。`dialog` モードでは**全キーを consume**（`client-core/src/keys/KeyRouter.ts:108-109`）。
- `main.ts` が `view.openDialog` を watch して `keys.setMode(open ? "dialog" : "terminal")`（`web/src/main.ts:376-381`）。
- window の keydown（端末以外にフォーカスがあるとき）は `if (view.openDialog) return;` で何もしない（`main.ts:390-395`）。xterm の textarea にフォーカスがあるときも何もしない（同 392 行。`attachCustomKeyEventHandler` は stopPropagation しないため。`main.ts:383-389`）。
- 端末のキーは `KeyInputController.attach` → `handleTerminalKey`（`keys/KeyInputController.ts:136-139, 216-218`）。端末以外のキーは `handleDomKey`（`KeyInputController.ts:141-151`）。
- ドラッグ中にダイアログが開いたらドラッグを取り消す watch が `view.openDialog` を見ている（`components/PaneFrame.vue:216-227`、`components/Sidebar.vue:427-438`）。
- 焦点: `TerminalPane` は `view.focusedPaneId` が自分になると `term.focus()`（`components/TerminalPane.vue:46, 63-66`）。ダイアログ中に焦点を書き換えるとダイアログから焦点を奪うので `retargetPreDialogFocus` を使う前例（`view.ts:473-480`、`store/StoreAdapter.ts:100`）。

### 1.5 グラフ画面にとっての注意点（設計への申し送り）
1. **`DialogContext` は単一スロット**。グラフ画面を `DialogContext` の一種にすると、線の削除の確認（AC-I2）で `ConfirmDialog` を開いた瞬間にグラフ画面の文脈が消える（`openDialogWithContext` は上書き。`view.ts:467-471`）。前例は worktree 削除の確認で、取り消し時に一覧を開き直して「戻る」（`view.ts:245-258` の `closeOnCancel`、`actions/ActionDispatcher.ts:438-452`）。→ グラフ画面は `view` に別の状態（例 `graphOpen`）を持たせ、確認はグラフ画面の中で出す（または ConfirmDialog を重ねられる形にする）のが素直。
2. 別の状態にする場合、**`view.openDialog` を見ている 4 箇所を同じく効かせる必要がある**: `main.ts:379-381`（dialog モード化）、`main.ts:391`（window keydown の抑止）、`PaneFrame.vue:222-227`・`Sidebar.vue:430-438`（ドラッグの取り消し）。`view.resetForMachineSwitch`（`view.ts:428-445`）にもリセットを足す。
3. **AC-I1「同じキー（prefix＋キー）で閉じる」**: dialog モードでは `KeyRouter` が全て consume するので prefix が効かない（`KeyRouter.ts:108-109`）。閉じるキーはグラフ画面の keydown で自前に見る必要がある。材料は `settings.keymap.prefix`／`prefixMap`（`client-core/src/keys/keymap.ts:56-75`）と `keyInputOf`・`chordOf`（`client-core/src/keys/chord.ts:36`、`client-core/src/index.ts:5` で export）。HelpDialog の `?` で閉じる実装が近い前例（`HelpDialog.vue:196-200`）が、あれは固定の `?` で割り当ての変更に追従しない。
4. ネイティブ `<dialog>`＋`showModal()` は背景を inert にし、ポインタ・ホイールが pane へ届かない（AC-I5 に有利）。Esc は `cancel` で来るので `@cancel.prevent` で自前処理（HelpDialog と同じ）。ただし線ドラッグ中の Esc（AC-I2）は keydown 段階で先に取る（SettingsDialog の取り込みの前例: `SettingsDialog.vue:507` 付近のコメント「Esc の keydown の preventDefault で cancel 自体が起きない」）。
5. ノードから pane へ移動（AC2・AC-I4）: グラフを閉じてから `view.setView(ws, tab)`＋`view.focusPane(paneId)`＋`pane.focus` RPC（サイドバーの agents 行と同じ。`Sidebar.vue:212-216`）。`closeDialog` 相当が `preDialogFocusPaneId` を戻すので、順序に注意（戻した後に上書き）。別マシンの pane なら `MachineSwitcher.switchTo`（`components/MachineRows.vue:41-44`）。

---

## 2. キー操作（action）の追加

### 2.1 手順（既存の流れ）
1. `Action` 型に種類を足す（`client-core/src/keys/actions.ts:47-92`）。例 `{ type: "graph" }`。
2. 操作カタログ `ACTIONS` に定義を足す（`client-core/src/keys/bindings.ts:31-452`。`id`・`label`・`group`（`"全体"|"workspace / tab"|"pane"`。`bindings.ts:11`）・`defaults`・`action`）。`id` は herdr の名前にそろえる方針（`bindings.ts:5-9`）。群の順がキー一覧と節「キー」の表示順（同）。
   - 既定の prefix の後のキーで**使用中**: `? q s o shift+r / w g shift+n shift+w shift+d shift+g c n p 1..9 shift+t shift+x / v - h j k l shift+h/j/k/l tab shift+tab x z r shift+p [ e b`（`bindings.ts:36-449` の `defaults`）。予約は `esc ctrl+shift+v enter space down shift+enter shift+space shift+down shift+f10`（`client-core/src/keys/keymap.ts:28-38`）。空いている候補は `a d f i m t u y` 等（herdr の既定との照合は別途）。
   - 既定の prefix キーが操作をまたいで重ならないことは `client-core/src/keys/bindings.test.ts:98` が検査。
3. web の `ActionDispatcher.run` の switch に case を足す（`web/src/actions/ActionDispatcher.ts:104-254`）。**web 側の switch には default も網羅検査も無い**（`ActionDispatcher.ts:175-176` のコメント「足し忘れてもキーが黙って何もしないだけで型では落ちない」）。`pasteImage` は web の switch に無く、`KeyInputController` が扱う（`KeyInputController.ts:147, 167-171, 236-239`）。
4. キー一覧（HelpDialog）は `ACTIONS` から自動で行が出る（`HelpDialog.vue:44-49`。`helpHidden` で隠せる。`bindings.ts:19-20`）。節「キー」（`components/KeySettings.vue:61`）も `ACTIONS` から自動。解決表 `keymap.ts:155-169`・保存 `keyPrefs.ts:134, 183` も `ACTIONS` を回るだけ。
5. サイドバーの「メニュー」（全体のメニュー）へ入れるなら `ContextMenu.vue:114-126`（`target satisfies { kind: "global" }` の後の配列）。

### 2.2 TUI への影響
- `TuiDispatcher.run` の switch は `default: action satisfies never;`（`tui/src/actions/TuiDispatcher.ts:92-240`、網羅の検査は 237-239 行）。**`Action` に種類を足すと tui の typecheck が落ちる**ので、tui にも case が要る。
- さらに tui のテストが**カタログの全操作の効果表**を持ち、件数も固定: `EFFECTS` の key 集合が `ACTIONS` の id と一致・`ACTIONS.toHaveLength(56)`（`tui/src/actions/TuiDispatcher.test.ts:196-214`）。効果の種類に `toast`（知らせ 1 件）がある（同 213 行、例 `remove_worktree: { toast: true }` 163 行）。
- 件数・群の数の固定は他にも: `client-core/src/keys/bindings.test.ts:38`（56 個）・`:44`（全体 6・workspace/tab 24・pane 26）、`web/src/components/KeySettings.test.ts:70`（3 群 56 個）。
- tui のキー一覧・節「キー」も `ACTIONS` をそのまま使う（`tui/src/modes/HelpDialog.ts:44`、`tui/src/settings/keySection.ts:338`）ので、web 専用の操作も tui に表示される。キーの割り当ては共有の設定として server 経由で web と tui が共有（`web/src/store/view.ts:100-110`「サーバの共有の設定へも送る」、`actions/PrefsSync.ts`）。
- **web 専用／tui 専用の操作の前例は無い**（`ACTIONS` に surface の印は無い。`bindings.ts:13-28`。grep で `webOnly` 等は 0 件）。両方で意味を持たせてきた（`editScrollback`: web `ActionDispatcher.ts:182-184`／tui `TuiDispatcher.ts:166-168`、`pasteImage`: tui は `host.pasteImage()` `TuiDispatcher.ts:175-176`）。→ 選択肢: (a) tui の case で「グラフ画面はブラウザでだけ開けます」の toast（`this.ui.toast`。`TuiDispatcher.ts:222` 等の前例）＋効果表 `{ toast: true }`、(b) `ActionDef` に `surfaces` のような印を足して tui のキー一覧・節「キー」から除く（新しい仕組み。テスト追加が要る）。

---

## 3. 既存のドラッグ操作

### 3.1 Splitter（境界のドラッグ）
- Pointer Events。`pointerdown` で親の大きさ・始点を控え `setPointerCapture?.(pointerId)`（`components/Splitter.vue:56-65`）、`pointermove` で比率を計算し 50ms 間隔で RPC をまとめて送る（`Splitter.vue:44-54, 67-73`）、`pointerup` で終了（75-77）。ドラッグ中は props の更新を無視（33-38）。
- キーボード: 矢印で 2% ずつ（`Splitter.vue:79-87`）。`touch-action: none`（`Splitter.vue:115`）。
- グラフへの流用: ノード移動の「送信の間引き（throttle）」と「ドラッグ中はサーバからの値で上書きしない」はそのまま使える形。

### 3.2 pane の名前ラベルの D&D（PaneFrame）
- 6px の閾値まではクリック扱い（`components/PaneFrame.vue:110-111, 155-163`）、`setPointerCapture`（150-153）、ドロップ先は `document.elementFromPoint`＋`closest("[data-pane-id]")`／`[data-tab-id]`／`[data-drop-workspace-id]`（136-147）、ドラッグ中の Esc で取り消し（window の keydown を一時的に足す。113-122, 162, 185）、`pointercancel`・`lostpointercapture` で取り消し（210-213, 323-324）、離した瞬間の座標で判定し直す（178-181）、ダイアログが開いたら取り消し（216-227）、unmount でも後始末（229-231）。
- ドラッグの一時状態は `view.paneDrag`（`view.ts:337-352, 512-542`）で、ハイライトは各部品がストアを見て描く。
- ゾーン判定は純関数に切り出して単体テスト（`term/paneDragZone.ts:1-25`。「純関数は切り出して単体テストする」慣習と明記 3-5 行）。→ グラフの「線の終点がどのノードの上か」「ノードの矩形と線の交点」なども同じく純関数に切り出すのが流儀。

### 3.3 サイドバー
- workspace 行の D&D: PaneFrame と同じ流儀を踏襲と明記（`components/Sidebar.vue:25-27, 285-380`）。行 key を `data-workspace-row-key` で持ち `elementFromPoint`＋`closest`（`Sidebar.vue:309-312`）、ドラッグ開始時点のスナップショットを使う（363-369）、子のボタンは `@pointerdown.stop @pointerup.stop`（`Sidebar.vue:498-506`）。
- 幅の分割線のドラッグ: `sidebar-divider` に pointerdown/move/up/cancel/lostpointercapture（`Sidebar.vue:585-592`）、終了で保存（420-424）。
- TabBar: ホイールで tab 移動（`components/TabBar.vue:136-139, 149`。`preventDefault`）。pane のドロップ先の強調だけで、tab 自身の並べ替え D&D は無い（`TabBar.vue:159`）。

### 3.4 MouseBridge
- 端末内のマウス（xterm のマウス報告・リンク修飾キー）向けで、document に capture の `mousedown/mousemove` を張る（`term/MouseBridge.ts:212-224`）。グラフ画面を開いている間に干渉しないかは確認が要る（グラフ画面は xterm の外なので報告自体は発生しないはずだが、capture のリスナーは全要素で走る）。

### 3.5 タッチ・モバイル
- `mobile/TouchScroll.ts`: touch イベントで縦横を 8px で判定（`TouchScroll.ts:12-13, 15-28`）。`touch-action` は呼ぶ側が CSS で当てる前提（23-27 行）。
- 判定は `isMobileViewport()`（`mobile/detect.ts`、App で使用 `App.vue:43`）。粗いポインタ判定は別軸（`App.vue:33-34`）。
- Pointer Events は touch も含むので、ノード移動・線作成は Pointer Events で書けばモバイルでも動く。ただし AC20 はモバイルは閲覧と一時停止のみなので、モバイルでは編集を出さない選択も可。

### 3.6 再利用できるもの
- 「閾値・capture・Esc 取り消し・lostpointercapture・ダイアログで取り消し」の型は PaneFrame／Sidebar に 2 回複製されている（共通の composable は無い）。グラフで 3 回目になるので `usePointerDrag` のような composable 化の余地あり（ただし既存 2 箇所の置き換えは範囲外にするのが安全）。
- `paneDragZone.ts` 型の純関数＋テスト。

---

## 4. 描画の部品

- **SVG・canvas の使用は src に 0 件**（`web/src` を `<svg|<canvas|getContext(|createElementNS` で grep して該当なし）。SVG は `public/favicon.svg`・`public/logo.svg` のみ（ログイン画面で `<img src="/logo.svg">`。`components/LoginView.vue:142`）。依存にグラフ・図形のライブラリは無い（`web/package.json:12-22`）。→ Vue のテンプレートで inline `<svg>`（線・矢印の `<path>`／`<marker>`）＋ノードは HTML の `<div>`（または `<foreignObject>`）が素直。
- テーマの色は CSS 変数。一覧は `client-core/src/theme/uiTokens.ts:16-36`（`--soda-bg --soda-fg --soda-menu-bg --soda-menu-fg --soda-menu-border --soda-menu-active-bg --soda-menu-hover-bg --soda-accent --soda-accent-fg --soda-error-fg --soda-warn-fg --soda-state-{blocked,working,done,idle} --soda-subtle-bg --soda-backdrop --soda-backdrop-strong --soda-pane-current`）。17 テーマ分の値は `uiTokens()`（`uiTokens.ts:361-370`）、ThemeController が `documentElement.style` に当てる（`App.vue:103-107` のコメント）。明暗は `color-scheme` もテーマが持つ（`uiTokens.ts:39-42`）。
  - 全テーマでのコントラストは `uiTokens.test.ts` が検査（`App.vue:104`、`StateIcon.vue` のコメント）。**新しい変数を足すと CSS_VARS・全テーマの値・テストの追加が要る**ので、線の色は既存の `--soda-accent`（選択）・`--soda-menu-border`（通常の線）・`--soda-error-fg`（無効な線）・`--soda-warn-fg`（上限到達・一時停止）・`--soda-state-*`（実行中の表示）で賄えるか先に検討。
  - SVG の `stroke`/`fill` にも `var(--soda-…)` がそのまま使える。予備値に dracula の値を書く慣習（例 `var(--soda-menu-border, #44475a)`。`Splitter.vue:114`）。
- 状態の印: `StateIcon.vue`（`:state` に `DisplayState|null`。字形・色・読み上げ名を 1 箇所で持つ。`components/StateIcon.vue:7-29, 32-43`）。色は `--soda-state-*`（`StateIcon.vue:69-80`）。字形／名前は `stateGlyph`・`stateLabel`（`client-core/src/agent/stateIndicator.ts:42, 47`）。
- アイコン: アイコンの仕組み・ライブラリは無い。文字のグリフで描く流儀（`×` `CommandPopup.vue:219`、`«`/`»` `Sidebar.vue:580`、`▸`/`▾` `Sidebar.vue:505`、`⌨` `MobileShell.vue:83`、`⇄` `Sidebar.vue:452-453`）。絵文字は環境で見た目が変わるので避けた前例（`MobileShell.vue:84-86`）。

---

## 5. サイドバー・モバイルの入口と、ノードの中身に使える部品

### 5.1 入口
- サイドバー下の「メニュー」ボタン → 全体のメニュー（`Sidebar.vue:531-541` → `onOpenGlobalMenu` 277-280 → `ContextMenu.vue:120-126` の `キー割り当て / 移動 / 設定 / 切り離し`）。「グラフ」をここに足すのが最小。
- 目に見える専用ボタンなら、`sidebar-section-footer`（`＋ 新規`・`メニュー`。`Sidebar.vue:529-541`）か `sidebar-footer`（折りたたみボタン。`Sidebar.vue:570-582`）。ボタンには `@keydown="onButtonKeydown"`（Enter/Space を window keydown へ二重に渡さない。`Sidebar.vue:258-268`）を付ける慣習。畳んだサイドバーでも出すなら文字 1 つの表示に切り替える（`⇄` の前例 `Sidebar.vue:452-453`）。
- サイドバーの golden（`components/__golden__/sidebar-default-*.html`）は `.sidebar-row` だけを比べる（`components/Sidebar.defaultLayout.test.ts:94-99, 101-113`）ので、フッターへのボタン追加では壊れない。
- モバイル: サイドバーも prefix も無く、上部バーの「設定」が唯一の入口という前例（`MobileShell.vue:84-87`）。同じ上部バーに「グラフ」ボタンを足す形になる（AC20）。

### 5.2 エージェントの名前・状態の出し方
- agents 区画の行: `session.panes` のうち `agent` のあるものを、`displayStateFor(agent, seen.getSeenSeq(...))` で状態に、`resolveAgentLines(settings.agentsLayout, {pane, tab, workspace, agent, state})` で行のトークンに（`Sidebar.vue:189-205`）。並びは `orderedAgentPaneIds`（`Sidebar.vue:199-204`）。描画は `StateIcon`＋テキストのトークン（`Sidebar.vue:554-566`）。
- pane の呼び名: `paneNameOf(pane)` = `pane.label || agent.name || agent.label || pane.title || "pane <id>"`（`client-core/src/workspace/paneName.ts:11-13`。「この連鎖の唯一の置き場」と明記）。
- エージェントの情報: `AgentInfo` は `kind`（種類 'claude'|'codex'…）・`label`・`state`・`name?`（利用者が付けた名前）・`instanceId`・`since` など（`protocol/src/model.ts:114-134`）。AC1 の「エージェントの名前と種類」は `name`／`label`／`kind` で出せる。
- 別マシンの行: `MachineRows.vue` が `machines.agentsInWorkspace`＋`seen.getSeenSeqIn(machineId, ...)` で状態を作る（`components/MachineRows.vue:20-31`）。

---

## 6. 状態（ストア）とイベントの配線

### 6.1 session ストア
- `workspaces`・`tabs`・`panes`・`groups`（すべて `ref(new Map)`）、`focus`、`host`、`clientId` など（`web/src/store/session.ts:9-26`）。更新関数は `applySnapshot`・`paneUpserted`・`paneClosed`・`paneAgentStatusChanged` 等（`session.ts:32-115`）。
- id（`w1`・`p1`）はマシンをまたいで衝突する（`store/machines.ts:12-14`）。

### 6.2 machines ストア（別マシン）
- `machines`（登録の一覧）・`selectedId`（画面の接続が向いているマシン）・`summaries`（選んでいないマシンの要約）・`collapsed`（`store/machines.ts:40-44`）。
- **要約の pane は `{ tabId, agent }` だけ**（`machines.ts:24-25`、`applySummarySnapshot` の `panes[p.id] = { tabId: p.tabId, agent: p.agent }` は `machines.ts` の 93 行付近＝`sed` 出力の 14 行目、`applySummaryEvent` の pane.created/updated も同じ）。**pane の `label`・`title`・`cwd` は持たない**ので、別マシンのノードに `paneNameOf` の呼び名を出すには要約を広げる必要がある（AC1・AC14）。
- 要約は `MachineWiring` が軽い接続（`MachineSummaryClient`）ごとに `applySummarySnapshot`／`applySummaryEvent` へ流す（`actions/MachineWiring.ts:103-124`）。**`machine.changed` 以外のイベントはすべて `applySummaryEvent` へ**（同 107-114）。
- 選んでいるマシンが別マシンのとき、画面の接続（`conn`）はそのマシンの `soda serve` を向く（`main.ts:333-334` `retarget`・`wsUrlFor`）。ローカルへは軽い接続が残る（`MachineWiring.ts:115-121` でローカルの軽い接続に `machine.list` を要求している前例）。→ **グラフがローカルのサーバに置かれる場合、別マシンを選んでいる間のグラフの取得・変更・イベントは画面の接続ではなくローカルの軽い接続を通す必要がある**。共有の設定は「画面の接続がローカルを向いているときだけ」扱う割り切り（`actions/PrefsSync.ts:27-28` の `isLocal`、`main.ts:257`）で、tui は別マシンを見ている間のローカルの `prefs.changed` を軽い接続から拾う前例がある（`tui/src/net/MachineWiring.ts:37, 95`）。

### 6.3 イベントの流れ
- `Connection.handleText`: `"event" in msg` なら `store.applyEvent(event)`（`client-core/src/net/Connection.ts:338-348`。`pane.size_changed` だけ sink にも）。イベント名での検証・振り分けはここでは無い（型キャストのみ）。
- `StoreAdapter.applyEvent` → `applyEventToSession` の switch（`web/src/store/StoreAdapter.ts:78-80, 104-180`）。**default も網羅検査も無い**ので、新しいイベントを足しても型は落ちない（黙って無視）。ストアへ直接当てる例 `command.updated` → `useCommandsStore().setCatalog`（`StoreAdapter.ts:170-172`）、コールバックへ渡す例 `prefs.changed` → `opts.onPrefsChanged`（`StoreAdapter.ts:176-178`、`main.ts:117-118`）。
- イベントの型は `protocol/src/events.ts` の各 interface と `ServerEvent` 合併型（`protocol/src/events.ts:153-178`）。例 `PrefsChangedEvent`（`events.ts:148-151`）。
- RPC は `METHOD_SCHEMAS`（`protocol/src/messages.ts:738-774` 付近、`"prefs.get"`・`"prefs.set"` が 771-772）と `MethodResultMap`（`messages.ts:778-` 、`prefs.*` は 846-847）に足す。`MethodName = keyof typeof METHOD_SCHEMAS`（`messages.ts:776`）。
- tui の同等箇所: `tui/src/model/SessionModel.ts:142-232`（`default: return;` で未知は無視。`SessionModel.ts:229-231`）、`tui/src/net/TuiNet.ts:222-223`。tui にグラフの画面が無ければ、新しいイベントは default で無視されるので tui 側の変更は不要（型も落ちない）。
- 新しいサーバイベント（例 `graph.changed`）の配線手順: (1) `protocol/src/events.ts` に interface と `ServerEvent` への追加、(2) `StoreAdapter.applyEventToSession` に case（新しい `useGraphStore` へ当てる）、(3) 別マシンを選んでいる間のためにローカルの軽い接続側（`MachineWiring.ts:107-114`）でも拾う、(4) 接続のたびに取り直す（`connection.onOpened(...)` の前例 `main.ts:246-248`、`refreshCommands`）。

---

## 7. テスト

- 実行環境: vitest＋happy-dom、`src/**/*.test.ts`（`web/vitest.config.ts`）。`@vue/test-utils` の `mount`、`createPinia()` を毎回作り `localStorage.clear()`（`components/Sidebar.test.ts:1-19`）。ConnectionPort の偽物は requests を記録する形（`Sidebar.test.ts:44-57`）、ActionDispatcher は `vi.fn()` の束を provide（`Sidebar.test.ts:59-62`）。
- ポインタの前例:
  - `new PointerEvent(type, { bubbles, cancelable, pointerId: 1, clientX, clientY })` を `element.dispatchEvent`（`Sidebar.test.ts:35-42`、`PaneFrame.test.ts:352-353`）。
  - ドロップ先は `vi.spyOn(document, "elementFromPoint").mockReturnValue(el)`（`Sidebar.test.ts:844-849`）、`closest` と `getBoundingClientRect` を持つ偽の要素を返す形も（`PaneFrame.test.ts:356-364`）。
  - 大きさは `vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({...})`（`Splitter.test.ts:105-106`）。happy-dom はレイアウトしない（`mobile/TouchScroll.ts:8-9` のコメント）ので、座標計算は純関数に出して別に試すのが流儀。
  - `@vue/test-utils` の `trigger("pointerdown", { clientX })` も使える（`Splitter.test.ts:108-114`）。間引きの送信は fake timer の `advanceTimersByTimeAsync(50)`（同 116 行）。
  - `setPointerCapture` は `?.` で呼ぶ（happy-dom で無い可能性に備える。`Splitter.vue:64`、`PaneFrame.vue:152`）。
- `<dialog>` は happy-dom で `showModal()`・`.open` が使える（`HelpDialog.test.ts:113`）。
- App の結合テスト: `App.test.ts:112-160`（接続状態での切り替え・モバイル判定）。
- 件数固定のテスト（action 追加時に更新）: `client-core/src/keys/bindings.test.ts:38, 44`、`web/src/components/KeySettings.test.ts:70`、`tui/src/actions/TuiDispatcher.test.ts:196-199`。
- 規約: E2E の合否はブラウザ側の観測で（`.aidev/conventions/e2e-observe-browser.md`）、回帰テストは負の確認つき（`.aidev/conventions/regression-negative-control.md`。AGENTS.md の索引）。
- 注意: `client-core` は `dist` を参照する（`client-core/package.json` の `main`/`types` が `./dist/...`）。web／tui の typecheck の前に client-core のビルドが要る場合がある。
