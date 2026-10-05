# タスク: 確認の通知を右上に積み、先送りした通知をベルから見返せるようにする

## 実装方針

下から積む: ①規則（client-core の純関数）→ ②状態と保存（ストア）→ ③出入口（コントローラ）→ ④画面（トースト・ベル・ポップアップ）→ ⑤キー・結線 → ⑥E2E → ⑦docs。
規則とコントローラは壊れやすい（状態・保存と復元・再接続）ので、その 3 タスク（T1・T3・T4）にだけ**タスクごとの独立点検（`aidev taskcheck`）**を掛ける。
画面・docs・E2E は掛けず、全タスクの後の全体の点検（`cross`）と最後の独立レビューにまとめる（AGENTS.md「点検とテストの掛け方」）。
全体のビルド・型検査・テストは実装のセッションが 1 回流して報告する（二重に流さない）。

## 作業順序と依存関係

下の `依存:` に従う。T1 → T3 → T4 が背骨。T6（トーストの位置）は独立なので早めに入れて見た目を確かめてよい。

## リスク / 留意点

- 既存の E2E・単体は `.toast`・`.toast-action`・`.toast-close`・`aria-label="閉じる"` に依存する。クラス名・文言を変えない。
- 履歴への入り口・出口がコントローラの数か所に散る。**`#toHistory` と `store.removeHistory` を通す**（直に配列を触らない）。
- 最初のスナップショットの掃除は、基準線の `return` より前に置く（置き場所を間違えると再読み込み後に復活する。AC14）。
- `docs/` の検証手順は実機（モバイル・OS 通知）の項目を含む。ここでは書くだけで実行しない。

## テスト方針

- 単体: `history.ts` を総当たり（表の全行・境界）・ストア（保存・scope・壊れた値）・コントローラ（入口 3・出口 4・解消 4 か所・復元）・ダイアログ／ベル／トースト（属性・キー・フォーカス）。
- E2E: 位置（`getBoundingClientRect`）・バッヂ・ポップアップ・一括削除・解消・再読み込み・モバイルの幅。**位置・解消・一括削除は実装を元へ戻して落ちることを確かめ**、生の出力を `test-result.md` に貼る（`regression-negative-control`）。判定はブラウザの DOM（`e2e-observe-browser`）。

## タスク

- [ ] T1: 履歴の規則を純関数で実装する（`parseNotifyKey`・`historyEntryOf`・`addHistory`・`pruneExpired`・`removeHistoryByKey`/`ByPane`・`isResolved`・`reconcileHistory`・`parseHistory`・`badgeText`・`ageLabel`）。`index.ts` から再 export。表の全行・境界を単体で総当たり。**タスク点検あり**。
      対象: `packages/client-core/src/notify/history.ts`（新規）・`history.test.ts`（新規）・`packages/client-core/src/index.ts` / 根拠: research A3・A4、design「インターフェース」
      依存: なし
      AC: AC6, AC8, AC13, AC14, AC15
- [ ] T2: キー `open_notification_history`（既定 `prefix+shift+o`）を足す。`Action` に `openNotificationHistory`。TUI の `TuiDispatcher.run` は既存の「知らせの一覧」を開く。`bindings.test.ts`・`keymap.test.ts`・TUI の単体を足す。
      対象: `packages/client-core/src/keys/bindings.ts:462`・`actions.ts:97`・`packages/tui/src/actions/TuiDispatcher.ts:258` / 根拠: research A6
      依存: なし
      AC: AC19
- [ ] T3: 履歴の状態をストアへ（`history`・`historyScope`・`historyCount`・`addHistory`・`removeHistory`・`removeHistoryPane`・`clearHistory`・`reconcileHistory`・`setHistoryScope`。`soda.notifyHistory.v1` にマシンごと保存。読み書きは try/catch）。**タスク点検あり**。
      対象: `packages/web/src/store/notifications.ts` / `notifications.test.ts` / 根拠: research A8（`seen.ts`）
      依存: T1
      AC: AC6, AC7
- [ ] T4: コントローラへ履歴の入口・出口を結線する（入 1: `syncToasts`・入 2: `push` の押し出し・入 3: `toastId === null`・置換・出 1: `focusNext`/`focusNotification`・`onPaneClosed`・解消 4 か所〔`onAgentChanged`（`next === null` を含む）・`onSnapshotApplied`（最初も）・`onPaneClosed`・`seen` の watch〕・`focusHistoryEntry`・`dismissHistoryEntry`・`clearHistory`）。`#toHistory` が入れる前に `isResolved` を引く。既存の単体が変更なしで通ること。**タスク点検あり**。
      対象: `packages/web/src/notify/NotificationController.ts:78,92,126,147,230,253,265,285` / `NotificationController.test.ts` / 根拠: research A2・A3・A4
      依存: T1, T3
      AC: AC5, AC11, AC13, AC14, AC15, AC17, AC18
- [ ] T5: `view.ts` に `DialogContext` の `notificationHistory` を足し、`toast()` の短い知らせの上限 3 を入れる。`ActionDispatcher` に `openNotificationHistory`。`main.ts` の `setSeenScope` で `setHistoryScope` も呼ぶ。
      対象: `packages/web/src/store/view.ts:255,745` / `packages/web/src/actions/ActionDispatcher.ts:185` / `packages/web/src/main.ts:379` / 根拠: research A5・A6
      依存: T2, T3
      AC: AC2, AC7, AC19
- [ ] T6: トーストを右上の積みにする（CSS・`role="status"`・`title`・sticky の左の帯・モバイルの `top`・`prefers-reduced-motion`）。クラス名・文言は変えない。単体で属性・クラスを確かめる。
      対象: `packages/web/src/components/Toast.vue:79-142` / `Toast.test.ts` / 根拠: research A1
      依存: なし
      AC: AC1, AC2, AC3, AC4
- [ ] T7: ベル（`NotificationBell.vue`：SVG・バッヂ・`aria-label`）を作り、`Sidebar.vue` の下端と `MobileShell.vue` の上部バーに置く。コンポーネントテスト。
      対象: `packages/web/src/components/NotificationBell.vue`（新規）・`Sidebar.vue:995`・`packages/web/src/mobile/MobileShell.vue:80` / 根拠: research A7
      依存: T1, T3, T5
      AC: AC9
- [ ] T8: ポップアップ（`NotificationHistoryDialog.vue`）を作り `App.vue` に置く（一覧・［移動］・［×］・空・［すべて削除］の 2 段階・キー・フォーカス・時刻の更新）。コンポーネントテスト。
      対象: `packages/web/src/components/NotificationHistoryDialog.vue`（新規）・`packages/web/src/App.vue` / 根拠: research A5（`SubagentListDialog.vue`・`GotoPicker.vue`）
      依存: T4, T5
      AC: AC10, AC11, AC12, AC16, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T9: E2E を足す（位置・積み・モバイルの幅・ベルとバッヂ・ポップアップ・一括削除・解消・再読み込み・キーだけの操作）。既存の `notifications.spec.ts` が通ること。位置・解消・一括削除は実装を戻して落ちることを確かめ、出力を `test-result.md` 用に控える。
      対象: `packages/e2e/src/specs/notification-history.spec.ts`（新規）・`notifications.spec.ts` / 根拠: research A9
      依存: T4, T6, T7, T8
      AC: AC1, AC2, AC3, AC5, AC7, AC9, AC10, AC11, AC13, AC14, AC16, AC-I3, AC-I4
- [ ] T10: docs を直す（`docs/verification.md` の手動項目・`docs/herdr-parity.md` の H29・`docs/tui-parity.md`・`docs/tui.md` のキー一覧）。
      対象: `docs/verification.md:1202` 付近・`docs/herdr-parity.md:61`・`docs/tui-parity.md:74`・`docs/tui.md:123` / 根拠: research「影響範囲」
      依存: T4, T8
      AC: AC20
