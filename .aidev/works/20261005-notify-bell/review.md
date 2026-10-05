# レビュー記録: notify-bell

## タスク点検ログ

- T4 [should] 履歴の置き換え（`removeHistoryPane`）の回帰テストが無効（行を消しても通る）→ 古い履歴を解消させない状態（agent は入力待ちのまま）で別の鍵を直に配送する形に直し、行を消すと落ちることを確認 [conv:regression-negative-control]
- T4 [should] 押し出しの条件（`e.paneId !== paneId`）の回帰テストが無効（外しても通る）→ 置き換えられる古い件が未解決の状態で確かめる形に直し、条件を外すと落ちることを確認 [conv:regression-negative-control]

## ラウンド 1（2026-10-05・独立レビュー）

- [should][conv:regression-negative-control] packages/e2e/src/specs/notification-history.spec.ts 解消の E2E が pane の exited 経路だけで、`onAgentChanged` の掃除（`reconcileHistory`）を外しても通る（test-result.md の N2） — 根拠: notification-history.spec.ts「画面を開いている間にエージェントが居なくなると」 / 対応: 修正済（`FakeAgent` に `work()`／`idle()` を足し、画面を開いたまま入力待ち→動き出す／完了→また動き出す、の E2E を 2 本。`onAgentChanged` の掃除を外すと両方落ちる）
- [nit][conv:-] packages/web/src/store/notifications.ts 同じマシンの別タブが履歴を互いに上書きする（全件を書くだけで `storage` の取り込みが無い） — 根拠: `saveHistory`/`setHistory` / 対応: 修正済（`storage` イベントで、いまのマシンの履歴キーが変わったら読み直し、`externalChangeSeq` で `NotificationController` がいまの状態と突き合わせて掃除。単体 4 件＋コントローラ 1 件。D15）
- [nit][conv:-] packages/web/src/store/notifications.ts 7 日の期限切れが、ページを開いたままだと落ちない — 根拠: `pruneExpired` の呼び出しが `addHistory`・読み込みだけ / 対応: 修正済（`reconcileHistory` で期限も見る・`main.ts` の 30 秒タイマ。単体）
- [nit][conv:-] 短い知らせの `pointer-events: none`・同時 3 件超の短い知らせが古い方から落ちる — 根拠: D13 / 対応: 対応しない（D16。履歴・ベルに残るため）

### 壊して落ちる確認（regression-negative-control）

- E2E（`web` を再ビルドして実行）: `NotificationController.onAgentChanged` の `this.#reconcileHistory({ paneId, agent: next })` を外す →
  `✘ notification-history.spec.ts:207 履歴：入力待ちの知らせは、…動き出すと履歴から自動で消える (21.7s)` ／ `✘ …:233 履歴：完了の知らせは、…また動き出すと…消える (21.5s)`（どちらも `expect(locator).toHaveCount(expected) failed  Expected: 0  Received: 1`）。戻して再ビルド → 2 本とも通る。`git diff` はこの修正の差分のみ（外した行は戻っている）。
- 単体: `storage` のリスナ登録を外す → `× 別タブが全件削除すると、こちらのメモリからも消え、次に書いても戻らない`・`× 別タブが足した件が見え、…合図が進む`（2 failed）。コントローラの `externalChangeSeq` の watch を外す → `× 別タブが書いた履歴を取り込み、いまの状態で解消済みの件は落とす…`（1 failed）。`reconcileHistory` の期限掃除（`pruneExpired`）を外す・`pruneExpiredHistory` を空にする → `× 7 日を過ぎた件は、…ページを開いたままでも落ちる`（各 1 failed）。いずれも戻すと 135 件が通る（`git diff` で戻りを確認）。

## ラウンド 2（再レビュー 34c1ae4）

- [must][conv:regression-negative-control] packages/web/src/notify/NotificationController.ts 最初のスナップショット前（読み込み直後・マシン切替の最中）に `storage` イベントが来ると、`session.panes` が空のため全件が「pane が無い＝解消」で落ち、空が共有の localStorage へ書かれて他タブも空になる — 根拠: `externalChangeSeq` の watch → `#reconcileHistory` → `#paneNow` / 対応: 修正済（コントローラに `#snapshotApplied` の旗。`onSnapshotApplied` で立て `resetForMachineSwitch` で下ろし、下りている間は `#reconcileHistory`〔storage・既読の watch・`onAgentChanged` の経路すべて〕で照合しない。スナップショット適用時の掃除が後で追いつく。期限掃除は時刻だけなので旗なし）
- 副産物: テストで前のテストのストアが `storage` を聞き続けて localStorage を汚したので、ストアの購読を `onScopeDispose` で外し、テストの afterEach で pinia を止める。

### 壊して落ちる確認

- 旗の判定（`if (!this.#snapshotApplied) return;`）を外す → `× スナップショット前の storage イベントでは件が残り、localStorage にも空を書かない`・`× マシン切替の途中（旗を下ろした後）でも同じ。…`（2 failed | 103 passed）。
- `resetForMachineSwitch` の旗を下ろす行を外す → `× マシン切替の途中（旗を下ろした後）でも同じ。…`（1 failed | 104 passed）。
- 戻すと 105 件が通る（`git diff` は修正の差分のみ）。「スナップショット適用後に別タブの変更を取り込んで掃除する」は既存のテスト（`別タブが書いた履歴を取り込み、いまの状態で解消済みの件は落とす…`）が守る。
