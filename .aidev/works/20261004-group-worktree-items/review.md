# レビュー記録

## タスク点検ログ

### T1 壊して落ちる確認

壊した行（messages.ts）: `GroupCreateParams` の `workspaceId.optional()` → `workspaceId`、`ItemMoveByParams` の direction を `z.enum(["previous"])` に、`SidebarLayoutSchema.top` を `z.array(z.number())` に。落ちた生の出力（先頭 60 行。4 件失敗）。元に戻して 47 件通過を確認済み。

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/protocol
 ❯ src/messages.test.ts (47 tests | 4 failed) 44ms
   ❯ messages (26)
     × validates group.create's optional workspaceId 4ms
     × validates item.move / item.move_by params 2ms
     × parses SidebarLayout (with/without groups, unknown refs and extra keys from older shapes) 1ms
     × validates group.* params 0ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/messages.test.ts > messages > validates group.create's optional workspaceId
ZodError: [
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "workspaceId"
    ],
    "message": "Invalid input: expected string, received undefined"
  }
]
 ❯ src/messages.test.ts:108:30
    106|   it("validates group.create's optional workspaceId", () => {
    107|     expect(GroupCreateParams.parse({ label: "x", workspaceId: "w1" }))…
    108|     expect(GroupCreateParams.parse({ label: "x" })).toEqual({ label: "…
       |                              ^
    109|     expect(() => GroupCreateParams.parse({ label: "x", workspaceId: ""…
    110|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯
 FAIL  src/messages.test.ts > messages > validates item.move / item.move_by params
ZodError: [
  {
    "code": "invalid_value",
    "values": [
      "previous"
    ],
    "path": [
      "direction"
    ],
    "message": "Invalid input: expected \"previous\""
  }
]
 ❯ src/messages.test.ts:120:29
    118|     expect(() => ItemMoveParams.parse({ item: { kind: "repo", repoKey:…
    119|     expect(() => ItemMoveParams.parse({ item: { kind: "group" }, befor…
    120|     expect(ItemMoveByParams.parse({ item: g, direction: "next" })).toE…
       |                             ^
    121|     expect(() => ItemMoveByParams.parse({ item: g, direction: "up" }))…
    122|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯
 FAIL  src/messages.test.ts > messages > parses SidebarLayout (with/without groups, unknown refs and extra keys from older shapes)
ZodError: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      "top",
      0
    ],
    "message": "Invalid input: expected number, received string"
  },
  {
```

### T2 壊して落ちる確認

`resolveRef`（食い違いを今の判定で解く行）を `return ws ? ref : null;` に壊して実行（元に戻し済み）:

```
⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > AC1: 同じリポジトリが 2 つ以上なら worktree グループ（本体が先頭）、1 つなら通常の行。グループに入っていても同じ
AssertionError: expected [ …(6) ] to deeply equal [ …(3) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > AC1: worktree が 1 つに減っても同じ位置の通常の行として残る
AssertionError: expected [ { g: 'g1', items: [ 'w1' ] }, 'w1' ] to deeply equal [ { g: 'g1', items: [ 'w1' ] } ]
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > AC4: グループの中に通常の workspace と worktree グループが項目として並ぶ。空のグループも出る
AssertionError: expected [ { g: 'g1', …(1) }, …(3) ] to deeply equal [ { g: 'g1', …(1) }, …(1) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > 配信の途中: レイアウトに無い workspace は一番上の末尾（同じリポジトリは 1 項目）
AssertionError: expected [ 'w1', 'w2', 'w3', 'w4' ] to deeply equal [ 'w1', …(2) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > 配信の途中: 判定とレイアウトが食い違うときは今の判定で項目を決め、置き場所は先に見つかった参照
AssertionError: expected [ 'w1', 'w3', 'w2' ] to deeply equal [ …(2) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > 名前順は一番上だけ。グループの中・worktree グループの中はレイアウトの順
AssertionError: expected [ 'b', 'c', …(3) ] to deeply equal [ 'b', …(2) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > visibleWorkspaceIdsOfTree > 何も畳んでいなければ上から下へ全部（見出しは含めない）
AssertionError: expected [ 'w1', 'w2', 'w3', 'w4', 'w5', …(3) ] to deeply equal [ 'w1', 'w2', 'w3', 'w4', 'w5' ]
 FAIL  src/workspace/workspaceGrouping.test.ts > visibleWorkspaceIdsOfTree > AC6: worktree グループだけ畳むと、先頭と今いる子だけ
AssertionError: expected [ 'w1', 'w4', 'w5', 'w1', 'w2', 'w3' ] to deeply equal [ 'w1', 'w4', 'w5' ]
 FAIL  src/workspace/workspaceGrouping.test.ts > visibleWorkspaceIdsOfTree > AC6: グループを畳むと中の worktree グループも隠れ、今いる workspace の行だけ残る（子でもその子だけ）
AssertionError: expected [ 'w5', 'w1', 'w2', 'w3' ] to deeply equal [ 'w5' ]
 FAIL  src/workspace/workspaceGrouping.test.ts > layoutFromLegacy（F13・AC13） > 存在しないグループを指す groupId は一番上に置く。結果を sidebarTree に通すと元の平らな順と矛盾しない
AssertionError: expected [ 'w1', …(3) ] to deeply equal [ 'w1', …(1) ]
 Test Files  1 failed (1)
      Tests  10 failed | 42 passed (52)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/workspace/workspaceGrouping.test.ts
```

`repoMembers` の本体先頭を外し（`return members;`）、`visibleWorkspaceIdsOfTree` の畳んだ入れ物の絞り込みを外して実行（元に戻し済み）:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/workspace/workspaceGrouping.test.ts > itemRefOf / repoMembers > 本体が先頭、残りは開いた順。本体が無ければ開いた順のまま（先頭が暫定の頭）
AssertionError: expected [ 'w1', 'w2', 'w3' ] to deeply equal [ 'w3', 'w1', 'w2' ]
 FAIL  src/workspace/workspaceGrouping.test.ts > sidebarTree > AC1: 同じリポジトリが 2 つ以上なら worktree グループ（本体が先頭）、1 つなら通常の行。グループに入っていても同じ
AssertionError: expected [ …(3) ] to deeply equal [ …(3) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > visibleWorkspaceIdsOfTree > AC6: グループを畳むと中の worktree グループも隠れ、今いる workspace の行だけ残る（子でもその子だけ）
AssertionError: expected [ 'w4', 'w5' ] to deeply equal [ 'w5' ]
 FAIL  src/workspace/workspaceGrouping.test.ts > layoutFromLegacy（F13・AC13） > 同じリポジトリが別々のグループ → 本体の所属に揃う
AssertionError: expected { g1: [], g2: [ 'r:/r/.git' ], g3: [] } to deeply equal { g1: [ 'r:/r/.git' ], g2: [], g3: [] }
 Test Files  1 failed (1)
      Tests  4 failed | 48 passed (52)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/workspace/workspaceGrouping.test.ts
```
