# テスト結果: 確認の通知を右上に積み、先送りした通知をベルから見返せるようにする

対象: `feature/notify-bell` の HEAD（origin/main `97c0c32` は取り込み済み・`Already up to date`）。実行は **Node v24.15.0**。

## 実行したもの

- `pnpm install --offline` → `pnpm build` → `pnpm typecheck` → `pnpm test`（全体）— 終了コード 0。web 側 **420 files / 8199 passed / 0 failed**（test 工程で足した単体 2 件を含めた再実行は、`packages/web` の `src/notify` 133 passed、`client-core` の `history.test.ts` 63 passed）。
- `aidev smoke` を 2 回（この worktree は作業フォルダの外）— どちらも **pass（10 本）**。
- `pnpm lint` — 22 errors（main と同じ件数。この work で足した・変えたファイルのものは無い）。テストを足した後も 22。
- E2E 全体 1 回（`packages/e2e`）— 317 passed / **17 failed**（下の切り分け）。
- E2E の絞り込み 2 回（`notification-history`・`notifications`・`key-bindings`・`keys-mouse-dialogs`・`workspace-groups`）— 各回 **82 passed / 2 failed**（失敗は main の既知の `key-bindings.spec.ts:632`・`:699` のみ）。`notification-history` は単体でも 8 passed を複数回。
- 負の対照（実装を壊して落ちることを確かめ、戻した）— 下の「失敗の証跡」。

## E2E 全体の失敗 17 件の切り分け

- main の既知の失敗（appearance-settings:113・:130、key-bindings:632・:699、mobile:77・:189、new-terminal-cwd:128、scrollback-copy:80、settings:167・:187、theme-settings:193・:271・:354・:528、workspace-tab-pane:305）— 15 件。回ごとに入れ替わる範囲に収まる。
- **既知の外の 2 件はこの work が原因**だった（単独で 2 回とも落ちる→原因を特定→直して通る）:
  1. `keys-mouse-dialogs.spec.ts:502`（全体のメニュー：Tab の順）— サイドバーの下端にベル（`notify-bell`）が増え、agents の並び順と折りたたみの間で Tab が止まる。**意図した変更**なので、期待の順に `bell` を足した（テスト側の修正）。
  2. `workspace-groups.spec.ts:942`（ドラッグ）— 前の知らせを `.toast` のクリックで消していたが、4 秒で消える短い知らせはクリックを通す（右上に出るぶん端末を押せるように。`d4137b4`）ので、xterm のリンク層がクリックを受けて 30 秒でタイムアウトした。**意図した変更**なので、押して消すのをやめ、「前の理由の知らせが無くなるのを待つ」（別の短い知らせ〔初回のキー一覧の案内〕が出ていても通る）に直した。3 回連続で pass。
- 直した後、この 2 件を含む絞り込みの実行で pass（上）。

## 受け入れ基準ごとの判定

- AC1: pass — E2E `notification-history.spec.ts`（デスクトップ・モバイル幅）: トーストの矩形が端末のカーソル（入力位置）と交差せず、先頭が上端に近い。負の対照 N1。
- AC2: pass — E2E: 積んでも重ならない・時間順。単体 `Toast.test.ts`・`view.test.ts`（短い知らせ 3 件の上限）。
- AC3: pass（一部）— E2E モバイル: 上部バーのボタンを隠さない。**ノッチ（safe-area）の実機は未検証**（CSS の `env()` のみ。穴）。ダイアログ・グラフ・質問のフォームの上下の規則は既存の仕組みのまま（既存の ask-form 系 E2E が通る）。
- AC4: pass — E2E: `aria-live`・閉じるボタンの名前・動きを減らす設定で出る動きが付かない。
- AC5: pass — 単体 `NotificationController.test.ts`（×・本体クリック・押し出し・トースト「切」の 3 経路）と E2E（閉じるとベルの件数が増える）。
- AC6: pass — 単体 `history.test.ts`（50 件の境界・7 日の境界・同じ pane の置き換え。**値そのもの（50・7 日）を固定する 1 件を test 工程で足した**＝下の穴 1）。
- AC7: pass — 単体 `notifications.test.ts`（保存・マシンごと・壊れた値・保存できない環境）と E2E（再読み込みで残る）。
- AC8: pass — 単体（案内・短い知らせ・見ている pane は入らない。**トースト「切」の見ている pane の 1 件を test 工程で足した**＝下の穴 2）。
- AC9: pass — E2E（デスクトップ・畳んだサイドバー・モバイル）と単体 `NotificationBell`（0 件は出さない・`99+`・`aria-label`）。
- AC10: pass — E2E・単体 `NotificationHistoryDialog.test.ts`（新しい順・0 件の文言）。
- AC11: pass — E2E（［移動］で移って閉じ、行が消える）・単体（対象が無い場合の知らせ）。
- AC12: pass — 単体（消した次の行・0 件で［閉じる］へフォーカス）と E2E（キーボード）。
- AC13: pass — 単体（解消の表の全行・`isResolved`）と E2E（居なくなると消える）。負の対照 N2。
- AC14: pass — E2E（再読み込みで残る／開いていない間に解消した分は復活しない）・単体（最初のスナップショットで掃除）。
- AC15: pass — 単体（閉じた時点で解消済みなら入らない）。
- AC16: pass — E2E（2 段階・確定で 0 件・バッヂが消える）・単体（［やめる］・Esc は確認だけ）。負の対照 N3。
- AC17: pass — 全体の単体（既存の通知のテスト）と `notifications.spec.ts`（E2E）が変更なく通る。
- AC18: pass — 単体（`prefix+o`・［移動］で履歴からも消える。トースト中は数えない）。OS 通知のクリックは単体でコードの経路を確かめた（実ブラウザの通知は未検証）。
- AC19: pass — 単体（`bindings.test.ts`・`keymap.test.ts`・`HelpDialog`・`KeySettings`・`TuiDispatcher`）と E2E `key-bindings`（既存の失敗 2 件を除く）。
- AC20: pass（読みで確認）— `docs/verification.md`・`docs/herdr-parity.md`・`docs/tui-parity.md`・`docs/tui.md` に記述がある（review で点検）。
- AC-I1〜AC-I5: pass — E2E（開閉・キーボードだけの移動と削除・フォーカスの戻り）と単体（`showModal()` のダイアログ・キーが漏れない既存の経路）。

## 失敗の証跡

全体の E2E で、この work が原因の失敗が 2 件あった（上の切り分け。直す前の出力）。

```
$ pnpm exec playwright test src/specs/keys-mouse-dialogs.spec.ts:502 src/specs/workspace-groups.spec.ts:942
  ✘  1 src/specs/keys-mouse-dialogs.spec.ts:502:1 › 全体のメニュー：キーボードだけで開いて閉じ、開いたボタンへフォーカスが戻る（AC5・AC-I1・AC-I3・AC-I4） (4.7s)
  ✘  2 src/specs/workspace-groups.spec.ts:942:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5） (30.2s)
    - Expected  - 1
    + Received  + 1
    @@ -4,8 +4,8 @@
        "plus",
        "menu",
        "divider",
        "toggle",
        "sort",
    +   "plus",
        "collapse",
    -   "divider",
    Error: locator.click: Test timeout of 30000ms exceeded.
        - <canvas width="1029" height="693" class="xterm-link-layer"></canvas> from <div class="app-main">…</div> subtree intercepts pointer events
  2 failed
```

負の対照（実装を壊して落ちることを確かめ、元へ戻した。`git diff` が空になることを確認）。生の出力:

```
== N5 addHistory: 同じ pane の置き換えを外す（鍵だけで重複を除く）
 1 file changed, 1 insertion(+), 1 deletion(-)
     × 同じ pane の古いものは置き換わる（最新の 1 件） 6ms
     × 期限切れ・同じ pane の重複・上限超過を正規化する 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/history.test.ts > addHistory（AC6） > 同じ pane の古いものは置き換わる（最新の 1 件）
AssertionError: expected [ { key: 'blocked:a1:1', …(7) }, …(1) ] to deeply equal [ { key: 'done:a1:2', …(7) } ]
 FAIL  src/notify/history.test.ts > parseHistory（復元） > 期限切れ・同じ pane の重複・上限超過を正規化する
AssertionError: expected [ …(2) ] to deeply equal [ { key: 'done:a1:2', …(7) } ]
 Test Files  1 failed (1)
      Tests  2 failed | 60 passed (62)
== N6a 上限 50 → 51
 Test Files  1 passed (1)
      Tests  62 passed (62)
== N6b 7 日を過ぎても落とさない（pruneExpired が何も落とさない）
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/history.test.ts > addHistory（AC6） > 7 日を過ぎたものは入れたときに落ちる（ちょうど 7 日は残る）
AssertionError: expected [ 'p2', 'p3' ] to deeply equal [ 'p3' ]
 FAIL  src/notify/history.test.ts > pruneExpired / remove > 期限の境界
AssertionError: expected [ { key: 'blocked:a1:100', …(7) } ] to have a length of +0 but got 1
 FAIL  src/notify/history.test.ts > parseHistory（復元） > 期限切れ・同じ pane の重複・上限超過を正規化する
AssertionError: expected [ { key: 'blocked:a9:1', …(7) }, …(1) ] to deeply equal [ { key: 'done:a1:2', …(7) } ]
 Test Files  1 failed (1)
      Tests  3 failed | 59 passed (62)
== N6c 上限を超えても落とさない
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/history.test.ts > addHistory（AC6） > 50 件を超えたら古い方から落とす（境界: 50 は残る・51 で 1 件落ちる）
AssertionError: expected [ Array(51) ] to have a length of 50 but got 51
 FAIL  src/notify/history.test.ts > parseHistory（復元） > 期限切れ・同じ pane の重複・上限超過を正規化する
AssertionError: expected [ Array(55) ] to have a length of 50 but got 55
 Test Files  1 failed (1)
      Tests  2 failed | 60 passed (62)
== s/MAX_HISTORY = 50/MAX_HISTORY = 51/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/history.test.ts > 上限の値（AC6） > 50 件・7 日
AssertionError: expected 51 to be 50 // Object.is equality
      Tests  1 failed | 62 passed (63)
== s/7 \* 24 \* 60/6 * 24 * 60/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/history.test.ts > 上限の値（AC6） > 50 件・7 日
AssertionError: expected 518400000 to be 604800000 // Object.is equality
      Tests  1 failed | 62 passed (63)
== N4 見ている pane の判定を外す（shouldQueue の return を消す）
 1 file changed, 1 insertion(+), 1 deletion(-)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/NotificationController.test.ts > NotificationController — 待ち行列（AC9） > 見ている pane は積まれない（後で戻る先ではない）
AssertionError: expected [ { key: 'blocked:a-p1:5', …(5) } ] to have a length of +0 but got 1
 FAIL  src/notify/NotificationController.test.ts > NotificationController — 履歴（AC5・AC13〜AC15・AC18） > 入口 > 見ている pane・案内・短い知らせは入らない（AC8）
AssertionError: expected [ { key: 'blocked:a-p1:5', …(7) } ] to have a length of +0 but got 1
 FAIL  src/notify/NotificationController.test.ts > NotificationController — 履歴（AC5・AC13〜AC15・AC18） > 入口 > 見ている pane は、トーストを「切」にしていても履歴に入らない（AC8）
AssertionError: expected [ { key: 'blocked:a-p1:5', …(7) } ] to have a length of +0 but got 1
      Tests  3 failed | 99 passed (102)
== N4' 同上。ただし今回足した 1 件（トースト「切」）だけを見る
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/NotificationController.test.ts > NotificationController — 履歴（AC5・AC13〜AC15・AC18） > 入口 > 見ている pane は、トーストを「切」にしていても履歴に入らない（AC8）
AssertionError: expected [ { key: 'blocked:a-p1:5', …(7) } ] to have a length of +0 but got 1
      Tests  1 failed | 101 skipped (102)
== N5' 配送時の同じ pane の置き換え（removeHistoryPane）を外す
 1 file changed, 1 insertion(+), 1 deletion(-)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/notify/NotificationController.test.ts > NotificationController — 履歴（AC5・AC13〜AC15・AC18） > 入口 > 同じ pane の新しい出来事は、その pane の古い履歴を置き換える（最新の 1 件）
AssertionError: 新しい知らせはトースト中なので、古い履歴は置き換わって 0 件: expected [ { key: 'blocked:a-p1:5', …(7) } ] to have a length of +0 but got 1
      Tests  1 failed | 101 passed (102)
== N1 Toast.vue の置き場所を元の下・中央へ戻す
-  top: calc(env(safe-area-inset-top, 0px) + 0.5em);
-  right: calc(env(safe-area-inset-right, 0px) + 0.5em);
+  left: 50%;
+  bottom: 3.5em;
+  transform: translateX(-50%);
build rc=0
  ✘  1 src/specs/notification-history.spec.ts:43:1 › トースト：右上に出て、端末の入力位置（カーソル）と重ならない・積んでも重ならない（AC1・AC2） (1.9s)
  ✘  2 src/specs/notification-history.spec.ts:78:1 › トースト：消えない知らせも右上で、入力位置と重ならない。動きを減らす設定では出る動きが付かない（AC1・AC4） (6.5s)
  ✓  3 src/specs/notification-history.spec.ts:99:1 › 履歴：閉じた知らせがベルの件数に数えられ、ポップアップに出て、キーだけで移動できる（AC5・AC9〜AC11・AC-I3・AC-I4） (6.9s)
  ✓  4 src/specs/notification-history.spec.ts:139:1 › 履歴：［すべて削除］は 2 段階で、確定すると 0 件になりバッヂが消える（AC16） (6.3s)
  ✓  5 src/specs/notification-history.spec.ts:165:1 › 履歴：元の出来事が解消したら自動で消える。再読み込みでは残り、開いていない間に解消した分は復活しない（AC7・AC13・AC14） (6.8s)
  ✓  6 src/specs/notification-history.spec.ts:193:1 › 履歴：画面を開いている間にエージェントが居なくなると、履歴から自動で消える（AC13） (6.5s)
  ✓  7 src/specs/notification-history.spec.ts:213:3 › モバイルの幅 › トーストは上部バーのボタンを隠さず、端末の入力位置とも重ならない。ベルは押せる（AC1・AC3・AC9） (6.0s)
  ✓  8 src/specs/notification-history.spec.ts:243:1 › ベル：畳んだサイドバーでも見える（AC9） (1.2s)
    Error: 先頭は上端に近い（右上）
    Expected: < 40
    Received:   534.875
    Error: expect(received).toBeLessThan(expected)
    Expected: < 80
    Received:   574.859375
  2 failed
  6 passed (44.3s)
== N2 解消の掃除を外す（スナップショット・変化・既読）
-    this.#reconcileHistory({ paneId, agent: next });
+    // MUT 
-    store.reconcileHistory((paneId) => this.#paneNowOf(byPane.has(paneId), byPane.get(paneId) ?? null));
+    // MUT 
-    this.#store.removeHistoryPane(paneId); // pane が閉じたら、その pane の知らせは解消（履歴からも消える）
+    // MUT 、その pane の知らせは解消（履歴からも消える）
build rc=0
  ✓  1 src/specs/notification-history.spec.ts:43:1 › トースト：右上に出て、端末の入力位置（カーソル）と重ならない・積んでも重ならない（AC1・AC2） (1.7s)
  ✓  2 src/specs/notification-history.spec.ts:78:1 › トースト：消えない知らせも右上で、入力位置と重ならない。動きを減らす設定では出る動きが付かない（AC1・AC4） (6.0s)
  ✓  3 src/specs/notification-history.spec.ts:99:1 › 履歴：閉じた知らせがベルの件数に数えられ、ポップアップに出て、キーだけで移動できる（AC5・AC9〜AC11・AC-I3・AC-I4） (6.7s)
  ✓  4 src/specs/notification-history.spec.ts:139:1 › 履歴：［すべて削除］は 2 段階で、確定すると 0 件になりバッヂが消える（AC16） (6.7s)
  ✘  5 src/specs/notification-history.spec.ts:165:1 › 履歴：元の出来事が解消したら自動で消える。再読み込みでは残り、開いていない間に解消した分は復活しない（AC7・AC13・AC14） (12.3s)
  ✘  6 src/specs/notification-history.spec.ts:193:1 › 履歴：画面を開いている間にエージェントが居なくなると、履歴から自動で消える（AC13） (26.5s)
  ✓  7 src/specs/notification-history.spec.ts:213:3 › モバイルの幅 › トーストは上部バーのボタンを隠さず、端末の入力位置とも重ならない。ベルは押せる（AC1・AC3・AC9） (6.2s)
  ✓  8 src/specs/notification-history.spec.ts:243:1 › ベル：畳んだサイドバーでも見える（AC9） (1.3s)
    Error: 解消済みの知らせは残らない
    expect(locator).toHaveCount(expected) failed
    Expected: 0
    Received: 1
    Error: expect(locator).toHaveCount(expected) failed
    Expected: 0
    Received: 1
  2 failed
  6 passed (1.2m)
== N3 一括削除を無効化
-    this.#store.clearHistory();
+    void 0;
build rc=0
  ✓  1 src/specs/notification-history.spec.ts:43:1 › トースト：右上に出て、端末の入力位置（カーソル）と重ならない・積んでも重ならない（AC1・AC2） (1.7s)
  ✓  2 src/specs/notification-history.spec.ts:78:1 › トースト：消えない知らせも右上で、入力位置と重ならない。動きを減らす設定では出る動きが付かない（AC1・AC4） (6.3s)
  ✓  3 src/specs/notification-history.spec.ts:99:1 › 履歴：閉じた知らせがベルの件数に数えられ、ポップアップに出て、キーだけで移動できる（AC5・AC9〜AC11・AC-I3・AC-I4） (6.7s)
  ✘  4 src/specs/notification-history.spec.ts:139:1 › 履歴：［すべて削除］は 2 段階で、確定すると 0 件になりバッヂが消える（AC16） (11.6s)
  ✓  5 src/specs/notification-history.spec.ts:165:1 › 履歴：元の出来事が解消したら自動で消える。再読み込みでは残り、開いていない間に解消した分は復活しない（AC7・AC13・AC14） (7.3s)
  ✓  6 src/specs/notification-history.spec.ts:193:1 › 履歴：画面を開いている間にエージェントが居なくなると、履歴から自動で消える（AC13） (5.9s)
  ✓  7 src/specs/notification-history.spec.ts:213:3 › モバイルの幅 › トーストは上部バーのボタンを隠さず、端末の入力位置とも重ならない。ベルは押せる（AC1・AC3・AC9） (6.0s)
  ✓  8 src/specs/notification-history.spec.ts:243:1 › ベル：畳んだサイドバーでも見える（AC9） (1.2s)
    Error: expect(locator).toHaveCount(expected) failed
    Expected: 0
    Received: 1
  1 failed
  7 passed (48.4s)
```

追加した負の対照（E2E の 3 件 N1〜N3 は上に再実行。単体の 3 件 N4〜N6 を新しく実施）:

- N1 位置: Toast.vue を元の「下・中央」へ戻す → 位置の E2E 2 本が落ちる（上端 534px・574px）。
- N2 解消: 解消の掃除 3 箇所を外す → 解消の E2E 2 本が落ちる。
- N3 一括削除: `clearHistory` を無効化 → 一括削除の E2E が落ちる。
- N4 見ている pane: 判定の `return` を外す → 単体 3 件が落ちる。
- N5 最新の 1 件: `addHistory` の置き換え条件を外す → 単体 2 件。配送時の `removeHistoryPane` を外す → 単体 1 件。
- N6 50 件・7 日: 上限を超えても落とさない → 2 件、期限切れを落とさない → 3 件が落ちる。**値そのもの（50→51・7→6 日）は落ちなかった**ので、固定する単体 1 件を足した（足した後は落ちる）。

## 起動確認（smoke）

```
$ aidev smoke   （1 回目）
- 端末版を両方 prefix+q で抜けた（終了コード 0）
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
$ aidev smoke   （2 回目）
- 端末版を両方 prefix+q で抜けた（終了コード 0）
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```

この work は新しい入口（サブコマンド・オプション）を足していないので `smokeCommands` に行は足さない。

## 未検証の穴（skip / 環境不足）

- 穴 1（直した）: 上限 50 件・保持 7 日の**値**を固定するテストが無く、定数を変えても単体が通った → `history.test.ts` に値の固定を足した。
- 穴 2（足した）: 見ている pane の既存の単体はトースト「入」で、履歴の入口（トースト「切」）の判定を単独では守っていなかった → トースト「切」の 1 件を足した。
- N2 の補足: 画面を開いたままエージェントが居なくなる E2E は、掃除を外しても通る（pane の閉鎖でも消えるため）。エージェントの状態変化の解消は単体 `NotificationController.test.ts` が守る。
- ノッチ（safe-area）・実機のモバイル・Firefox・Safari・OS 通知の実際のクリックは未検証。
- 元から落ちる E2E 15 件（上）は main の既知で、この work の退行ではない（key-bindings:632・:699、mobile:189 は main `97c0c32` の build でも失敗を確認済み）。
