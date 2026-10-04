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

### T3 壊して落ちる確認

`sidebarLayout.ts` の 5 か所を 1 つずつ壊して `sidebarLayout.test.ts` を流した（壊しは都度元に戻した。prettier 整形の前の版で実施。整形後も全件通過を確認）。落ちた生の出力（`grep` で絞った抜粋）。

```
### 1 moveItem の「before が同じ入れ物にあるか」の検査を消す
 FAIL  src/workspace/sidebarLayout.test.ts > moveItem（AC5） > 入れ物をまたぐ・自分自身の前・グループをグループの中へ・無い項目は moved: false で何も変えない
AssertionError: w:a -> w:c: expected true to be false // Object.is equality
### 2 moveItemBy の端で止まる判定を巡回に変える
 FAIL  src/workspace/sidebarLayout.test.ts > moveItemBy > 1 つ動かす。端では巡回せず止まる
AssertionError: w:a previous: expected true to be false // Object.is equality
### 3 removeItemFromGroup の「直後」を「直前」に変える
 FAIL  src/workspace/sidebarLayout.test.ts > addItemToGroup / removeItemFromGroup（AC10） > 外すと一番上の、そのグループの直後へ置く。グループに居なければ何もしない
AssertionError: expected [ 'w:a', 'w:c', 'g:g1', 'w:b', 'g:g2' ] to deeply equal [ 'w:a', 'g:g1', 'w:c', 'w:b', 'g:g2' ]
### 4 deleteGroupFromLayout の「あった位置へ出す」を「末尾へ出す」に変える
 FAIL  src/workspace/sidebarLayout.test.ts > deleteGroupFromLayout（AC10） > 中身をグループのあった位置へ順に出し、グループのキーを消す
AssertionError: expected [ 'w:a', 'w:b', 'g:g2', 'r:R', 'w:c' ] to deeply equal [ 'w:a', 'r:R', 'w:c', 'w:b', 'g:g2' ]
### 5 repairLayout の重複除去を消す
 FAIL  src/workspace/sidebarLayout.test.ts > repairLayout（AC13） > 実在しない参照・重複・グループの中の g:・実在しないグループのキーを捨てて、捨てた参照を返す
AssertionError: expected { top: [ 'w:a', 'g:g1', …(3) ], …(1) } to deeply equal { top: [ 'w:a', 'g:g1', …(2) ], …(1) }
```

### 点検で直した指摘（1 件 1 行）

- T3 [should] deleteGroupFromLayout の分割代入が no-unused-vars（eslint）で落ちる → delete を使う形に直した [conv:-]

### T4 壊して落ちる確認

1. `probe` の `--path-format=absolute` を 2 か所とも外して実行（元に戻し済み）。symlink 経由の本体の repoKey が `link/.git` にずれる:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > repoKey まで取れたら git（本体は isLinkedWorktree=false。--path-format=absolute で聞く）
AssertionError: expected false to be true // Object.is equality
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 結合（実物の git） > symlink を通った本体・その下の深い場所・symlink 経由の worktree が、実体の worktree と同じ repoKey になる（decisions D9）
AssertionError: repoKey: ["/tmp/soda-gitpoller-plain-sAV3RU/real/.git","/tmp/soda-gitpoller-plain-sAV3RU/link/.git","/tmp/soda-gitpoller-plain-sAV3RU/link/.git","/tmp/soda-gitpoller-plain-sAV3RU/real/.git","/tmp/soda-gitpoller-plain-sAV3RU/real/.git"]: expected 2 to be 1 // Object.is equality
      Tests  2 failed | 35 passed (37)
```

2. `catch` の結果と `--git-common-dir` 失敗の結果を `unknown` から `unmanaged` に変えて実行（元に戻し済み）:

```
       × 時間切れ・git の起動失敗（reject）は unknown 5ms
       × HEAD は取れたが --git-common-dir が失敗したら unknown（半端な git を作らない） 1ms
       × 消えたフォルダは unknown（git の起動が失敗する） 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected { kind: 'unmanaged' } to deeply equal { kind: 'unknown' }
AssertionError: expected { kind: 'unmanaged' } to deeply equal { kind: 'unknown' }
AssertionError: expected { kind: 'unmanaged' } to deeply equal { kind: 'unknown' }
      Tests  3 failed | 34 passed (37)
```
- T4 [nit] bare の isLinkedWorktree=false をテストが固定していない → expect に足した。onFirstRoundDone が stop 後にも出る点は D10 に記録（T10 で扱う）。--git-dir 失敗の分岐の壊し確認は新規挙動のため省略 [conv:-]

### T5 壊して落ちる確認

1. モデルの削除の 1 か所（`closeWorkspaceInternal`）で `this.removeFromLayout(ws)` を外し、あわせて `closePane` の `workspace.closed` の分岐から `this.publishSidebarChanges()` も外して実行（元に戻し済み）。5 経路すべてのテストと、グループ・リポジトリの項目のテストが落ちる:

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionModel.test.ts (121 tests | 7 failed) 41ms
   ❯ SessionModel — sidebar layout (22)
     ❯ a workspace that disappears leaves the layout through every path (7)
       × closeWorkspace 7ms
       × closeTab on the last tab 1ms
       × closePane on the last pane 1ms
       × moveToTab that empties the source workspace 1ms
       × moveToNewTab that empties the source workspace 1ms
       × a workspace inside a group leaves the group's list too 1ms
       × a repository item stays until its last workspace is gone; repoGroups is kept 1ms
 ❯ src/session/SessionService.test.ts (162 tests | 8 failed) 2458ms
   ❯ SessionService — tabs and panes (32)
     ❯ moveToTab (4)
       × 移動元 workspace も連鎖して空になるとき（D18）: tab.closed → workspace.closed を publish する 19ms
     ❯ moveToNewTab (4)
       × 移動元 workspace も連鎖して空になるとき（D18）: tab.closed → workspace.closed を publish する（moveToTab と同じ分岐。taskcheck 指摘） 12ms
     × closing the only pane closes the tab and workspace, disposes the PTY, and auto-creates a replacement (D24) 11ms
   ❯ SessionService — workspace grouping and ordering (16)
     ❯ sidebar.layout_changed (the common exit) (8)
       × closeWorkspace 12ms
       × closeTab (the last tab of the workspace) 12ms
       × closePane (the last pane of the workspace) 11ms
       × moveToTab (the source workspace becomes empty) 11ms
       × moveToNewTab (the source workspace becomes empty) 11ms
⎯⎯⎯⎯⎯⎯ Failed Tests 15 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > a workspace that disappears leaves the layout through every path > closeWorkspace
AssertionError: expected [ 'w:w1', 'w:w2' ] to deeply equal [ 'w:w2' ]
- Expected
+ Received
  [
+   "w:w1",
    "w:w2",
  ]
 ❯ src/session/SessionModel.test.ts:1281:37
    1279|       model.takeChanges();
    1280|       model.closeWorkspace(a.id);
    1281|       expect(model.getLayout().top).toEqual([`w:${b.id}`]);
       |                                     ^
    1282|       expect(model.takeChanges()?.layout).toEqual({ top: [`w:${b.id}`]…
    1283|     });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/15]⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > a workspace that disappears leaves the layout through every path > closeTab on the last tab
AssertionError: expected [ 'w:w1', 'w:w2' ] to deeply equal [ 'w:w2' ]
- Expected
+ Received
```

2. `closePane` の分岐の `publishSidebarChanges()` だけを外して実行（元に戻し済み。モデルは正しいので、出口を通らないことだけが落ちる）:

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionService.test.ts (162 tests | 2 failed) 2460ms
   ❯ SessionService — tabs and panes (32)
     × closing the only pane closes the tab and workspace, disposes the PTY, and auto-creates a replacement (D24) 22ms
   ❯ SessionService — workspace grouping and ordering (16)
     ❯ sidebar.layout_changed (the common exit) (8)
       × closePane (the last pane of the workspace) 11ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionService.test.ts > SessionService — tabs and panes > closing the only pane closes the tab and workspace, disposes the PTY, and auto-creates a replacement (D24)
AssertionError: expected [ 'pane.closed', 'tab.closed', …(5) ] to deeply equal [ 'pane.closed', 'tab.closed', …(6) ]
- Expected
+ Received
  [
    "pane.closed",
    "tab.closed",
    "workspace.closed",
-   "sidebar.layout_changed",
    "workspace.created",
    "tab.created",
    "pane.created",
    "sidebar.layout_changed",
  ]
 ❯ src/session/SessionService.test.ts:650:20
    648|
    649|     expect(host.disposed).toBe(true);
    650|     expect(events).toEqual([
       |                    ^
    651|       "pane.closed",
    652|       "tab.closed",
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
```

### T5 点検で足した回帰テストの壊して落ちる確認（addToGroup の二重）

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionModel.test.ts (122 tests | 1 failed) 35ms
   ❯ SessionModel — sidebar layout (23)
     × addToGroup on a workspace whose judgment arrived but whose layout still holds w:<id> does not leave a duplicate 7ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > addToGroup on a workspace whose judgment arrived but whose layout still holds w:<id> does not leave a duplicate
AssertionError: expected { top: [ 'w:w1', 'g:g1' ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
- Expected
+ Received
@@ -3,8 +3,9 @@
      "g1": [
        "r:/a/.git",
      ],
    },
    "top": [
+     "w:w1",
      "g:g1",
    ],
  }
 ❯ src/session/SessionModel.test.ts:1272:31
    1270|     model.updateWorkspaceGit(a.id, gitOf("/a/.git", false));
    1271|     model.addToGroup(a.id, group.id);
    1272|     expect(model.getLayout()).toEqual({ top: [`g:${group.id}`], groups…
       |                               ^
    1273|   });
    1274|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
   Start at  12:33:11
```
- T5 [should] addToGroup の判定が逆で、判定が付いたが layout が w:<id> のままの workspace に w: と r: の二重ができる → itemRefOf(ws) === ref のときだけ layout を使う形に直し、テストを足した [conv:-]

### T6 壊して落ちる確認

実装を 1 か所ずつ壊して `vitest run src/session src/git/GitInfoPoller.test.ts` を流した生の出力（壊した後は元に戻し `cmp` で一致を確認）。

#### 1 SessionModel.reflectJudgement の repoGroups を先に見る行を無効にする（repoGroup を常に null）

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 判定のレイアウトへの反映（実物の git） > pane の場所を別のリポジトリへ・管理外へ・元へ移すと、レイアウトと所属が設計のとおりに変わる（AC11）
AssertionError: 元のリポジトリへ戻ると、覚えているグループへ: expected { top: [ 'g:g1', …(1) ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > (1) repoGroups is looked at first: a new workspace of a remembered repository goes to its group (at the end when r:<repoKey> is absent)
AssertionError: expected { top: [ 'g:g1', 'r:/k/.git' ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > (1) wins over the workspace's own groupId (the repository's group is the answer)
AssertionError: expected 'g2' to be 'g1' // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > a changed judgment: joins an existing r:R2, or follows repoGroups[R2]
AssertionError: expected { top: [ 'g:g1', 'r:/r2/.git' ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
      Tests  4 failed | 512 passed (516)
```

#### 2 管理外と確定の置き場所を「r:R1 の直後」から「一番上の先頭」に変える

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 判定のレイアウトへの反映（実物の git） > pane の場所を別のリポジトリへ・管理外へ・元へ移すと、レイアウトと所属が設計のとおりに変わる（AC11）
AssertionError: 管理外へ: 項目が空になるので同じ場所で w:<id> に: expected { top: [ 'w:w1', 'g:g1' ], …(1) } to deeply equal { top: [ 'g:g1', 'w:w1' ], …(1) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > unmanaged (R1 -> none): w:<id> goes right after r:R1 in the same container, and groupId is that group
AssertionError: expected { top: [ 'w:w2', 'g:g1' ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > unmanaged on the only member replaces r:R1 in place (repoGroups kept)
AssertionError: expected { …(2) } to deeply equal { top: [ 'g:g1', 'w:w2' ], …(1) }
      Tests  3 failed | 513 passed (516)
```

#### 3 SessionService.applyGitJudgement の「取れない（unknown）は何もしない」を消す

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > judgments (git / unmanaged / unknown) go through the one model entry > unmanaged on a judged workspace gives the w:<id> back (null git); unknown changes nothing and publishes nothing
AssertionError: expected 1 to be +0 // Object.is equality
      Tests  1 failed | 515 passed (516)
```

#### 4 判定が付く (2) の「r:R が別の場所にあれば丸ごと G へ移す」を「w:<id> を外すだけ」に変える

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > (2) a workspace in a group hands the repository over: repoGroups is set and the whole item moves to that group
AssertionError: expected { top: [ 'r:/k/.git', 'g:g1' ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > the result does not depend on the order the judgments arrive (b first)
AssertionError: expected { top: [ 'g:g1', 'r:/k/.git' ], …(1) } to deeply equal { top: [ 'g:g1' ], …(1) }
      Tests  2 failed | 514 passed (516)
```

#### 5 SessionService.applyGitJudgement の identityChanged を常に false にする（共通の出口を通さない）

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > updateWorkspaceGit emits workspace.updated when only repoKey changes (branch/ahead/behind unchanged)
AssertionError: expected [ 'workspace.updated' ] to deeply equal [ 'workspace.updated', …(1) ]
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > judgments (git / unmanaged / unknown) go through the one model entry > a repoKey change publishes workspace.updated once, then the layout, and schedules a save; applyWorkspaceIdentity takes the same path
AssertionError: expected [ 'workspace.updated' ] to deeply equal [ 'workspace.updated', …(1) ]
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > judgments (git / unmanaged / unknown) go through the one model entry > unmanaged on a judged workspace gives the w:<id> back (null git); unknown changes nothing and publishes nothing
AssertionError: expected [ 'workspace.updated' ] to deeply equal [ 'workspace.updated', …(1) ]
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > judgments (git / unmanaged / unknown) go through the one model entry > isLinkedWorktree changing publishes the new order and schedules a save
AssertionError: expected [ 'workspace.updated' ] to deeply equal [ 'workspace.updated', …(1) ]
      Tests  4 failed | 512 passed (516)
```

### T7 壊して落ちる確認

1. `group.ts` の `createGroup(params.label, params.workspaceId)` から `workspaceId` を外す（入口が落とす）:

```
 FAIL  src/surface/methods/index.test.ts > registerAllMethods — client / workspace / tab / pane flow > 項目単位のグループ操作と一括クローズ > group.create に workspaceId を渡すと、その項目（worktree グループ丸ごと）が新しいグループへ入り、位置にグループが立つ
AssertionError: expected [ null, null, null ] to deeply equal [ 'g1', 'g1', null ]

- Expected
+ Received

  [
-   "g1",
-   "g1",
+   null,
+   null,
    null,
  ]

 ❯ src/surface/methods/index.test.ts:496:45
 FAIL  src/surface/methods/index.test.ts > registerAllMethods — client / workspace / tab / pane flow > 項目単位のグループ操作と一括クローズ > group.create に実在しない workspaceId を渡すと not_found で、グループは作られない
AssertionError: expected { ok: true, …(1) } to deeply equal { ok: false, error: { …(2) } }

- Expected
+ Received

  {
-   "error": {
-     "code": "not_found",
-     "message": StringContaining "w999",
+   "ok": true,
+   "result": {
+     "group": {
+       "collapsed": false,
+       "id": "g1",
+       "label": "x",
      },
-   "ok": false,
+   },
  }

 ❯ src/surface/methods/index.test.ts:503:22
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/surface/methods/index.test.ts
```

2. `SessionModel.repoCloseTargets` の先頭判定を外し、`slice(1)` を `filter((w) => w.id !== id)` に替える（子を指しても全部閉じる）:

```
 FAIL  src/surface/methods/index.test.ts > registerAllMethods — client / workspace / tab / pane flow > 項目単位のグループ操作と一括クローズ > workspace.close の一括クローズは、先頭でない子を指すと、その 1 つだけ閉じる
AssertionError: expected [ 'w3' ] to deeply equal [ 'w1', 'w3', 'w4' ]

- Expected
+ Received

  [
-   "w1",
    "w3",
-   "w4",
  ]

 ❯ src/surface/methods/index.test.ts:552:73
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/surface/methods/index.test.ts
```

確認後は元に戻した（`git diff` で差分が実装と回帰テストだけであることを確認）。
- T7 [nit] 本体が開かれていないときの一括クローズ（先頭の暫定の頭）のテストが無い → repoMembers 側の単体テスト（T2）で先頭の決まりは固定済みのため、追加せず review に委ねる [conv:-]

### T8 壊して落ちる確認

実装を 2 か所壊して `vitest run src/session` を流した（出力は失敗の行だけ抜粋。`grep -E "×|FAIL|Tests |AssertionError"`）。
(1) `planLegacyMove` の (b)（グループ全体の読み替え）の条件を `if (false && typeof groupId === "string" && ...)` にする。
(2) `SessionService.moveWorkspacesTo` を、動かなかったときも `publishSidebarChanges()` する形にする。

```
       × (b) all the effective members of a group move the group, before the head of a top item, the first member of another group, or the end 8ms
     × moveItem publishes sidebar.layout_changed and workspace.order_changed and returns {moved: true}; a rejected move publishes nothing 24ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — item moves > moveWorkspacesTo reads an old request as an item move > (b) all the effective members of a group move the group, before the head of a top item, the first member of another group, or the end
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionService.test.ts > SessionService — workspace grouping and ordering > moveItem publishes sidebar.layout_changed and workspace.order_changed and returns {moved: true}; a rejected move publishes nothing
AssertionError: expected 1 to be +0 // Object.is equality
      Tests  2 failed | 487 passed (489)
```

元に戻した後は 489 件すべて通過（`git diff` で差分が実装と回帰テストだけ）。

### T9 壊して落ちる確認

実装の 4 か所を一時的に壊し、落ちた生の出力（vitest の先頭 40〜60 行）を貼る。確認後は元に戻した（`git diff` で壊しの痕跡が無いことを確認）。

#### 壊し 1: `toSessionFileData` が `repoKey` を保存しない（`repoKey: undefined`）

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/git/GitInfoPoller.test.ts (44 tests | 3 failed | 41 skipped) 209ms
   ❯ DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） (3)
     × グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ 99ms
     × フォルダが消えて判定が取れない workspace は、復元した判定・並びのまま残る（取れない結果は何も変えない） 62ms
     × layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない 47ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ
AssertionError: expected { top: [ 'g:g1', 'w:w4', …(3) ], …(1) } to deeply equal { top: [ 'g:g1', 'w:w4', …(1) ], …(1) }
- Expected
+ Received
  {
    "groups": {
-     "g1": [
-       "r:/tmp/soda-persist-FO91Mz/.git",
-     ],
+     "g1": [],
    },
    "top": [
      "g:g1",
      "w:w4",
-     "r:/tmp/soda-persist-LCDWlt/.git",
+     "w:w1",
+     "w:w2",
+     "w:w3",
    ],
  }
 ❯ src/git/GitInfoPoller.test.ts:870:37
    868|     await after.restore(data);
    869|     // 復元の直後（判定の確認の前）: 保存した repoKey で束ねて並ぶ。ブランチ名と件数はまだ無い。
    870|     expect(after.snapshot().layout).toEqual(expectedLayout);
       |                                     ^
    871|     expect(after.snapshot().workspaces.map((x) => x.id)).toEqual(expec…
    872|     expect(after.getWorkspace(w.id)?.git).toEqual({ branch: null, ahea…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > フォルダが消えて判定が取れない workspace は、復元した判定・並びのまま残る（取れない結果は何も変えない）
AssertionError: expected null to match object { …(2) }
- Expected:
{
  "branch": null,
  "repoKey": "/tmp/soda-persist-MJukmb/.git",
}
+ Received:
null
 ❯ src/git/GitInfoPoller.test.ts:899:43
    897|     await after.restore(data);
    898|     await new DefaultGitInfoPoller(after, new ChildProcessGitRunner())…
    899|     expect(after.getWorkspace(a.id)?.git).toMatchObject({ repoKey: key…
       |                                           ^
    900|     expect(after.getWorkspace(a.id)?.groupId).toBe(group.id);
    901|     expect(after.snapshot().layout!.groups[group.id]).toEqual([`r:${ke…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない
AssertionError: expected { top: [ 'w:w1', 'w:w2' ], groups: {} } to deeply equal { top: [ 'r:undefined' ], groups: {} }
- Expected
+ Received
  {
    "groups": {},
    "top": [
-     "r:undefined",
```

#### 壊し 2: `persistedLayout` が仮の状態でも `layout` を返す（`if (false) return null;`）

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/git/GitInfoPoller.test.ts (44 tests | 1 failed | 41 skipped) 209ms
   ❯ DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） (3)
     × layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない 45ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない
AssertionError: expected { layout: { …(2) }, repoGroups: {} } to be null
- Expected:
null
+ Received:
{
  "layout": {
    "groups": {},
    "top": [
      "r:/tmp/soda-persist-l2Ghtx/.git",
    ],
  },
  "repoGroups": {},
}
 ❯ src/git/GitInfoPoller.test.ts:920:37
    918|     await after.restore(legacy);
    919|     const key = full.workspaces[0]!.repoKey!;
    920|     expect(after.persistedLayout()).toBeNull();
       |                                     ^
    921|     expect(after.snapshot().layout).toEqual({ top: [`r:${key}`], group…
    922|     await new DefaultGitInfoPoller(after, new ChildProcessGitRunner())…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 41 skipped (44)
   Start at  12:57:00
   Duration  1.61s (transform 72%, import 14%, tests 14%)
```

#### 壊し 3: `SessionModel.restoreLayout` が `repairLayout` を通さない

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionService.test.ts (172 tests | 2 failed | 168 skipped) 76ms
   ❯ SessionService — layout の復元（保存と復元） (4)
     × 壊れた参照（実在しない workspace・グループ・重複・repoKey を持つのに w:）でも起動し、捨てた参照をログに出す 26ms
     × レイアウトに無い workspace は一番上の末尾に足す 11ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionService.test.ts > SessionService — layout の復元（保存と復元） > 壊れた参照（実在しない workspace・グループ・重複・repoKey を持つのに w:）でも起動し、捨てた参照をログに出す
AssertionError: expected { …(2) } to deeply equal { top: [ 'g:g1', 'w:w2', …(1) ], …(1) }
- Expected
+ Received
  {
    "groups": {
      "g1": [
        "w:w3",
+       "w:w3",
+       "r:/gone/.git",
+     ],
+     "g9": [
+       "w:w2",
      ],
    },
    "top": [
+     "w:gone",
      "g:g1",
+     "g:g9",
+     "w:w1",
+     "w:w2",
      "w:w2",
-     "r:/repos/app/.git",
    ],
  }
 ❯ src/session/SessionService.test.ts:3105:39
    3103|     );
    3104|     // w:w1 は repoKey を持つので r: へ直る（末尾）。w3 は g1 の中に残る。
    3105|     expect(service.snapshot().layout).toEqual({ top: ["g:g1", "w:w2", …
       |                                       ^
    3106|     expect(service.persistedLayout()?.repoGroups).toEqual({ [K]: "g1" …
    3107|     expect(service.getWorkspace("w1")?.groupId).toBe("g1");
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL  src/session/SessionService.test.ts > SessionService — layout の復元（保存と復元） > レイアウトに無い workspace は一番上の末尾に足す
AssertionError: expected { top: [ 'w:w2' ], groups: {} } to deeply equal { top: [ 'w:w2', 'w:w1' ], groups: {} }
- Expected
+ Received
  {
    "groups": {},
    "top": [
      "w:w2",
-     "w:w1",
    ],
  }
```

#### 壊し 4: `restoreWorkspace` が `repoKey` から `git` を戻さない（`typeof data.repoKey === "never"`）

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionService.test.ts (172 tests | 3 failed | 147 skipped) 366ms
   ❯ SessionService — layout の復元（保存と復元） (4)
     × layout と repoGroups を戻すと、停止前と同じ並び・所属になり、git は repoKey だけ戻る（ブランチ null・件数 0） 25ms
     × 壊れた参照（実在しない workspace・グループ・重複・repoKey を持つのに w:）でも起動し、捨てた参照をログに出す 18ms
     × layout の無い保存は仮の状態のまま（導いた layout を載せ、書き出さない）。repoKey があれば起動直後から束ねる 17ms
 ❯ src/git/GitInfoPoller.test.ts (44 tests | 3 failed | 40 skipped) 250ms
   ❯ DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） (3)
     × グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ 83ms
     × フォルダが消えて判定が取れない workspace は、復元した判定・並びのまま残る（取れない結果は何も変えない） 60ms
     × layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない 50ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ
AssertionError: expected { top: [ 'g:g1', 'w:w4', …(3) ], …(1) } to deeply equal { top: [ 'g:g1', 'w:w4', …(1) ], …(1) }
- Expected
+ Received
  {
    "groups": {
-     "g1": [
-       "r:/tmp/soda-persist-oJ64Sm/.git",
-     ],
+     "g1": [],
    },
    "top": [
      "g:g1",
      "w:w4",
-     "r:/tmp/soda-persist-Y8ujEC/.git",
+     "w:w1",
+     "w:w2",
+     "w:w3",
    ],
  }
 ❯ src/git/GitInfoPoller.test.ts:870:37
    868|     await after.restore(data);
    869|     // 復元の直後（判定の確認の前）: 保存した repoKey で束ねて並ぶ。ブランチ名と件数はまだ無い。
    870|     expect(after.snapshot().layout).toEqual(expectedLayout);
       |                                     ^
    871|     expect(after.snapshot().workspaces.map((x) => x.id)).toEqual(expec…
    872|     expect(after.getWorkspace(w.id)?.git).toEqual({ branch: null, ahea…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/6]⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > フォルダが消えて判定が取れない workspace は、復元した判定・並びのまま残る（取れない結果は何も変えない）
AssertionError: expected null to match object { …(2) }
- Expected:
{
  "branch": null,
  "repoKey": "/tmp/soda-persist-TVSuOj/.git",
}
+ Received:
null
 ❯ src/git/GitInfoPoller.test.ts:899:43
    897|     await after.restore(data);
    898|     await new DefaultGitInfoPoller(after, new ChildProcessGitRunner())…
    899|     expect(after.getWorkspace(a.id)?.git).toMatchObject({ repoKey: key…
       |                                           ^
    900|     expect(after.getWorkspace(a.id)?.groupId).toBe(group.id);
    901|     expect(after.snapshot().layout!.groups[group.id]).toEqual([`r:${ke…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/6]⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > layout の無い古い保存（repoKey だけ有る）は仮の状態で始まり、起動直後から束ねて並び、保存にも layout を書かない
AssertionError: expected { top: [ 'w:w1', 'w:w2' ], groups: {} } to deeply equal { …(2) }
- Expected
```
- T9 [should] 新規テストの分割代入が no-unused-vars で落ちる（GitInfoPoller.test.ts・SessionFile.test.ts）→ コピーして delete する形に直した [conv:-]
- T9 [nit] 壊れた保存（layout に r:K があるのに repoGroups に K が無い）で実効の groupId が null になる → 通常の保存では起きないため直さず review に委ねる [conv:-]

### T10 壊して落ちる確認

以下 3 つの壊し方を当て、落ちることを確かめてから元に戻した（git diff で確認）。生の出力（`vitest run` の出力から本文以外の空行・RUN 行のログを省いた）:

```
## A: composeServer の配線を外す
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/composeServer.layoutMigration.integration.test.ts (1 test | 1 failed) 12091ms
   ❯ composeServer: 移行の確定（最初の 1 周の合図） (1)
     × 本体だけがグループに居る古い保存: 最初の 1 周の後に確定し、worktree も同じグループへ入り、session.json に layout・repoGroups が書かれる 12090ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/composeServer.layoutMigration.integration.test.ts > composeServer: 移行の確定（最初の 1 周の合図） > 本体だけがグループに居る古い保存: 最初の 1 周の後に確定し、worktree も同じグループへ入り、session.json に layout・repoGroups が書かれる
Error: timeout: layout is confirmed after the first round
 ❯ waitFor src/composeServer.layoutMigration.integration.test.ts:17:35
     15|   const until = Date.now() + 10_000;
     16|   while (!cond()) {
     17|     if (Date.now() > until) throw new Error(`timeout: ${what}`);
       |                                   ^
     18|     await new Promise((r) => setTimeout(r, 25));
     19|   }
 ❯ src/composeServer.layoutMigration.integration.test.ts:88:5
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  13:02:56
   Duration  13.50s (tests 90%, transform 8%, import 2%)
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/composeServer.layoutMigration.integration.test.ts
## B: confirmLayout の「確定済みなら何もしない」を外す
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionService.test.ts (182 tests | 1 failed | 169 skipped) 286ms
   ❯ SessionService — 移行の確定（仮の状態 → confirmLayout） (10)
     × 確定は 1 回だけ: 2 回目の合図は何も配らず、保存も予約しない 19ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionService.test.ts > SessionService — 移行の確定（仮の状態 → confirmLayout） > 確定は 1 回だけ: 2 回目の合図は何も配らず、保存も予約しない
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
 ❯ src/session/SessionService.test.ts:3257:32
    3255|     service.confirmLayout();
    3256|     expect(events).toEqual([]);
    3257|     expect(persist.touchCount).toBe(0);
       |                                ^
    3258|   });
    3259|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed | 169 skipped (182)
   Start at  13:03:10
   Duration  980ms (transform 56%, tests 32%, import 12%)
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionService.test.ts -t 確定
## C: 確定の出口（publishSidebarChanges）を通さない
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/session/SessionService.test.ts (182 tests | 1 failed | 169 skipped) 279ms
   ❯ SessionService — 移行の確定（仮の状態 → confirmLayout） (10)
     × 別々のグループに居る本体と worktree: 本体の所属に揃う（worktree の workspace.updated が出る）。保存は確定の後に layout を書く 25ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionService.test.ts > SessionService — 移行の確定（仮の状態 → confirmLayout） > 別々のグループに居る本体と worktree: 本体の所属に揃う（worktree の workspace.updated が出る）。保存は確定の後に layout を書く
AssertionError: expected [] to deeply equal [ 'workspace.updated' ]
- Expected
+ Received
- [
-   "workspace.updated",
- ]
+ []
 ❯ src/session/SessionService.test.ts:3204:40
    3202|     expect(service.getWorkspace("w2")?.groupId).toBe("g1");
    3203|     // 導いたレイアウトと同じなので sidebar.layout_changed は出ない。groupId が変わった w2 だけ …
    3204|     expect(events.map((e) => e.event)).toEqual(["workspace.updated"]);
       |                                        ^
    3205|     expect(persist.touchCount).toBe(1);
    3206|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed | 169 skipped (182)
   Start at  13:03:12
   Duration  1.04s (transform 59%, tests 29%, import 12%)
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionService.test.ts -t 確定
```

- A: `composeServer.ts` の `onFirstRoundDone` の中の `session.confirmLayout()` を外す → 結合テストが「layout is confirmed after the first round」で時間切れ。
- B: `SessionService.confirmLayout` の `hasLayout()` の早期 return を外す → 「確定は 1 回だけ」が落ちる（2 回目に保存を予約する）。
- C: `confirmLayout` が共通の出口 `publishSidebarChanges` を通さない → 「別々のグループ…」が落ちる（workspace.updated も保存の予約も出ない）。

#### 追記: isRunning ガードの回帰テスト（独自点検の指摘 [should]/[nit]）

配線を `packages/server/src/layoutConfirmWiring.ts` の `wireLayoutConfirmation` に切り出し（composeServer はこれを呼ぶ）、`layoutConfirmWiring.test.ts` で「stop 中に 1 周が終わっても確定せず、再開 start 後の 1 周で確定する」を通しで固定した。`if (poller.isRunning())` を外して落ちることを確認し、戻した。生の出力:

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/server
 ❯ src/layoutConfirmWiring.test.ts (1 test | 1 failed) 26ms
   ❯ wireLayoutConfirmation (1)
     × stop 中に 1 周が終わっても確定せず、再開（start）後の 1 周で確定する 25ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/layoutConfirmWiring.test.ts > wireLayoutConfirmation > stop 中に 1 周が終わっても確定せず、再開（start）後の 1 周で確定する
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
Received:
  1st vi.fn() call:
    Array []
Number of calls: 1
 ❯ src/layoutConfirmWiring.test.ts:20:31
     18|     await vi.waitFor(() => expect(pollNow).toHaveBeenCalledTimes(1));
     19|     await new Promise((r) => setTimeout(r, 20)); // 1 周目の合図が届くのを待つ
     20|     expect(confirmLayout).not.toHaveBeenCalled();
       |                               ^
     21|
     22|     poller.start(); // 再開。また 1 周して合図を出す
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  13:06:13
   Duration  153ms (transform 51%, tests 32%, import 13%, worker 3%)
```
- T10 [should] 一時停止中の合図を捨てる分岐に壊して落ちる確認が無い → 配線を layoutConfirmWiring.ts に切り出し、stop 中に 1 周が終わる→確定しない→再開後に確定するテストを足して確認 [conv:regression-negative-control!]
- T10 [nit] stop→再開→確定の通しの確認が無い → 同じテストで通した [conv:-]
- T11 [nit] コメントの「navigate の6操作」が現在の数と合わない → 現在形の 2 か所を直した（「当初は…7つ目」の経緯の記述は履歴なので残す） [conv:-]

### T12 壊して落ちる確認

#### 壊し 1: `currentVisibleWorkspaceIds`（キー操作の順）を木ではなく平らな順（`session.workspaces.keys()`）に戻す

```
     × up/down はグループがあっても画面上の並び（グループはまとめて1ブロック）を辿る 9ms
     × 画面上の並び（グループはまとめて1ブロック）を辿る——開いた順が A, C, B でも次は画面上隣の B 1ms
     × workspaceDelta・workspaceIndex・navigate は、レイアウトの順（グループ → worktree グループの本体・子 → グループの中の通常の行 → 一番上の行）を辿る 2ms
     × 畳んだグループの中は今いる workspace だけが対象（畳んだ worktree グループも同じ） 1ms
     × layout の無い古いサーバでも、layoutFromLegacy で導いた順を辿る（同じリポジトリは本体の所属で 1 つの項目） 1ms
     × 描画の行の順はキー操作が辿る順（currentVisibleWorkspaceIds）と同じ 12ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — navigate > up/down はグループがあっても画面上の並び（グループはまとめて1ブロック）を辿る
AssertionError: expected 'C' to be 'B' // Object.is equality
Expected: "B"
Received: "C"
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspaceDelta（previous_workspace/next_workspace） > 画面上の並び（グループはまとめて1ブロック）を辿る——開いた順が A, C, B でも次は画面上隣の B
AssertionError: expected 'C' to be 'B' // Object.is equality
Expected: "B"
Received: "C"
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — レイアウトの順（20261004-group-worktree-items） > workspaceDelta・workspaceIndex・navigate は、レイアウトの順（グループ → worktree グループの本体・子 → グループの中の通常の行 → 一番上の行）を辿る
AssertionError: expected 'A' to be 'W1' // Object.is equality
Expected: "W1"
Received: "A"
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — レイアウトの順（20261004-group-worktree-items） > 畳んだグループの中は今いる workspace だけが対象（畳んだ worktree グループも同じ）
AssertionError: expected 'M' to be 'B' // Object.is equality
Expected: "B"
Received: "M"
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — レイアウトの順（20261004-group-worktree-items） > layout の無い古いサーバでも、layoutFromLegacy で導いた順を辿る（同じリポジトリは本体の所属で 1 つの項目）
AssertionError: expected 'W1' to be 'M' // Object.is equality
Expected: "M"
Received: "W1"
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > 描画の行の順はキー操作が辿る順（currentVisibleWorkspaceIds）と同じ
AssertionError: expected [ 'a', 'main', 'wt', 'plain' ] to deeply equal [ 'a', 'wt', 'main', 'plain' ]
- Expected
+ Received
      Tests  6 failed | 266 passed (272)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/actions/ActionDispatcher.test.ts src/components/Sidebar.test.ts
```

#### 壊し 2: `Sidebar.vue` で worktree グループの子の字下げを `depth + 1` から `depth` にする（グループの中の子が 1 段にしかならない）

```
     × worktree 自動グループ：本体の行が頭を兼ね、子だけインデントする（herdr と同じ並び） 10ms
     × グループの中の worktree グループは字下げ 1（先頭）・2（子）。種類の印は見出しと先頭の行だけ（読み上げ用の文言つき） 6ms
     × layout の無い古いサーバでは layoutFromLegacy で導く（同じリポジトリは本体の所属 1 つにまとまる） 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [ false, false ] to deeply equal [ false, true ]
- Expected
+ Received
-   true,
+   false,
AssertionError: expected [ …(5) ] to deeply equal [ …(5) ]
- Expected
+ Received
-     "depth": 2,
+     "depth": 1,
AssertionError: expected [ …(5) ] to deeply equal [ …(5) ]
- Expected
+ Received
-     "depth": 2,
+     "depth": 1,
      Tests  3 failed | 91 passed (94)
```

確認後は 2 か所とも元に戻し、web の全テスト（103 ファイル・2131 件）が通ることを確かめた。


### T12 壊して落ちる確認（追補：独点検の指摘）

#### 壊し 3: `StoreAdapter.ts` の `sidebar.layout_changed` の反映（`session.layoutChanged` の呼び出し）を外す

```
     × applySnapshot は layout を保持し、sidebar.layout_changed で差し替わる。layout の無いスナップショットでは null に戻る 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/StoreAdapter.test.ts > StoreAdapter — 通知への注入口 > applySnapshot は layout を保持し、sidebar.layout_changed で差し替わる。layout の無いスナップショットでは null に戻る
AssertionError: expected { top: [ 'w:w1' ], groups: {} } to deeply equal { top: [ 'g:g1' ], …(1) }
- Expected
+ Received
-   "groups": {
-     "g1": [
+   "groups": {},
+   "top": [
-     ],
-   },
-   "top": [
-     "g:g1",
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 129 passed (130)
```

#### 壊し 4: `session.ts` の `clear()` の `layout.value = null` を外す（新規テスト「clear は layout を null に戻す」を `session.test.ts` に追加）

```
     × clear は layout を null に戻す 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/session.test.ts > useSessionStore > clear は layout を null に戻す
AssertionError: expected { top: [ 'w:w1' ], groups: {} } to be null
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
```

#### 壊し 5: `SidebarKindIcon.vue` の `v-if="!props.compact"` を外す（畳んだ側にも文言が出る）

```
     × 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ） 11ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 Test Files  1 failed (1)
      Tests  1 failed | 93 passed (94)
```

#### 壊し 6: 畳んだ側の `role` を外す

```
     × 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ） 13ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ）
AssertionError: expected [ [ undefined, 'グループ' ], …(1) ] to deeply equal [ [ 'img', 'グループ' ], …(1) ]
- Expected
+ Received
-     "img",
+     undefined,
-     "img",
+     undefined,
 Test Files  1 failed (1)
      Tests  1 failed | 93 passed (94)
```

#### 壊し 7: 畳んだ側の `aria-label` を外す

```
     × 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ） 14ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ）
AssertionError: expected [ [ 'img', undefined ], …(1) ] to deeply equal [ [ 'img', 'グループ' ], …(1) ]
- Expected
+ Received
-     "グループ",
+     undefined,
-     "worktree グループ",
+     undefined,
 Test Files  1 failed (1)
      Tests  1 failed | 93 passed (94)
```

確認後はすべて元に戻した（バックアップとの cmp で一致）。展開時の文言は既存テスト（`.sidebar-kind-text` の文言と有無）が見る。

なお nit 対応で `.sidebar-kind-text` を `.sidebar-kind-icon`（position: relative を付与）の中へ移した（兄弟では基準にならないため）。それに伴い外枠の `aria-hidden` は外し、図形の svg だけ `aria-hidden` のまま。golden 2 件（sidebar-default-*.html）は構造の移動分だけ更新。
- T12 [should] layout_changed の反映・clear の null 戻し・種類の印の読み上げ文言の壊して落ちる確認が無い → 追補に生の出力を貼り、clear のテストを足した [conv:regression-negative-control!]
- T12 [nit] 視覚的に隠した文言の基準になる祖先に position:relative が無い → .sidebar-kind-icon の中へ移して relative を付けた（golden 2 件を更新） [conv:-]

### T13 壊して落ちる確認

以下 3 つの壊し方を当て、落ちることを確かめてから元に戻した（git diff で確認）。生の出力（`vitest run` の失敗の見出しと 1 行目）。

```

#### 追補（独立点検の指摘: 振る舞いごとの壊して落ちる確認）

実装を 1 行ずつ壊して該当ファイルの `vitest run` を当て、毎回元に戻した（最後に git diff で差分が変わらないことを確認）。出力は失敗の見出しと比較の差分（長いものは先頭を省略）。対象は ① `moveGroupBy` の名前順の拒否と `item.move_by` の送信（A1・A2）、② layout ありサーバの `group.create`（`workspaceId` 添え 1 回）・`add_member`・`remove_member` が 1 回（B1〜B3）、③ `openGroupPicker` の今のグループ除外とレイアウト順（C1・C2）、④ ContextMenu の「別のグループへ移す…」とメニュー順（D1・D2）、⑤ 子の行で項目の所属により出し分ける `itemGroupIdOf`（E）、⑥ GroupPickerDialog の見出し切替（F）、⑦ ConfirmDialog の「本体がグループへ入っていても 2 件」（G）。壊してもテストが落ちないものは無かった。

```
## 壊しA1: moveGroupBy の名前順の拒否を外す
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout を持つサーバ > moveGroupBy: 名前順のときは送らず「名前順では並べ替えできません」と知らせる
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal []
- Expected
+ Received
- []
+ [
+   [
+     "item.move_by",
+     {
+       "direction": "previous",
+       "item": {
+         "groupId": "g1",
+         "kind": "group",
+       },
+     },
+   ],
+ ]
## 壊しA2: moveGroupBy が item.move_by を送らない（item.move を送る）
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout を持つサーバ > moveGroupBy: item.move_by を送る
AssertionError: expected [ [ 'item.move', …(1) ] ] to deeply equal [ [ 'item.move_by', …(1) ] ]
- Expected
+ Received
-     "item.move_by",
+     "item.move",
## 壊しB1: layout ありの group.create に workspaceId を添えない
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout を持つサーバ > confirmCreateGroup: group.create に workspaceId を添えて 1 回だけ送る
AssertionError: expected [ [ 'group.create', …(1) ] ] to deeply equal [ [ 'group.create', …(1) ] ]
- Expected
+ Received
-       "workspaceId": "w1",
## 壊しB2: layout ありの add_member が項目の全 workspace に送る（古い道を通る）
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout を持つサーバ > confirmAddToGroup: 項目の workspace が複数でも group.add_member は 1 回
AssertionError: expected [ [ 'group.add_member', …(1) ] ] to deeply equal [ [ 'group.add_member', …(1) ] ]
- Expected
+ Received
+       "workspaceId": "w1",
+     },
+   ],
+   [
+     "group.add_member",
+     {
+       "groupId": "g1",
## 壊しB3: layout ありの remove_member が全 workspace に送る
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout を持つサーバ > removeWorkspaceFromGroup: group.remove_member は 1 回
AssertionError: expected [ [ 'group.remove_member', …(1) ] ] to deeply equal [ [ 'group.remove_member', …(1) ] ]
- Expected
+ Received
+       "workspaceId": "w1",
+     },
+   ],
+   [
+     "group.remove_member",
+     {
## 壊しC1: openGroupPicker が今のグループを除かない
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > openGroupPicker: 選択肢はレイアウトの順で、移すときは今のグループを除く（moving 付き）
AssertionError: expected [ 'g3', 'g2', 'g1' ] to deeply equal [ 'g3', 'g1' ]
- Expected
+ Received
+   "g2",
## 壊しC2: openGroupPicker がレイアウト順でなく groups の順
 Test Files  1 failed (1)
      Tests  1 failed | 186 passed (187)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > openGroupPicker: 選択肢はレイアウトの順で、移すときは今のグループを除く（moving 付き）
AssertionError: expected [ 'g1', 'g3' ] to deeply equal [ 'g3', 'g1' ]
- Expected
+ Received
-   "g3",
+   "g3",
## 壊しD1: 「別のグループへ移す…」を出さない
 Test Files  1 failed (1)
      Tests  1 failed | 32 passed (33)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — workspace > グループに所属していれば「別のグループへ移す…」「グループから外す」「新しいグループを作る…」を出す（移し先が他に無ければ「移す」は出さない）
AssertionError: expected [ '名前の変更', '閉じる', 'グループから外す', …(1) ] to deeply equal [ '名前の変更', '閉じる', '別のグループへ移す…', …(2) ]
- Expected
+ Received
-   "別のグループへ移す…",
## 壊しD2: 「新しいグループを作る…」を所属の項目より前へ戻す（メニュー順だけを変える）
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — workspace > グループに未所属なら「新しいグループを作る…」を呼び、グループが1件以上あれば「グループへ追加…」も出る
AssertionError: expected [ '名前の変更', '閉じる', '新しいグループを作る…', …(1) ] to deeply equal [ '名前の変更', '閉じる', 'グループへ追加…', …(1) ]
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — workspace > グループに所属していれば「別のグループへ移す…」「グループから外す」「新しいグループを作る…」を出す（移し先が他に無ければ「移す」は出さない）
AssertionError: expected [ '名前の変更', '閉じる', '新しいグループを作る…', …(1) ] to deeply equal [ '名前の変更', '閉じる', 'グループから外す', …(1) ]
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — workspace > worktree の子の行でも、項目（リポジトリ）の所属で出し分ける
      Tests  3 failed | 30 passed (33)
## 壊しE: itemGroupIdOf を行の workspace の groupId で答える（項目で見ない）
 Test Files  1 failed (1)
      Tests  1 failed | 32 passed (33)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — workspace > worktree の子の行でも、項目（リポジトリ）の所属で出し分ける
AssertionError: expected [ Array(6) ] to deeply equal [ Array(6) ]
- Expected
+ Received
-   "グループから外す",
+   "グループへ追加…",
## 壊しF: GroupPickerDialog の見出しを切り替えない
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/GroupPickerDialog.test.ts > GroupPickerDialog > 「別のグループへ移す…」から開いたときは見出しを変える
AssertionError: expected 'グループへ追加' to be '別のグループへ移す' // Object.is equality
## 壊しG: ConfirmDialog が本体のグループ所属で 0 件にする
 Test Files  1 failed (1)
      Tests  1 failed | 40 passed (41)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ConfirmDialog.test.ts > ConfirmDialog — 束ねた worktree も一緒に閉じる > 本体がグループへ入っていても、束ねられた worktree の件数（repoMembers の残り全部）を出す
Error: Unable to get .confirm-dialog-linked-worktrees within: <dialog data-v-d3e333dd="" role="alertdialog" aria-modal="true" class="confirm-dialog">
```

## 壊し1: ContextMenu の session.hasServerLayout を true に
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — group > layout の無い古いサーバでは「上へ移動」「下へ移動」を出さない
AssertionError: expected [ '名前の変更', '上へ移動', '下へ移動', 'グループを削除' ] to deeply equal [ '名前の変更', 'グループを削除' ]
      Tests  1 failed | 32 passed (33)
## 壊し2: itemWorkspaceIds を [workspaceId] だけに
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout の無い古いサーバ（今までの RPC） > confirmAddToGroup: 項目の workspace 全部（repoMembers の順）に group.add_member を順に送る
AssertionError: expected [ [ 'group.add_member', …(1) ] ] to deeply equal [ [ 'group.add_member', …(1) ], …(1) ]
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout の無い古いサーバ（今までの RPC） > removeWorkspaceFromGroup: 項目の workspace 全部に group.remove_member を順に送る
AssertionError: expected [ [ 'group.remove_member', …(1) ] ] to deeply equal [ …(2) ]
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張） > layout の無い古いサーバ（今までの RPC） > confirmCreateGroup: 2 段（group.create の後に項目の workspace 全部へ add_member）
AssertionError: expected [ [ 'group.create', …(1) ], …(1) ] to deeply equal [ [ 'group.create', …(1) ], …(2) ]
      Tests  3 failed | 184 passed (187)
## 壊し3: ConfirmDialog の件数を本体判定なしに（members[0] 条件を外す）
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ConfirmDialog.test.ts > ConfirmDialog — 束ねた worktree も一緒に閉じる > 対象が worktree 自動グループの本体でなければチェックボックスを出さない
AssertionError: expected true to be false // Object.is equality
      Tests  1 failed | 40 passed (41)
```
- T13 [should] 回帰テストの壊して落ちる確認が一部の振る舞いにしか無い → 12 の壊しを追補に貼った（落ちないテストは無かった） [conv:regression-negative-control!]
- T13 [nit] 所属ありで移し先が無いとき「別のグループへ移す…」を出さない判断が design に無い → D21 に design との差として明記 [conv:-]

### T14 壊して落ちる確認

以下は 1 つずつ実装の 1 行を壊し、該当のテストファイルを実行した生の出力（`grep` で失敗の行だけ抜いた）。確認後に元へ戻し、`diff` で一致を確かめた。

```
--- 壊す: 別の入れ物の判定を外す（row.container !== dragged.container → false）
 1 file changed, 51 insertions(+), 35 deletions(-)
     × 一番上の項目を、グループの中の行の上へ落とすことはできない（印が付き、離しても送らず知らせる） 9ms
     × グループの中の項目を、一番上の行の上へ落とすことはできない（送らず知らせる） 6ms
     × グループを、別のグループの中の行の上へ落とすことはできない 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 一番上の項目を、グループの中の行の上へ落とすことはできない（印が付き、離しても送らず知らせる）
AssertionError: expected [ 'sidebar-row', …(2) ] to include 'sidebar-row-drop-invalid'
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループの中の項目を、一番上の行の上へ落とすことはできない（送らず知らせる）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループを、別のグループの中の行の上へ落とすことはできない
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
      Tests  3 failed | 99 passed (102)
--- 壊す: 名前順の一番上の拒否を外す
 1 file changed, 51 insertions(+), 35 deletions(-)
       × 一番上の項目の並べ替えは受け付けず、送らずに「名前順では並べ替えできません」と知らせる 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 名前順（design「並びと名前順」） > 一番上の項目の並べ替えは受け付けず、送らずに「名前順では並べ替えできません」と知らせる
AssertionError: expected [ 'sidebar-row', …(1) ] to include 'sidebar-row-drop-invalid'
      Tests  1 failed | 101 passed (102)
--- 壊す: 子の行の項目を自分自身にする（itemHeadId → ws.id）
 1 file changed, 51 insertions(+), 35 deletions(-)
       × 子の行を掴むと、worktree グループ（先頭の workspace で指す項目）と全メンバーの id が渡る 11ms
       × 子の行の上へ落とすと、落とし先は親の worktree グループ（先頭の workspace）になる 5ms
       × 自分の worktree グループの別の行（先頭・子）の上で離しても何も送らず、知らせない 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 子の行を掴むと、worktree グループ（先頭の workspace で指す項目）と全メンバーの id が渡る
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'workspace', …(1) }, …(2) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 子の行の上へ落とすと、落とし先は親の worktree グループ（先頭の workspace）になる
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'workspace', …(1) }, …(2) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 自分の worktree グループの別の行（先頭・子）の上で離しても何も送らず、知らせない
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
      Tests  3 failed | 99 passed (102)
--- 壊す: 自分の項目の上を self としない
 1 file changed, 51 insertions(+), 35 deletions(-)
       × 自分の worktree グループの別の行（先頭・子）の上で離しても何も送らず、知らせない 9ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 自分の worktree グループの別の行（先頭・子）の上で離しても何も送らず、知らせない
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
      Tests  1 failed | 101 passed (102)
--- 壊す: 古いサーバの分岐を外す（常に item.move）
 1 file changed, 14 insertions(+), 7 deletions(-)
     × moveItemByDrag: layout の無い古いサーバには workspace.move_to（id の集まりと落とし先）を送る 8ms
     × moveItemByDrag: 古いサーバで落とし先の workspace が無い（空のグループの上）なら何も送らない（null は末尾の意味になる） 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: layout の無い古いサーバには workspace.move_to（id の集まりと落とし先）を送る
AssertionError: expected [ [ 'item.move', …(1) ] ] to deeply equal [ [ 'workspace.move_to', { …(2) } ] ]
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: 古いサーバで落とし先の workspace が無い（空のグループの上）なら何も送らない（null は末尾の意味になる）
AssertionError: expected [ [ 'item.move', …(1) ] ] to deeply equal []
      Tests  2 failed | 187 passed (189)
--- 壊す: 古いサーバの null の落とし先の guard を外す
 1 file changed, 14 insertions(+), 7 deletions(-)
     × moveItemByDrag: 古いサーバで落とし先の workspace が無い（空のグループの上）なら何も送らない（null は末尾の意味になる） 9ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: 古いサーバで落とし先の workspace が無い（空のグループの上）なら何も送らない（null は末尾の意味になる）
AssertionError: expected [ [ 'workspace.move_to', { …(2) } ] ] to deeply equal []
      Tests  1 failed | 188 passed (189)
--- 壊す: item.move を item.move_by にする
 1 file changed, 14 insertions(+), 7 deletions(-)
     × moveItemByDrag: layout を持つサーバには item.move（項目と落とし先の項目）を送る 9ms
     × moveItemByDrag: グループも項目として送る 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: layout を持つサーバには item.move（項目と落とし先の項目）を送る
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal [ [ 'item.move', …(1) ] ]
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: グループも項目として送る
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal [ [ 'item.move', …(1) ] ]
      Tests  2 failed | 187 passed (189)
```

#### T14 追補（独立点検の指摘: 振る舞いごとの壊して落ちる確認）

(a) の Esc のテストは、離した位置に行が無く、Esc が効かなくても何も送られないため落ちなかった（最初の壊しで `Tests 296 passed`）。離した位置に落とせる行を用意し、`workspaceDrag` が null になることも見るよう書き直した。書き直し後の壊しは末尾。(b)(3)(4) のあとに足したテスト（フォーカス・古いサーバの空のグループ・item.move の失敗）もここで確かめた。

```
--- 壊す: (a) Esc の取り消しを外す（書き直す前のテスト。落ちなかった）
      Tests  296 passed (296)
--- 壊す: (b) 行の外で離したときの取り消しを外す（drop が null のとき最後の行へ落とす）
     × 行の外で離すと取り消し（送らず、知らせない） 11ms
       × その行の上は落とし先にならない（印を出さず、離しても送らず知らせない） 5ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 行の外で離すと取り消し（送らず、知らせない）
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 古いサーバ（layout が無い）で、メンバーのいない空のグループ > その行の上は落とし先にならない（印を出さず、離しても送らず知らせない）
      Tests  2 failed | 294 passed (296)
--- 壊す: (c) 名前順の拒否が入れ物を見ない（dragged.container === null && を外す）
       × グループの中の並べ替えは名前順でもできる 10ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 名前順（design「並びと名前順」） > グループの中の並べ替えは名前順でもできる
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'workspace', …(1) }, …(2) ]
      Tests  1 failed | 295 passed (296)
--- 壊す: (d) 掴んだグループの中の行を self にしない
     × 掴んだグループ自身の中の行の上で離しても何も送らず、知らせない（自分の項目の上） 12ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 掴んだグループ自身の中の行の上で離しても何も送らず、知らせない（自分の項目の上）
AssertionError: expected [ { id: 4, …(1) } ] to have a length of +0 but got 1
      Tests  1 failed | 295 passed (296)
--- 壊す: (e) 別の入れ物の上で離したときの知らせを外す
     × 一番上の項目を、グループの中の行の上へ落とすことはできない（印が付き、離しても送らず知らせる） 11ms
     × グループの中の項目を、一番上の行の上へ落とすことはできない（送らず知らせる） 6ms
     × グループを、別のグループの中の行の上へ落とすことはできない 6ms
       × 一番上の項目の並べ替えは受け付けず、送らずに「名前順では並べ替えできません」と知らせる 6ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 一番上の項目を、グループの中の行の上へ落とすことはできない（印が付き、離しても送らず知らせる）
AssertionError: expected [] to include '同じグループの中、または一番上の項目の間でだけ並べ替えできます'
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループの中の項目を、一番上の行の上へ落とすことはできない（送らず知らせる）
AssertionError: expected [] to include '同じグループの中、または一番上の項目の間でだけ並べ替えできます'
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループを、別のグループの中の行の上へ落とすことはできない
AssertionError: expected [] to have a length of 1 but got +0
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 名前順（design「並びと名前順」） > 一番上の項目の並べ替えは受け付けず、送らずに「名前順では並べ替えできません」と知らせる
AssertionError: expected [] to deeply equal [ '名前順では並べ替えできません' ]
      Tests  4 failed | 292 passed (296)
--- 壊す: (f) 落とせる行の sidebar-row-drop-target を外す
     × ドラッグ中に別の行の上へ来ると sidebar-row-drop-target が付き、ドラッグ元自身には付かない 9ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > ドラッグ中に別の行の上へ来ると sidebar-row-drop-target が付き、ドラッグ元自身には付かない
AssertionError: expected [ 'sidebar-row' ] to include 'sidebar-row-drop-target'
      Tests  1 failed | 295 passed (296)
--- 壊す: (g) item.move 失敗時の知らせを外す
     × moveItemByDrag: item.move が失敗したら「移動できませんでした」と知らせる 10ms
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: item.move が失敗したら「移動できませんでした」と知らせる
AssertionError: expected [] to deeply equal [ '移動できませんでした' ]
      Tests  1 failed | 295 passed (296)
--- 壊す: (h) 離した後の focusWorkspace を外す
     × 離したあと、掴んだ行の workspace にフォーカスを残す（workspace.focus も送る） 9ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 離したあと、掴んだ行の workspace にフォーカスを残す（workspace.focus も送る）
AssertionError: expected 'w2' to be 'w1' // Object.is equality
      Tests  1 failed | 295 passed (296)
--- 壊す: (3) 古いサーバの落とし先なしを落とし先にする
       × その行の上は落とし先にならない（印を出さず、離しても送らず知らせない） 9ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 古いサーバ（layout が無い）で、メンバーのいない空のグループ > その行の上は落とし先にならない（印を出さず、離しても送らず知らせない）
AssertionError: expected [ 'sidebar-row', …(1) ] to not include 'sidebar-row-drop-target'
      Tests  1 failed | 295 passed (296)
--- 壊す: (4) 古いサーバの空のグループを掴めるようにする（Sidebar 側）
       × 空のグループは掴めない（ドラッグが始まらず、workspaceIds: [] を送らない） 9ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 古いサーバ（layout が無い）で、メンバーのいない空のグループ > 空のグループは掴めない（ドラッグが始まらず、workspaceIds: [] を送らない）
AssertionError: expected { sourceIds: [], …(2) } to be null
      Tests  1 failed | 295 passed (296)
--- 壊す: (4) 古いサーバの空 workspaceIds を送る（ActionDispatcher 側）
     × moveItemByDrag: 古いサーバで動かす workspace が無い（空のグループ）なら何も送らない（workspaceIds: [] を送らない） 9ms
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveItemByDrag: 古いサーバで動かす workspace が無い（空のグループ）なら何も送らない（workspaceIds: [] を送らない）
AssertionError: expected [ [ 'workspace.move_to', …(1) ] ] to deeply equal []
      Tests  1 failed | 295 passed (296)
--- 壊す: (a) Esc の取り消しを外す（書き直し後。window の keydown 登録を外す）
     × Esc で取り消し、moveItemByDrag を呼ばない 11ms
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > Esc で取り消し、moveItemByDrag を呼ばない
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
      Tests  1 failed | 104 passed (105)
```

- 元に戻して `diff` で一致を確認した。web の components・actions は 1138 件すべて通る。
- T14 [should] 壊して落ちる確認が一部の振る舞いにしか無い → (a)〜(h) を追補に貼り、落ちなかった Esc のテストを書き直した [conv:regression-negative-control!]
- T14 [nit] 他のテストの古いモック moveWorkspacesByDrag が残っていた → moveItemByDrag に直した [conv:-]
- T14 [nit] 古いサーバで空のグループの上に落とせる印が出るのに何も起きない → 落とし先にしない（印を出さない）ようにした [conv:-]
- T14 [nit] 古いサーバで空のグループを掴むと workspace_ids が空の move_to を送りうる → ドラッグを始めない・送らない guard を足した [conv:-]

### T15 壊して落ちる確認

実装の該当行を 1 つずつ壊し、足したテストが落ちることを確かめた（確認後はすべて元に戻した）。生の出力（絞り込み済み）:

```
#### navigate up/down が見出しを選ばない
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > up/down はグループの見出しも順に選ぶ（空のグループにも届く）。キーは workspace の id と混ざらない
AssertionError: expected [ 'M', 'W1', 'A', 'B', 'M', 'W1' ] to deeply equal [ 'M', 'W1', 'A', 'group:g2', …(2) ]
- Expected
+ Received
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > 畳んだグループの見出しにも届く（中は今いる workspace だけ）
AssertionError: expected 'B' to be 'group:g2' // Object.is equality
Expected: "group:g2"
Received: "B"
      Tests  2 failed | 200 passed (202)
#### toggleCollapse が見出しを無視
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: 見出しならグループを group.toggle_collapsed で切り替える
AssertionError: expected [] to deeply equal [ [ 'group.toggle_collapsed', …(1) ] ]
- Expected
+ Received
      Tests  1 failed | 201 passed (202)
#### toggleCollapse が worktree グループを畳まない
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: worktree グループの先頭でも子でも、その worktree グループを畳む・広げる（サーバへは送らない）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
      Tests  1 failed | 201 passed (202)
#### 1 つだけのリポジトリも畳む
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: 通常の行・選択なしは何もしない（1 つだけのリポジトリも worktree グループではない）
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
      Tests  1 failed | 201 passed (202)
#### moveWorkspace が item.move_by でなく workspace.move
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveWorkspace: layout を持つサーバには項目の item.move_by を送る（対象は今いる workspace。サーバが項目に読み替える）
AssertionError: expected [ [ 'workspace.move', …(1) ] ] to deeply equal [ [ 'item.move_by', …(1) ] ]
- Expected
+ Received
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveWorkspace: 名前順の一番上は送らず知らせる。グループの中は送る
AssertionError: expected [ [ 'workspace.move', …(1) ] ] to deeply equal [ [ 'item.move_by', …(1) ] ]
- Expected
+ Received
      Tests  2 failed | 200 passed (202)
#### 古いサーバにも item.move_by
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — workspace の並べ替え > moveWorkspace: 表示中の workspace を対象に workspace.move を送る
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal [ [ 'workspace.move', …(1) ] ]
- Expected
+ Received
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveWorkspace: layout の無い古いサーバには今までの workspace.move を送る
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal [ [ 'workspace.move', …(1) ] ]
- Expected
+ Received
      Tests  2 failed | 200 passed (202)
#### 名前順の一番上を受け付ける
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveWorkspace: 名前順の一番上は送らず知らせる。グループの中は送る
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal []
- Expected
+ Received
      Tests  1 failed | 201 passed (202)
#### 名前順でグループの中も拒否
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveWorkspace: 名前順の一番上は送らず知らせる。グループの中は送る
AssertionError: expected [] to deeply equal [ [ 'item.move_by', …(1) ] ]
- Expected
+ Received
      Tests  1 failed | 201 passed (202)
#### 見出しの Enter で focus を送る
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > activate: 見出しを選んでいるときは選択をやめるだけで workspace.focus を送らない
AssertionError: expected [ [ 'workspace.focus', …(1) ] ] to deeply equal []
- Expected
+ Received
      Tests  1 failed | 201 passed (202)
#### Sidebar: 見出しの選択スタイル
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > navigate モードで見出しを選ぶと見出しの行に選択スタイルが付き、メニューの要求はグループのメニューを開く
AssertionError: expected [] to have a length of 1 but got +0
- Expected
+ Received
      Tests  1 failed | 105 passed (106)
#### Sidebar: 見出しのメニューを開かない
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > navigate モードで見出しを選ぶと見出しの行に選択スタイルが付き、メニューの要求はグループのメニューを開く
AssertionError: expected "vi.fn()" to be called with arguments: [ …(2) ]
Received:
      Tests  1 failed | 105 passed (106)
#### client-core: navigableRowsOfTree が見出しを差し込まない
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > 見出しを中の行の前に差し込む（空のグループにも届く）
AssertionError: expected [ 'w1', 'w2', 'w4', 'w5' ] to deeply equal [ 'group:g1', 'w1', 'w2', 'w4', …(2) ]
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > 畳んだグループも見出しは残り、中は今いる workspace だけ
AssertionError: expected [ 'w5' ] to deeply equal [ 'group:g1', 'group:g2', 'w5' ]
      Tests  2 failed | 53 passed (55)
```


### T15 壊して落ちる確認（独立点検の指摘への追加）

Enter・openMenu・Sidebar の見出し・client-core のキー変換、選択が消える経路（メニューを閉じる・項目の実行）、消えたグループの実在確認を 1 行ずつ壊した（確認後はすべて元に戻した）。「見出しのメニューから上へ移動を実行しても選択が残る」テストは、実際の `ContextMenu` を実物の `ActionDispatcher` で動かして通す。生の出力（絞り込み済み）:

```
#### 見出しの Enter で focus を送る
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > activate: 見出しを選んでいるときは選択をやめるだけで workspace.focus を送らない
AssertionError: expected [ [ 'workspace.focus', …(1) ] ] to deeply equal []
- Expected
+ Received
      Tests  1 failed | 309 passed (310)
#### openMenu: 見出しのとき要求を立てない
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > openMenu: 見出しを選んでいても要求を立てる（開く先の判断は Sidebar.vue）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
      Tests  1 failed | 309 passed (310)
#### openMenu: 選択が無くても要求を立てる
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — navigate > openMenu: 選択が無ければ何もしない
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
      Tests  1 failed | 309 passed (310)
#### Sidebar: 見出しの選択スタイル
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > navigate モードで見出しを選ぶと見出しの行に選択スタイルが付き、メニューの要求はグループのメニューを開く
AssertionError: expected [] to have a length of 1 but got +0
- Expected
+ Received
      Tests  1 failed | 309 passed (310)
#### Sidebar: 見出しでグループのメニューを開かない
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > navigate モードで見出しを選ぶと見出しの行に選択スタイルが付き、メニューの要求はグループのメニューを開く
AssertionError: expected "vi.fn()" to be called with arguments: [ …(2) ]
Received:
      Tests  1 failed | 309 passed (310)
#### Sidebar: 消えたグループの実在確認を外す
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > navigate モードで、別の画面で消されたグループの見出しが選択に残っていても、メニューは開かず選択を外す
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
Received:
      Tests  1 failed | 309 passed (310)
#### dispatcher: 消えたグループの実在確認を外す
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: 別の画面で消されたグループが選択に残っていたら、何も送らず選択を外す
AssertionError: expected [ [ 'group.toggle_collapsed', …(1) ] ] to deeply equal []
- Expected
+ Received
      Tests  1 failed | 309 passed (310)
#### client-core: navigateKeyOfGroup の接頭辞を変える
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > 見出しを中の行の前に差し込む（空のグループにも届く）
AssertionError: expected [ 'g:g1', 'w1', 'w2', 'w4', …(2) ] to deeply equal [ 'group:g1', 'w1', 'w2', 'w4', …(2) ]
- Expected
+ Received
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > 畳んだグループも見出しは残り、中は今いる workspace だけ
AssertionError: expected [ 'g:g1', 'g:g2', 'w5' ] to deeply equal [ 'group:g1', 'group:g2', 'w5' ]
- Expected
+ Received
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > navigateKeyOfGroup は group:<id>、navigateKeyOfRow は見出しなら group:<id>・workspace なら id そのもの
AssertionError: expected 'g:g1' to be 'group:g1' // Object.is equality
Expected: "group:g1"
Received: "g:g1"
      Tests  3 failed | 53 passed (56)
#### client-core: groupIdOfNavigateKey が先頭でなく含むだけで読む
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > 選択のキーの読み替え（workspace の id とは混ざらない）
AssertionError: expected ':g1' to be null
- Expected:
+ Received:
      Tests  1 failed | 55 passed (56)
#### client-core: groupIdOfNavigateKey が null を読む
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > 選択のキーの読み替え（workspace の id とは混ざらない）
AssertionError: expected '' to be null
- Expected:
+ Received:
      Tests  1 failed | 55 passed (56)
#### client-core: navigateKeyOfRow が見出しを id のまま返す
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > navigateKeyOfGroup は group:<id>、navigateKeyOfRow は見出しなら group:<id>・workspace なら id そのもの
AssertionError: expected 'g1' to be 'group:g1' // Object.is equality
Expected: "group:g1"
Received: "g1"
      Tests  1 failed | 55 passed (56)
#### client-core: navigateKeyOfRow が workspace に接頭辞を付ける
 FAIL  src/workspace/workspaceGrouping.test.ts > navigableRowsOfTree（AC-I3） > navigateKeyOfGroup は group:<id>、navigateKeyOfRow は見出しなら group:<id>・workspace なら id そのもの
AssertionError: expected 'group:w1' to be 'w1' // Object.is equality
Expected: "w1"
Received: "group:w1"
      Tests  1 failed | 55 passed (56)
#### ContextMenu: メニューを閉じるときに選択を消す
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > 見出しのメニューから「上へ移動」を実行しても、見出しの選択が残る（メニューを閉じる経路でも消えない）
AssertionError: expected null to be 'group:g1' // Object.is equality
- Expected:
+ Received:
      Tests  1 failed | 309 passed (310)
#### ContextMenu: 項目の実行で選択を消す
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > 見出しのメニューから「上へ移動」を実行しても、見出しの選択が残る（メニューを閉じる経路でも消えない）
AssertionError: expected null to be 'group:g1' // Object.is equality
- Expected:
+ Received:
      Tests  1 failed | 309 passed (310)
```
- T15 [should] Enter・openMenu・Sidebar の見出し・navigableRowsOfTree 等の壊して落ちる確認が無い → 14 箇所を追補に貼った [conv:regression-negative-control!]
- T15 [should] 「上へ／下へ移動の後も見出しに選択が残る」のテストが何も確かめていなかった → 実物の ContextMenu と ActionDispatcher を通すテストに書き直した [conv:regression-negative-control]
- T15 [nit] 選択中のグループが消えても group:<id> の選択が残る → 実在確認を入れて何もせず選択を外す（テストと壊して落ちる確認つき、D23 に追記） [conv:-]

### T16 壊して落ちる確認

実装行を 1 つずつ壊して vitest を流し、落ちた出力（失敗の行・AssertionError・Expected/Received の抜粋。`grep` で絞ったもの）を貼る。各確認の後は元に戻した（`diff` で一致を確認）。

- A: `SessionModel.applyToSession` の `sidebar.layout_changed`（`this.layout = e.data.layout`）を無視する／A2: `applySnapshot` で `layout` を捨てる
- B: `mouse.ts` の `x <= hit.toggleX`（先頭の行の ▸/▾ の当たり）を外す／B2: 右クリックで `autoGroup` を workspace として扱わない
- C: `sidebarTree.ts` の木が `model.effectiveLayout()` を使わず、いつも `layoutFromLegacy` で導く（描画とキー操作の両方が落ちる）
- D: 先頭の行の種類の印 `ψ` を外す／E: 畳んだグループの中の workspace を全部描く／F: 先頭の行の 2 行目の字下げ（6 → 2）

```
=== A: sidebar.layout_changed を無視
 FAIL  src/model/SessionModel.test.ts > SessionModel: サイドバーのレイアウト（T16） > snapshot の layout を持ち、sidebar.layout_changed で置き換える。無ければ null（古いサーバ）
AssertionError: expected [ 'w:w2', 'w:w1' ] to deeply equal [ 'w:w1', 'w:w2' ]
- Expected
+ Received
 ❯ src/model/SessionModel.test.ts:163:27
      Tests  1 failed | 10 passed (11)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/model/SessionModel.test.ts
=== A2: snapshot の layout を捨てる
 FAIL  src/model/SessionModel.test.ts > SessionModel: サイドバーのレイアウト（T16） > snapshot の layout を持ち、sidebar.layout_changed で置き換える。無ければ null（古いサーバ）
AssertionError: expected null to deeply equal { top: [ 'w:w2', 'w:w1' ], groups: {} }
- Expected:
+ Received:
 ❯ src/model/SessionModel.test.ts:155:22
 FAIL  src/model/SessionModel.test.ts > SessionModel: サイドバーのレイアウト（T16） > effectiveLayout は layout が無ければ layoutFromLegacy で導き、マシンの切り替え（reset）で空に戻る
AssertionError: expected { top: [ 'w:w1', 'w:w2' ], groups: {} } to deeply equal { top: [ 'w:w2', 'w:w1' ], groups: {} }
- Expected
+ Received
 ❯ src/model/SessionModel.test.ts:172:33
      Tests  2 failed | 9 passed (11)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/model/SessionModel.test.ts
=== B: toggleX の当たりを外す
 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > worktree グループの先頭の行：左の ▸/▾ のクリックは折りたたみ、ほかの桁は workspace へ移る。右クリックは workspace のメニュー（T16）
AssertionError: expected [] to deeply equal [ { patch: { …(1) } } ]
- Expected
+ Received
 ❯ src/input/mouse.test.ts:134:61
      Tests  1 failed | 20 passed (21)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/input/mouse.test.ts
=== B2: 右クリックで autoGroup を workspace として扱わない
 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > worktree グループの先頭の行：左の ▸/▾ のクリックは折りたたみ、ほかの桁は workspace へ移る。右クリックは workspace のメニュー（T16）
AssertionError: expected { kind: 'global' } to deeply equal { Object (kind, workspaceId) }
- Expected
+ Received
 ❯ src/input/mouse.test.ts:145:42
      Tests  1 failed | 20 passed (21)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/input/mouse.test.ts
=== C: 木に layout を使わない
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — tab・workspace > workspaceDelta・workspaceIndex は layout の順（描画と同じ木）で動き、畳んだグループの中は今いる workspace だけ（T16）
AssertionError: expected 'w1' to be 'w3' // Object.is equality
Expected: "w3"
Received: "w1"
 ❯ src/actions/TuiDispatcher.test.ts:413:33
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > グループの中に worktree グループと通常の行を 3 段で描き、先頭の行とグループの見出しに種類の印を付ける
AssertionError: expected [ '▾ ψ main', 'wt-a', 'wt-b', …(2) ] to deeply equal [ '▾ ≡ 仕事', '▾ ψ main', 'wt-a', …(2) ]
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:81:61
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > 畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ
AssertionError: expected [ 'main', 'wt-a', 'wt-b', 'solo', 'G' ] to deeply equal [ 'G', 'wt-b' ]
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:99:73
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > 名前順は一番上の行だけを並べ、グループの中はレイアウトの順のまま
AssertionError: expected [ Array(5) ] to deeply equal [ Array(5) ]
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:122:69
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > workspace の切り替え・番号・navigate の順（見えている行の順）は描画と同じ木から出る
AssertionError: expected [ 'main', 'wt-a', 'wt-b', 'solo' ] to deeply equal [ 'solo', 'main', 'wt-a', 'wt-b' ]
- Expected
+ Received
=== D: worktree グループの印を外す
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > グループの中に worktree グループと通常の行を 3 段で描き、先頭の行とグループの見出しに種類の印を付ける
AssertionError: expected [ '▾ ≡ 仕事', '▾ main', 'wt-a', …(2) ] to deeply equal [ '▾ ≡ 仕事', '▾ ψ main', 'wt-a', …(2) ]
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:81:61
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > 畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ
AssertionError: expected [ '▾ ≡ G', '▸ main', 'wt-b', 'solo' ] to deeply equal [ '▾ ≡ G', '▸ ψ main', 'wt-b', 'solo' ]
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:107:61
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > layout の無い古いサーバは layoutFromLegacy で本体の所属に描く（子が別のグループでも 1 つの項目）
AssertionError: expected [ '▾ ≡ G', '▾ main', 'wt-a' ] to deeply equal [ '▾ ≡ G', '▾ ψ main', 'wt-a' ]
- Expected
+ Received
=== E: 畳んだグループの中を全部描く
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > 畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ
AssertionError: expected [ 'G', 'wt-b', 'solo' ] to deeply equal [ 'G', 'wt-b' ]
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:99:73
      Tests  1 failed | 5 passed (6)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/render/chrome/sidebar.test.ts
=== F: 先頭の行の 2 行目の字下げ
      Tests  6 passed (6)
=== F: 先頭の行の 2 行目の字下げを 6 → 2
 FAIL  src/render/chrome/sidebar.test.ts > サイドバーの木（T16。グループ・worktree グループ・子・通常の行） > 行の並びが 2 行以上でも、先頭の行の 2 行目は「▸ ψ 」の分だけ下げる（通常の行は状態の印の幅だけ）
AssertionError: expected 3 to be 7 // Object.is equality
- Expected
+ Received
 ❯ src/render/chrome/sidebar.test.ts:158:27
      Tests  1 failed | 6 passed (7)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/render/chrome
```
