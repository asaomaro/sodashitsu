# 調査: 確認の通知の置き場所・履歴・ベル

起動理由（protocol「4.5」）: 利用者が操作する部品（一覧のポップアップ・ベルのボタン）を作る／未検証の既存挙動（トーストを閉じたときの待ち行列の扱い）に依存する。
**外部の一次資料（WAI-ARIA APG・WCAG）はこの環境で取得していない**。下の「確立したパターン」は既知の仕様の要約で、`file:line` ではなく名称で示す。設計はこれに寄せるが、
**仕様の文面との逐語の照合は未実施**（review でも照合しない。規則の根拠は既存コードの先例を優先する）。

## 調査の問い
- Q1: 今のトーストの置き場所・寿命・閉じ方と、待ち行列（`queue`）との関係は。
- Q2: トーストを閉じたとき（×・本体クリック）に何が起きるか。履歴の入り口をどこに置くか。
- Q3: 出来事の解消を判定する材料（エージェントの状態・`since`・`completionSeq`・既読）は何があり、どのフックで届くか。
- Q4: ポップアップ・キー・ベルの置き場所に使える既存の部品・流儀は。
- Q5: 履歴の保存先（localStorage／サーバ共有）の既存の流儀は。
- Q6: 端末版・E2E・docs への波及は。
- Q7: 確立した UI パターン（ダイアログ・通知のライブリージョン・バッヂ）の要点。

## 判明した事実
- F1（Q1）トーストは `Toast.vue` の `.toast-list`（`position: fixed; left: 50%; bottom: 3.5em; transform: translateX(-50%)`、`z-index: 950`、`max-height: 40vh; overflow-y: auto`、`max-width: min(90vw, 36em)`）。`aria-live="polite"`。短い知らせは 4 秒（`AUTO_DISMISS_MS`）、`sticky` は消えない。本体のクリックは「消す」、`sticky` は［移動］（`actions`）と［×］を持つ（`packages/web/src/components/Toast.vue:79-142`）。
- F2（Q1）トーストの状態は `view.toasts`（`store/view.ts:453`）、`toast(message, opts)` が id を振り（`:745`）、`dismissToast(id)` が外す（`:751`）。`Toast` 型は `kind?: "sticky"`・`actions`・`wrap`（`:228-248`）。
- F3（Q2）トーストを閉じる経路は `Toast.vue` の `dismiss` → `view.dismissToast` だけ。**知らせ側はその事実を `main.ts` の `watch(view.toasts の id 一覧)` → `NotificationController.syncToasts()` で拾い**（`main.ts:337-342`、`NotificationController.ts:253-257`）、`store.dropMissingToasts`（`store/notifications.ts:110-114`）が**待ち行列から外す**。つまり**×で閉じた知らせは `prefix+o` の行き先からも消える**（要望の「後から見れない」の原因）。
- F4（Q2）待ち行列から外れる経路は `enqueue`（同じ pane の置き換え・上限 8 の押し出し。`client-core/src/notify/policy.ts:121-131`）・`removeByKey`・`removeByPane`（`:134-141`）。コントローラの出口は `#drop(key)`（`NotificationController.ts:230-232`）・`onPaneClosed`（`:147-150`）・`#pruneMissingPanes`（`:126-133`）・`focusNext`/`focusNotification`（`:265-296`）。トースト「切」のとき `toastId` は `null`（`:200-207`）で、キューにだけ入る。
- F5（Q3）エージェントの状態: `AgentInfo.state`（`blocked|working|idle|unknown`）・`since`（状態が変わった時刻）・`completionSeq`（working→idle で +1）・`instanceId`（検出ごと）・`serverSeenSeq`（`protocol/src/model.ts:139-164`）。鍵は `blocked:<instanceId>:<since>` / `done:<instanceId>:<completionSeq>`（`policy.ts:12-14`）。
- F6（Q3）フック: `StoreAdapter` が `onAgentChanged(paneId, prev, next)`（`StoreAdapter.ts:165`）・`onSnapshotApplied(panes, first)`（`:76`）・`onPaneClosed`（`:157`）を呼び、`main.ts:118-121` が `NotificationController` へ繋ぐ。再接続は `onSnapshotApplied(…, false)`、マシンの切り替えは `resetForMachineSwitch()`→`resetBaseline()`（`MachineSwitcher.ts:72-73`）。**`next` が `null` のとき（エージェントが居なくなった）も `onAgentChanged` は呼ばれるが、現在のコントローラは `if (!next) return` で捨てている**（`NotificationController.ts:80`）。
- F7（Q3）既読: `useSeenStore.getSeenSeq(instanceId, fallback)`（`store/seen.ts:48`）・`markSeen`。**マシンごとの scope**（`setScope`・`seenKeyFor`。`:37-52`）。既読を進めるのは `main.ts:478-484` の `markVisibleAgentsSeen`（`sweepMarkSeen`）で、**その pane が画面に出ていて、かつウィンドウにフォーカスがあるとき**だけ（`client-core/src/agent/agentState.ts:40-59`。20260925-seen-semantics-fix で直った。20260920-agent-notifications の requirements にある「フォーカスだけで全 pane を既読にする」は古い）。したがって `done` の知らせは「その pane を見たら既読になる」ので、**「完了を見た＝対処した」の解消条件に使える**（decisions D6）。既読は `completionSeq` の前進・`focus` イベントで再評価される。
- F8（Q4）ダイアログの流儀: `view.openDialogWithContext({kind})`（`view.ts:542`）→ コンポーネントが `watch(view.dialogContext)` で `showModal()`、閉じるのは `view.closeDialog()`（開く前の pane へフォーカスを戻す。`:558-563`）。先例は `SubagentListDialog.vue`（ボタンから開いたときの戻り先・`@cancel` で Esc・`@click.self` で背景）・`GotoPicker.vue`（`@keydown` で ↑↓・Enter）。`DialogContext` の union に足す（`view.ts:255-323`）。
- F9（Q4）キー: `client-core/src/keys/bindings.ts` の定義 1 つ（`id`・`label`・`group`・`defaults`・`action`）＋ `actions.ts` の `Action` union ＋ `ActionDispatcher.run` の `switch`（`:185` 付近）。**`switch` に `default` も網羅性検査も無い**（`ActionDispatcher.ts:176-178` のコメント）ので足し忘れは黙って無動作。`prefix+shift+s`（`show_subagents`）が最新の先例（`bindings.ts:462-468`）。使われている `prefix+shift+*` は a b d g h j k l n p r s t w x。**`prefix+shift+o` は空き**（`prefix+o` = 次の知らせ。対になる）。設定の「キー」は定義から自動で並ぶ（`KeySettings.vue`）。
- F10（Q4）ベルの置き場所: デスクトップのサイドバーは `.sidebar-footer`（畳んだ状態でも描かれ、`margin-top: auto; justify-content: flex-end`。`Sidebar.vue:995-1007`・`:1353-1368`）に畳むボタンだけがある。タブバーは 1 つのとき自動で隠れる・下にも置ける（`TabBar.vue:55`・`:144-147`）ので、**タブバーには置けない**。モバイルは `MobileShell.vue:80-91` の上部バー（`workspace / tab`・この端末に合わせる・⌨・連携・設定）。**既存のコメントは絵文字のボタンを避けている**（`:82-85`）ので SVG にする。
- F11（Q5）設定の保存は `soda.prefs.v1`＋`PrefsSync`（サーバ共有。端末ごとの項目を除く）。**id がマシンをまたいで衝突する**ものは別の流儀: 既読 `soda.seen.v1` は `m:<machineId>:` を鍵に付けて localStorage だけに置く（`seen.ts:37-39`）。共有の設定には pane の id・時刻つきの一覧を置かない（`PrefsSync` は大きすぎると断られる〔`invalid_params`〕・全項目が全ブラウザへ飛ぶ）。
- F12（Q6）端末版にも `nextNotification` があり、**未処理の知らせの一覧 `NotificationList`（`{kind:"notifications"}`）がある**（`tui/src/modes/NotificationList.ts`・`TuiApp.ts:912`）。`Action` union に足す型は TUI の `TuiDispatcher.run` の `switch` にも足す（`:179` 付近）。`docs/tui-parity.md` の H29/H29e 行に扱いを書く。
- F13（Q6）E2E は `packages/e2e/src/specs/notifications.spec.ts`。`.toast`・`.toast-action`・`.toast-close`・`.tab-bar-item` を見ている（クラス名を変えない）。偽のエージェント（`launchFakeAgent`）・`blockWindow`・`openNewTab`・`installNotifyProbe` が使える。モバイルは `devices["iPhone 13"]`（同ファイル末尾）。
- F14（Q7）確立したパターン（既知の仕様の要約・未照合）:
  - **モーダルなダイアログ**（WAI-ARIA APG の Dialog (Modal)）: 開いたら中の要素へフォーカス、Tab は中で循環、Esc で閉じる、閉じたら開いた要素へ戻す。HTML `<dialog>.showModal()` は背景を inert にして Esc・フォーカスの戻りを満たす（`SubagentListDialog` と同じ）。
  - **通知の一覧のボタン**: 件数のバッヂは見た目だけにして、ボタンの `aria-label` に件数を入れる（バッヂ自体は `aria-hidden`）。0 件のとき件数を付けない。多くの実装は 99+ で切る。
  - **トーストの領域**: `role="status"`／`aria-live="polite"`（WCAG 4.1.3 状況メッセージ）。**消える時間のあるものは WCAG 2.2.1 の「時間制限」に当たる**ので、消えない知らせ（sticky）が正しい——この製品は既にそう（4 秒のものは情報の確認のみ）。動きは `prefers-reduced-motion` に従う。
  - **一覧の行**: 行の中に主操作（移動）と副操作（削除）の 2 つのボタン。矢印で行を移り、Enter で主操作、Delete で副操作。
  - **一括削除**: 取り消せない操作は 2 段階の確認（またはアンドゥ）。この画面には元に戻す置き場が無く、既存の確認ダイアログ（`ConfirmDialog`）は**ポップアップの中に重ねるには重い**ので、**同じ場所で 2 段階**に切り替える（design D5）。

## 影響範囲
- `packages/client-core`: `notify/history.ts`（新規・純関数）・`notify/policy.ts`（変更なし）・`keys/bindings.ts`・`keys/actions.ts`。
- `packages/web`: `store/notifications.ts`（履歴の状態）・`notify/NotificationController.ts`（出入口）・`components/Toast.vue`・`components/NotificationBell.vue`（新規）・`components/NotificationHistoryDialog.vue`（新規）・`components/Sidebar.vue`・`mobile/MobileShell.vue`・`App.vue`・`store/view.ts`（`DialogContext`）・`actions/ActionDispatcher.ts`・`main.ts`（結線）。
- `packages/tui`: `actions/TuiDispatcher.ts`（1 つの case）。
- `packages/e2e`: `specs/notifications.spec.ts` の変更と新しい spec。
- docs: `docs/verification.md`・`docs/herdr-parity.md`・`docs/tui-parity.md`・`docs/tui.md`。

## 実現性 / リスク
- 解消の判定は `AgentInfo` だけで足りる（F5）。**ただし F6 の通り `next === null` が現状は捨てられている**ので、履歴の掃除には拾う口が要る。
- 「トーストを閉じた」を履歴の入り口にすると、**トーストの寿命が `view.toasts` の外（Toast コンポーネントの `dismiss`）に散らばる**（F3）。観測点は `syncToasts` 1 つなのでそこへ足す。
- 再読み込みでは `judged`（判定済みの鍵）が空になる。**履歴は localStorage から復元するので、最初のスナップショットで必ず突き合わせて掃除する**（AC14）。
- モバイルの上部バーの右端にトーストを重ねるとボタンが押せなくなる（F10）→ バーの下に出す。

## 実装アンカー
- A1: トーストの位置・見た目（`packages/web/src/components/Toast.vue:79-142`）
- A2: トーストを閉じたことの観測点（`packages/web/src/notify/NotificationController.ts:253` `syncToasts`、`store/notifications.ts:110` `dropMissingToasts`）
- A3: 待ち行列の出口（`NotificationController.ts:230` `#drop`・`:147` `onPaneClosed`・`:126` `#pruneMissingPanes`・`client-core/src/notify/policy.ts:121` `enqueue`）
- A4: エージェント状態のフック（`NotificationController.ts:78` `onAgentChanged`・`:92` `onSnapshotApplied`・`StoreAdapter.ts:165`）
- A5: ダイアログの先例（`components/SubagentListDialog.vue`・`store/view.ts:255` `DialogContext`・`:542` `openDialogWithContext`・`:558` `closeDialog`）
- A6: キーの先例（`client-core/src/keys/bindings.ts:462` `show_subagents`・`actions.ts:97`・`web/src/actions/ActionDispatcher.ts:265`・`tui/src/actions/TuiDispatcher.ts:258`）
- A7: ベルの置き場所（`components/Sidebar.vue:995` `.sidebar-footer`・`mobile/MobileShell.vue:80` 上部バー）
- A8: 保存の先例（`web/src/store/seen.ts` の `SEEN_STORAGE_KEY`・`seenKeyFor`）
- A9: E2E の先例（`packages/e2e/src/specs/notifications.spec.ts` の `launchFakeAgent`・`installNotifyProbe`）

## 実装時の注意
- 既存の E2E・単体は `.toast`・`.toast-action`・`.toast-close` のクラス名と `aria-label="閉じる"` に依存する。**名前を変えない**。
- `Toast.vue` は `App.vue` で `graphOpen`／`askOpen` のとき dialog の中へ Teleport される。**位置の CSS は Teleport 先でも効く**ようにする（`position: fixed` のまま）。
- `main.ts` は読み込むと起動するので単体テストできない。結線は最小にして、規則は `NotificationController`／ストアに置く。
- 待ち行列からの除去（`#drop`）は OS 通知の後片付けとトーストの除去を兼ねる。**履歴への出入りは `#drop` とは別の出口**にする（履歴に入る知らせは「画面から外れたが、忘れない」もの）。
- `Toast.vue` の自動消去タイマーは「新しく増えた id」にだけ掛ける。**位置を変えても `sticky` に掛けない規則は保つ**。

## design への申し送り
- 履歴の入り口は 3 つ（×・押し出し・トースト「切」）で、出口は 4 つ（移動・×・一括・解消）。**表にして決める**。
- 解消の判定は純関数にする。`done` は既読（その pane を見た）でも解消とする（F7）。
- 保存はマシンごとの localStorage（F11）。
- 端末版は `NotificationList` を開く読み替え（F12）。
