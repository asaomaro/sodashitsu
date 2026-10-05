# テスト記録（coding 中の自己確認。test 工程は依頼元）

## 負の対照（regression-negative-control）。実装を壊して E2E が落ちることを確かめ、元へ戻した（`git diff` で差分なしを確認）

```
== N1 Toast.vue を元の置き場所へ戻す
  ✘  1 src/specs/notification-history.spec.ts:43:1 › トースト：右上に出て、端末の入力位置（カーソル）と重ならない・積んでも重ならない（AC1・AC2） (1.8s)
  ✘  2 src/specs/notification-history.spec.ts:78:1 › トースト：消えない知らせも右上で、入力位置と重ならない。動きを減らす設定では出る動きが付かない（AC1・AC4） (6.6s)
    Error: 先頭は上端に近い（右上）
    Expected: < 40
    Received:   534.875
    Error: expect(received).toBeLessThan(expected)
    Expected: < 80
    Received:   574.859375
  2 failed
== N2 解消の掃除を外す
  ✘  1 src/specs/notification-history.spec.ts:165:1 › 履歴：元の出来事が解消したら自動で消える。再読み込みでは残り、開いていない間に解消した分は復活しない（AC7・AC13・AC14） (12.4s)
  ✓  2 src/specs/notification-history.spec.ts:193:1 › 履歴：画面を開いている間にエージェントが居なくなると、履歴から自動で消える（AC13） (6.2s)
    Error: 解消済みの知らせは残らない
    expect(locator).toHaveCount(expected) failed
    Expected: 0
    Received: 1
  1 failed
  1 passed (20.1s)
== N3 一括削除を無効化
  ✘  1 src/specs/notification-history.spec.ts:139:1 › 履歴：［すべて削除］は 2 段階で、確定すると 0 件になりバッヂが消える（AC16） (11.7s)
    Error: expect(locator).toHaveCount(expected) failed
    Expected: 0
    Received: 1
  1 failed
```

- N1（位置）: Toast.vue を元の「下・中央」へ戻すと、位置の 2 本が落ちる（上端 534px・574px）。
- N2（解消）: エージェントの変化・スナップショットの掃除を外すと、「開いていない間に解消した分は復活しない」が落ちる。
  **画面を開いたままの「エージェントが居なくなる」の E2E は、掃除を外しても通る**（pane が exited になる経路で、別の経路〔pane の閉鎖〕でも消えるため）。
  エージェントの状態変化そのものの解消は `NotificationController.test.ts`（単体）が守る。
- N3（一括削除）: `clearHistory` を無効化すると、一括削除の E2E が落ちる。
- 単体の負の対照（T4 の点検で指摘された 2 件）: `removeHistoryPane` の行・`e.paneId !== paneId` の条件を外すと、それぞれ 1 件落ちる（直した後に確認）。

## 元から落ちる E2E（main の別 worktree でも落ちる。退行ではない）
- `key-bindings.spec.ts:632`・`:699`、`mobile.spec.ts:189`（main `97c0c32` の build で同じく失敗を確認）。
