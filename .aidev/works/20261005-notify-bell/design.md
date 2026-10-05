# 仕様: 確認の通知を右上に積み、先送りした通知をベルから見返せるようにする

## 概要

3 つの層に分けて作る（`notify/policy.ts` の流儀「規則は client-core の純関数・状態はストア・ブラウザ API は外」を踏襲）。

1. **規則（`packages/client-core/src/notify/history.ts`・新規）**: 履歴への追加（pane ごとに最新 1 件・50 件・7 日）・解消の判定・復元時の正規化・件数と時刻の表示。純関数だけ。
2. **状態と出入口（`packages/web`）**: `store/notifications.ts` が履歴（マシンごと・`localStorage`）を持ち、`NotificationController` が「入る」「消える」の各出来事を履歴へ繋ぐ。
3. **画面**: `Toast.vue` の置き場所を右上へ。`NotificationBell.vue`（ベル＋バッヂ）・`NotificationHistoryDialog.vue`（ポップアップ）を足し、キー `open_notification_history` を足す。

ベルの件数は **履歴だけ**を数える。待ち行列（`queue`。`prefix+o` の行き先）は今までどおりで、履歴とは**別の置き場**（二重に数えない）。

## 設計方針

- **履歴は「画面から外れたが、まだ意味のある知らせ」**。入り口 3 つ・出口 4 つを表（下）で決める。
- **解消の判定は純関数 1 つ（`isResolved`）に集める**。呼ぶ側は 4 か所（エージェントの変化・スナップショット・pane の閉鎖・既読の変化）で、規則は 1 つ。
- **保存はこのブラウザだけ**（`localStorage`・マシンごと）。理由は decisions D2。
- **トーストの置き場所は CSS だけで決める**（右上・古い順に下へ積む）。位置以外の動作（自動で消える・`sticky`・［移動］・×・クラス名）は変えない（既存の E2E・単体が依存する。research「実装時の注意」）。
- 画面は既存の流儀に合わせる: ポップアップは `<dialog>.showModal()`（`SubagentListDialog` と同じ。decisions D3）、ベルは SVG のボタン。

## 対象範囲

- 追加: `client-core/src/notify/history.ts`（＋test）・`web/src/components/NotificationBell.vue`・`NotificationHistoryDialog.vue`（＋test）。
- 変更: `client-core/src/keys/{bindings,actions}.ts`（＋test）・`client-core/src/index.ts`（再 export）・`web/src/store/{notifications,view}.ts`・`web/src/notify/NotificationController.ts`・`web/src/components/{Toast,Sidebar}.vue`・`web/src/mobile/MobileShell.vue`・`web/src/App.vue`・`web/src/actions/ActionDispatcher.ts`・`web/src/main.ts`・`tui/src/actions/TuiDispatcher.ts`。
- E2E: `packages/e2e/src/specs/notifications.spec.ts`（位置・既存の確認）・新しい `notification-history.spec.ts`。
- docs: `docs/verification.md`・`docs/herdr-parity.md`・`docs/tui-parity.md`・`docs/tui.md`。

## 依拠する既存の事実

research.md の F1〜F14・A1〜A9 に出所がある。設計が直接よりどころにするもの:

- トーストの CSS・寿命・閉じ方: `Toast.vue:79-142`（`.toast-list` は `bottom: 3.5em; left: 50%`）。`view.toast`/`dismissToast`: `store/view.ts:745-753`。
- 「閉じた」の観測点が `syncToasts` 1 か所: `NotificationController.ts:253-257`＋`store/notifications.ts:110-114`（`main.ts:337-342` が `view.toasts` の id 一覧の watch から呼ぶ）。
- 待ち行列の出口: `NotificationController.ts:126-133`（`#pruneMissingPanes`）・`:147-150`（`onPaneClosed`）・`:230-232`（`#drop`）・`:265-296`（`focusNext`/`focusNotification`）。`enqueue` の返す `removed` に「置き換え（同じ pane）」と「押し出し」が混ざる: `policy.ts:121-131`。
- エージェントの状態の材料: `AgentInfo.state/since/completionSeq/instanceId`（`protocol/src/model.ts:139-164`）。鍵の形: `policy.ts:12-14`。`StoreAdapter` が `onAgentChanged`（`next` は `null` でも来る）・`onSnapshotApplied`・`onPaneClosed` を呼ぶ（`StoreAdapter.ts:76,157,165`）。現在のコントローラは `next === null` を捨てている（`NotificationController.ts:80`）。
- 既読は「その pane が見えていて、かつウィンドウにフォーカスがある」ときだけ進む: `agentState.ts:40-59`・`main.ts:478-484`。`useSeenStore.getSeenSeq` はマシンの scope つき: `seen.ts:37-52`。
- ダイアログ・キーの先例: `SubagentListDialog.vue`・`view.ts:255-323,542-563`・`bindings.ts:462-468`・`ActionDispatcher.ts:265-272`・`TuiDispatcher.ts:258`。
- ベルを置く先: `Sidebar.vue:995-1007`（`.sidebar-footer`。畳んでも描かれる）・`MobileShell.vue:80-91`。
- 保存の先例: `seen.ts` の `SEEN_STORAGE_KEY`・`seenKeyFor`（マシンごとの鍵・ブラウザだけ）。

## インターフェース / データ構造

### client-core `notify/history.ts`

```ts
export const MAX_HISTORY = 50;
export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** 履歴に入った理由（表示には使わない。テストと記録のため）。 */
export type HistoryReason = "dismissed" | "evicted" | "no-toast";

export interface HistoryEntry {
  key: NotifyKey;            // `blocked:<instanceId>:<since>` / `done:<instanceId>:<completionSeq>`
  kind: NotifyKind;
  paneId: string;
  instanceId: string;        // 鍵から取る（`parseNotifyKey`）
  seq: number;               // blocked: since / done: completionSeq（鍵から取る）
  label: string;             // 出来事の時点の呼び名（`describeTarget`。後から引き直さない）
  at: number;                // 出来事の時刻（`QueuedNotification.at`）
  reason: HistoryReason;
}

export function parseNotifyKey(key: NotifyKey): { kind: NotifyKind; instanceId: string; seq: number } | null;
export function historyEntryOf(q: QueuedNotification, reason: HistoryReason): HistoryEntry | null; // 鍵が読めなければ null

/** 1 件足す。同じ pane の古いものは消す（最新 1 件）。期限切れを落とし、50 件を超えたら古い順に落とす。新しい順ではなく**追加順**（古い→新しい）の配列を返す。 */
export function addHistory(list: readonly HistoryEntry[], entry: HistoryEntry, now: number): HistoryEntry[];
export function pruneExpired(list: readonly HistoryEntry[], now: number): HistoryEntry[];
export function removeHistoryByKey(list, key): HistoryEntry[];
export function removeHistoryByPane(list, paneId): HistoryEntry[];

/** その pane の現在の状態（呼ぶ側が session・seen から作る）。 */
export interface PaneNow { exists: boolean; agent: AgentInfo | null; seenSeq: number }
export function isResolved(entry: HistoryEntry, now: PaneNow): boolean;
export function reconcileHistory(list: readonly HistoryEntry[], lookup: (paneId: string) => PaneNow): { list: HistoryEntry[]; removed: HistoryEntry[] };

/** 復元時の正規化（壊れた値・形の違う値は捨てる。期限切れも落とす）。 */
export function parseHistory(raw: unknown, now: number): HistoryEntry[];

export function badgeText(count: number): string; // 0 → "" / 1..99 → "n" / 100+ → "99+"
export function ageLabel(now: number, at: number): string; // たった今 / n 分前 / n 時間前 / n 日前
```

### web `store/notifications.ts`（追加）

- `history: Ref<HistoryEntry[]>`（**いまのマシンの scope の分**。追加順）・`historyScope: Ref<string>`（初期 `"local"`）・`historyCount: ComputedRef<number>`。
- `addHistory(entry, now)`・`removeHistory(key)`・`removeHistoryPane(paneId)`・`clearHistory()`・`reconcileHistory(lookup)`（削除した件を返す）・`setHistoryScope(id)`（いまの scope を保存→新しい scope を読み込む。`parseHistory` を通す）。
- 保存: `localStorage["soda.notifyHistory.v1"] = JSON.stringify({ [scope]: HistoryEntry[] })`。変更のたびに自分の scope だけ書き換えて保存（読み書きとも try/catch。読めなければ空・書けなければメモリだけ）。

### web `store/view.ts`

- `DialogContext` に `{ kind: "notificationHistory"; opener?: "bell" }`。
- `toast()`: 短い知らせ（`kind` 無し）が 3 件を超えたら、**短い知らせのうち古いもの**から外す（AC2）。

### web `NotificationController`（追加・変更）

```ts
focusHistoryEntry(key: NotifyKey): void   // 行の［移動］。#focusEntry → 履歴から消す → 待ち行列に同じ鍵があれば #drop。対象が無ければ CLOSED_TARGET_MESSAGE を toast。
dismissHistoryEntry(key: NotifyKey): void // 行の［×］。履歴から消すだけ。
clearHistory(): void                      // 一括。
```

### キー

- `bindings.ts`: `{ id: "open_notification_history", label: "通知の一覧（先送りした知らせ）", group: "全体", defaults: ["prefix+shift+o"], action: { type: "openNotificationHistory" } }`。`actions.ts` の `Action` union に `{ type: "openNotificationHistory" }`。`ActionDispatcher` は `view.openDialogWithContext({ kind: "notificationHistory" })`。TUI は `ui.openDialogWithContext({ kind: "notifications" })`（既存の「知らせの一覧」）。

## 振る舞いの詳細

### 履歴の入り口と出口（AC5・AC11・AC12・AC13・AC15・AC16・AC18）

| # | 出来事 | 履歴 | 待ち行列（今までどおり） |
|---|---|---|---|
| 入 1 | トーストを×・本体クリックで閉じた（`syncToasts` の `dropMissingToasts` が返した件） | **入る**（`dismissed`）。ただし閉じた時点で解消済みなら入れない | 外れる（今までどおり） |
| 入 2 | 待ち行列の上限 8 を超えて押し出された（`push` の `removed` のうち、新しい件と**別の pane**） | **入る**（`evicted`）。解消済みなら入れない | 外れる |
| 入 3 | トーストを「切」にしていて、知らせの時点でトーストが無い（`toastId === null`） | **入る**（`no-toast`）。知らせの時点（`deliver` の `push` の直前）で入れる | 入る |
| 出 1 | 行の［移動］・行本体・`prefix+o`・トーストの［移動］・OS 通知のクリックで、その pane へ移った | **消える**（`prefix+o` 等は `#drop` の前に鍵で履歴からも消す） | 外れる |
| 出 2 | 行の［×］ | 消える | 触らない |
| 出 3 | ［すべて削除］（確定） | 全部消える | 触らない（トースト「切」の人の `prefix+o` の行き先はそのまま） |
| 出 4 | 解消（下の表） | 消える | 触らない |
| 置換 | 同じ pane の新しい知らせが `deliver` された | その pane の古い履歴は消える（最新 1 件） | 今までどおり置き換え |
| 失効 | 7 日を過ぎた・50 件を超えた | 古い順に落ちる | — |

pane の閉鎖（`onPaneClosed`）では待ち行列と同じく、その pane の履歴も消える（出 4 の一種）。

### 解消の判定（AC13・AC14・AC15。`isResolved`）

| 条件 | 対象の種類 | 消える理由 |
|---|---|---|
| pane が無い（`exists === false`） | blocked・done | pane が閉じた（切断中に閉じた分は再接続のスナップショットで拾う） |
| エージェントが居ない（`agent === null`） | blocked・done | エージェントが終了した |
| `agent.instanceId !== entry.instanceId` | blocked・done | 別のエージェントに入れ替わった |
| `agent.state !== "blocked"` または `agent.since !== entry.seq` | blocked | 入力待ちから復帰した（または別の入力待ちに変わった） |
| `agent.state === "working"` または `"blocked"` | done | 完了したエージェントがまた動き出した（利用者が続きを頼んだ・別の承認待ち） |
| `agent.completionSeq > entry.seq` | done | 次の完了が来た（古い完了は置き換わる） |
| `seenSeq >= entry.seq` | done | 完了を見た（その pane が見えていてウィンドウにフォーカスがある。`getSeenSeq(instanceId, agent.serverSeenSeq)`） |

`state === "unknown"` は完了（done）の解消とは数えない（検知の揺れの可能性。残す）。blocked は上の `state !== "blocked"` が先に当たるので、`unknown` でも消える（入力待ちでなくなったため）。

**種類によって解消を判定できないもの**: なし（blocked・done の 2 種類とも、鍵に `instanceId` と時刻/連番を持つので判定できる）。判定できないのは「サーバ再起動で `instanceId` が変わる」場合で、これは入れ替わりとして**消える**（正しい）。

呼ぶ側 4 か所:

1. `onAgentChanged(paneId, prev, next)`: **`next` が `null` でも**、その pane の履歴を `isResolved(entry, { exists: true, agent: next, seenSeq })` で掃除する（先頭の `if (!next) return` より前）。
2. `onSnapshotApplied(panes, first)`: **最初のスナップショットでも**（基準線の `return` より前）、全履歴を、渡された `panes`（存在する pane の一覧）に照らして掃除する。再読み込み後の復元分・切断中の解消を拾う。
3. `onPaneClosed(paneId)`: `removeHistoryPane`。
4. `seen` の変化（`watch(() => seen.seen)`）: 全履歴を `session.panes` に照らして掃除する（完了を見た）。

### 履歴の入れ方（`NotificationController`）

`#toHistory(q: QueuedNotification, reason)`: `historyEntryOf` で鍵を読み、**入れる直前に現在の状態で `isResolved` を引き、解消済みなら入れない**（AC15）。入れたら保存。

`deliver` の順序（OS 通知の `tag` の注意〔`enqueue` の注記〕を保つ）:
1. `store.removeHistoryPane(paneId)`（置換。新しい出来事が古い履歴を置き換える）。
2. `store.push(...)` の `removed` を片付ける（今までどおり `#cleanup`）。**`removed` のうち `paneId` が新しい件と違うものは `#toHistory(e, "evicted")`**。
3. `toastId === null` なら `#toHistory(新しい件, "no-toast")`。

`syncToasts`: `dropMissingToasts` が返した件を `#toHistory(e, "dismissed")`。

`focusNext`/`focusNotification`: 行き先に移る（または対象が消えている）件は `store.removeHistory(key)` も呼ぶ（`#drop` の前）。

### トーストの置き場所（AC1〜AC4。`Toast.vue` の CSS・テンプレートの最小変更）

- `.toast-list`: `position: fixed; top: calc(env(safe-area-inset-top, 0px) + 0.5em); right: calc(env(safe-area-inset-right, 0px) + 0.5em); left: auto; bottom: auto; transform: none; width: min(26em, calc(100vw - 1em)); max-height: 60vh; overflow-y: auto; align-items: stretch`。`z-index: 950` のまま。
- 並び: **古いものが上・新しいものが下**（`view.toasts` の順のまま）。理由: 新しいものが上だと、押そうとしている［移動］が下へずれる。下に積むと、既存の行は動かない。
- 消えない知らせは 1 行（`white-space: nowrap; text-overflow: ellipsis` のまま。`title` に全文）。短い知らせは今までの見た目（`.toast` のまま）。**消えない知らせだけ左に細い帯（`border-left: 3px solid var(--soda-state-blocked)`）**で、短い知らせと見分ける。
- モバイル（`isMobileViewport()`）: `top: calc(env(safe-area-inset-top, 0px) + 3.6rem)`（上部バーの下。バーの高さは 2rem のボタン＋余白）。
- **アニメーション**: `@media (prefers-reduced-motion: no-preference)` の中だけで `.toast { animation: toast-in 0.15s ease-out }`（右からのスライド）。
- `aria-live="polite"` に `role="status"` を足す。閉じるボタンは今までの `aria-label="閉じる"`。
- ダイアログ・グラフ・質問のフォームとの重なり: 今までどおり（`App.vue` の Teleport）。**一般の modal ダイアログ（`showModal()`）の開いている間は、トーストはその下に隠れる**（top layer が勝つ。今までと同じ）。

### ベル（AC9）

- `NotificationBell.vue`: `<button type="button" class="notify-bell" data-notification-bell :aria-label="count > 0 ? '通知の一覧（' + count + ' 件）' : '通知の一覧'" aria-haspopup="dialog" @click="open">`。中に SVG のベル（`aria-hidden`）と、`count > 0` のときだけ `<span class="notify-bell-badge" aria-hidden="true">{{ badgeText(count) }}</span>`。`open` は `view.openDialogWithContext({ kind: "notificationHistory", opener: "bell" })`。
- デスクトップ: `Sidebar.vue` の `.sidebar-footer` の畳むボタンの前に置く（畳んでも見える）。モバイル: `MobileShell.vue` の上部バーの「連携」の前。高さ 2rem 以上。

### ポップアップ（AC10〜AC12・AC16・AC-I1〜I5。`NotificationHistoryDialog.vue`）

- `view.dialogContext.kind === "notificationHistory"` で `showModal()`、閉じるのは `view.closeDialog()`。見出し「判断を先送りした通知（n 件）」。
- 行（新しい順 = `history` の逆順）: `<li>` に `［行本体ボタン］（種類のバッジ「入力待ち」「完了」・呼び名・時刻）` と `［×］（aria-label「削除: <呼び名>」）`。行本体＝［移動］: `view.closeDialog()` → `notifications.focusHistoryEntry(key)`（GotoPicker の「先に閉じる」と同じ順。閉じたあとに `focusPane` するので端末へフォーカスが移る）。
- 空: 「判断を先送りした通知はありません」。
- フッタ: ［すべて削除］（0 件で `disabled`）・［閉じる］。［すべて削除］を押すと**同じ場所が確認に変わる**: 「n 件をすべて削除しますか？」［削除する］［やめる］（フォーカスは［やめる］へ。誤爆を避ける）。［削除する］で `clearHistory()`・［閉じる］へフォーカス。Esc は確認の間だけ確認を取り消す（`@cancel` で `preventDefault`）。
- キー: ↑↓ で行本体のボタン間を移動（端で止まる）・Home/End・Enter（ボタンの既定）で移動・Delete/Backspace で削除（行本体にフォーカスがあるとき）。行を消したら次の行（無ければ前）の行本体へ、0 件なら［閉じる］へフォーカス（AC12）。
- 時刻は 30 秒ごとに `now` を進めて再描画（開いている間だけ）。
- 戻り先（AC-I4）: `opener === "bell"` ならベル（`[data-notification-bell]`）へ、そうでなければ `registry.focus(view.focusedPaneId)`（`SubagentListDialog.close` と同じ）。

### 復元・再接続（AC7・AC14）

- 起動: ストアが `localStorage` から `local` の履歴を `parseHistory` で読む。最初のスナップショットで `reconcileHistory`（上の 2）。
- マシンの切り替え: `main.ts` の `setSeenScope: (id) => { seen.setScope(id); notifications.setHistoryScope(id) }`。切り替え先の履歴を読み込み、切り替え先の最初のスナップショットで掃除する。
- 再接続: `onSnapshotApplied(…, false)` で掃除する。

## ドメイン固有の考慮

- 実体の id は UUID（AGENTS.md）。履歴が持つ `paneId`・`instanceId` は不透明な文字列として扱い、**マシンごとの scope で分ける**（id がマシンをまたいで衝突する。`seen.ts` と同じ理由）。
- 端末版（`soda` 引数なし）は対象外。`openNotificationHistory` は端末版では既存の「知らせの一覧」（未処理の知らせ。端末版だけ）を開く操作に読み替える。
- `e2e-observe-browser`: 位置・件数・ポップアップは DOM と `getBoundingClientRect` で判定。`regression-negative-control`: 位置・解消・一括削除の E2E は、実装を元へ戻して落ちることを確かめる（tasks に書く）。

## エラー処理 / 異常系

- `localStorage` が読めない・書けない・壊れている: 空の履歴で動く（`parseHistory` は未知の形を捨てる）。保存の失敗は黙って無視（メモリだけで動く）。
- 鍵が読めない（`parseNotifyKey` が `null`）: 履歴に入れない（待ち行列への入り方は変えない）。
- 行の対象 pane がもう無い: ［移動］は `CLOSED_TARGET_MESSAGE` を出して行を消す。
- 履歴が 0 件のときの［すべて削除］: `disabled`。確認の途中で 0 件になったら確認を閉じる。
- 開いている間に行が解消で消える: 選択行は次の行へ寄る・0 件なら空の表示。

## 受け入れ基準との対応

- AC1: `Toast.vue` の `.toast-list` を右上固定へ。入力: `position: fixed` の座標（CSS）。E2E が `.toast-list` と pane の下端の入力エリア（`.xterm-helper-textarea` の親の `.xterm`）の `getBoundingClientRect` が交差しないことを測る（デスクトップ・iPhone 13 の幅）。
- AC2: 古い順に下へ積む CSS と、`view.toast` の短い知らせの上限 3。入力: `view.toasts`（`view.toast()` の呼び出し）。単体＋E2E（複数並べて矩形が重ならない）。
- AC3: モバイルの `top`・安全領域の `env()`・`App.vue` の Teleport は変えない。入力: `isMobileViewport()`（画面幅）。E2E（モバイルの幅でトーストと上部バーのボタンの矩形が交差しない）。
- AC4: `role="status"`・`aria-live="polite"`・`aria-label="閉じる"`・`prefers-reduced-motion`。入力: テンプレート／CSS。コンポーネントテストで属性を確かめる。
- AC5: 「履歴の入り口と出口」の入 1〜3。入力: `syncToasts`（`dropMissingToasts` の戻り）・`push` の `removed`・`toastId === null`。単体（コントローラ）。
- AC6: `addHistory`（pane ごとに最新 1 件・50 件・7 日）。入力: `HistoryEntry[]` と `now`。単体（client-core）。
- AC7: `store/notifications.ts` の保存・`setHistoryScope`。入力: `localStorage["soda.notifyHistory.v1"]`・`machines` の切り替え（`setSeenScope` の結線）。単体（ストア）＋E2E（再読み込みで残る）。
- AC8: `historyEntryOf` が `blocked`/`done` の鍵だけを受ける。入力: `QueuedNotification.key`。単体。
- AC9: `NotificationBell.vue`・`badgeText`・`Sidebar.vue`・`MobileShell.vue`。入力: `store.historyCount`。コンポーネントテスト＋E2E（バッヂの数・畳んだサイドバー・モバイル）。
- AC10: `NotificationHistoryDialog.vue`・`ageLabel`。入力: `store.history`・`Date.now()`。コンポーネントテスト＋E2E。
- AC11: `focusHistoryEntry`（`#focusEntry` を再利用）。入力: `session.panes`・`session.tabs`。単体＋E2E（tab バーの選択で判定）。
- AC12: ダイアログの削除後のフォーカス。入力: 行の DOM。コンポーネントテスト。
- AC13: 解消の判定の表（`isResolved`）と呼ぶ側 4 か所。入力: `AgentInfo`（`pane.agent_status_changed`・スナップショット）・`useSeenStore`・`session.panes`。単体（総当たり）＋E2E（偽のエージェントの入力待ち→復帰で消える）。
- AC14: 最初のスナップショットでの掃除（呼ぶ側 2）。入力: `onSnapshotApplied` の `panes`・復元された履歴。単体（再読み込みの模擬）＋E2E（再読み込み）。
- AC15: `#toHistory` が入れる直前に `isResolved`。入力: 現在の `session.panes`・`seen`。単体。
- AC16: ダイアログの 2 段階。入力: ボタンの操作。コンポーネントテスト＋E2E。
- AC17: 既存の `NotificationController.test.ts`・`Toast.test.ts`・`notifications.spec.ts` が変更なしで通る（クラス名・文言・順序を保つ）。入力: 既存のテスト。
- AC18: ベルは `store.historyCount`（履歴）だけ。`prefix+o`・`focusNotification`・OS 通知のクリックは `store.removeHistory(key)` を呼ぶ。入力: 鍵。単体。
- AC19: `bindings.ts`・`actions.ts`・`ActionDispatcher`・`TuiDispatcher`。入力: キーの定義・`KeyRouter`。`bindings.test.ts`・`keymap.test.ts`・`ActionDispatcher.test.ts`・`TuiDispatcher.test.ts`。
- AC20: docs の更新（tasks の最後）。
- AC-I1: 開く＝ベル・`prefix+shift+o`、閉じる＝Esc（`@cancel`）・［閉じる］・背景（`@click.self`）。入力: `view.dialogContext`。コンポーネントテスト＋E2E。
- AC-I2: ［移動］は確定（先に閉じて移る）、［×］は 1 件削除、［すべて削除］は 2 段階で Esc・［やめる］が取り消し。入力: ボタン・`@cancel`。コンポーネントテスト＋E2E。
- AC-I3: ↑↓・Home/End・Enter・Delete/Backspace・Tab・Esc。入力: ダイアログの `@keydown`。コンポーネントテスト＋E2E（キーだけで開いて移動・削除・閉じる）。
- AC-I4: 開いたら最初の行（無ければ［閉じる］）、閉じたらベル（`opener === "bell"`）か端末。入力: `view.dialogContext.opener`・`registry.focus`。コンポーネントテスト＋E2E。
- AC-I5: `showModal()` の既存の経路（背後へキー・ホイールが漏れない）。トーストの［移動］・×は変えない。入力: 既存の `KeyInputController` のダイアログのモード。既存の E2E（`key-bindings.spec.ts`）と新しい E2E の通過。
