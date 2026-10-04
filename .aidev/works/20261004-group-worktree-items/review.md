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

### T22 壊して落ちる確認

`ItemTargetSchema` の `ungrouped` と `SidebarLayoutSchema` の `ungrouped` を消して `messages.test.ts` を実行（確認後に戻した。`git diff` で差分が T22 の追加分だけであることを確認）。

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/messages.test.ts > messages > validates item.move / item.move_by params
ZodError: [
 FAIL  src/messages.test.ts > messages > parses SidebarLayout (top に "u"・ungrouped、未知の参照と余計なキーは通る)
AssertionError: expected { top: [ 'g:g1', 'u', 'g:g2' ], …(1) } to deeply equal { top: [ 'g:g1', 'u', 'g:g2' ], …(2) }
      Tests  2 failed | 46 passed (48)
```
- T22 [nit] 旧形の layout を持つ保存が全体として壊れた扱いになる点が D26 に無い → D26 に補足（T24 で決める） [conv:-]
- T22 [nit] 壊して落ちる確認の戻しの cmp/diff の出力が無い → 現状の差分で protocol 279 件が通ることを点検で確認済み。記録のみ [conv:regression-negative-control]

### T23 壊して落ちる確認

実装の 1 行ずつを壊して `vitest run src/workspace`（client-core）を流した、落ちたテストの行（vitest の出力から `×` の行と件数の行を抜粋）。壊す→流す→元へ戻す、を 1 件ずつ行い、最後に全部戻した状態で client-core 785 件が通ることを確かめた。

```
#### 代表: 同じ worktreeKey の 2 つ目以降も代表にする (workspaceGrouping.ts)
     × AC19: 代表でない workspace の参照は w:<id>。代表の r:R を残し、w:<id> も有効 5ms
     × AC19: 同じ worktreeKey は平らな順で最初の 1 つだけが代表（r:）。2 つ目以降は w: の通常の項目で、repoMembers に入らない 6ms
     × AC19: worktreeKey が別の場所へ変わった workspace は、新しい worktreeKey の側で代表かどうかを決める 1ms
     × AC19: 代表でない workspace（同じフォルダの 2 つ目）は、worktree グループの一員ではなく workspace 単体 4ms
     × AC19: 代表でない workspace は w:<id> で自分の groupId に従い、代表の項目とは別に置く 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
      Tests  5 failed | 112 passed (117)

#### 代表: representativeIds が全員を代表にする (workspaceGrouping.ts)
     × AC19: r: の展開は代表だけ。代表でない workspace は w: の位置に出る 5ms
     × AC19: 代表でない workspace を代表の前へ並べても、代表は同じ worktree の workspace の一番前に残る（代表が入れ替わり続けない） 1ms
     × AC19: 同じ worktreeKey は平らな順で最初の 1 つだけが代表（r:）。2 つ目以降は w: の通常の項目で、repoMembers に入らない 6ms
     × AC19: 代表が閉じる（一覧から消える）と、同じ worktreeKey の次の workspace が代表になる 1ms
     × AC19: 同じフォルダ（worktreeKey）の 2 つ目は worktree グループに入らず、通常の行として「グループなし」の末尾に出る 2ms
     × AC19: 代表でない workspace（同じフォルダの 2 つ目）は、worktree グループの一員ではなく workspace 単体 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
      Tests  6 failed | 111 passed (117)

#### repoMembers: 代表でない workspace も含める (workspaceGrouping.ts)
     × AC19: 同じ worktreeKey は平らな順で最初の 1 つだけが代表（r:）。2 つ目以降は w: の通常の項目で、repoMembers に入らない 6ms
     × AC19: 代表が閉じる（一覧から消える）と、同じ worktreeKey の次の workspace が代表になる 1ms
     × AC19: 同じフォルダ（worktreeKey）の 2 つ目は worktree グループに入らず、通常の行として「グループなし」の末尾に出る 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 114 passed (117)

#### 見出し: 本物のグループが無くても見出しを出す (workspaceGrouping.ts)
     × AC1: 同じリポジトリの代表が 2 つ以上なら worktree グループ（本体が先頭）、1 つなら通常の行。グループに入っていても同じ。グループが無ければ「グループなし」だけ（見出しなし） 8ms
     × AC20: 「グループなし」の見出しは、本物のグループが 1 つ以上あるときだけ。畳めるのも見出しがあるときだけ 1ms
     × AC20: 見出しが無い（本物のグループが無い）ときは畳む設定が残っていても全部見える 1ms
     × AC20: 畳んだ「グループなし」は見出しだけ（今いる workspace は残る）。本物のグループが無ければ見出しの行は無い 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed | 113 passed (117)

#### まとまり: top に無いグループを末尾へ足す（u の直前でなく） (workspaceGrouping.ts)
     × 配信の途中: top に無いグループは「グループなし」の直前、「グループなし」が top に無ければ末尾に出る（中身は layout.groups の順） 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### まとまり: top に無い u を足さない (workspaceGrouping.ts)
     × 配信の途中: top に無いグループは「グループなし」の直前、「グループなし」が top に無ければ末尾に出る（中身は layout.groups の順） 4ms
     × 配信の途中（レイアウトに無い workspace）でも一番上のまとまりを返す 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### どこにも無い workspace を「グループなし」の末尾へ足さない (workspaceGrouping.ts)
     × AC19: 同じフォルダ（worktreeKey）の 2 つ目は worktree グループに入らず、通常の行として「グループなし」の末尾に出る 7ms
     × 配信の途中: レイアウトに無い workspace は「グループなし」の末尾（同じリポジトリは 1 項目） 1ms
     × 配信の途中: 判定とレイアウトが食い違うときは今の判定で項目を決め、置き場所は先に見つかった参照 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 114 passed (117)

#### （1 回目は名前順のテストの入力がレイアウトの順と同じで落ちなかったため、テストの入力を直して再実行した。以下が再実行の出力）
#### 名前順: グループなしの中の項目を並べない (workspaceGrouping.ts)
     × 名前順: グループどうしはグループの名前、「グループなし」の中は項目の名前で並べる（「グループなし」はまとまりの中の位置のまま）。グループの中・worktree グループの中はレイアウトの順 7ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### 可視: 畳んだグループなしを無視する (workspaceGrouping.ts)
     × AC20: 「グループなし」を畳むと、中は今いる workspace の行だけ（worktree グループの子でもその子だけ） 7ms
     × AC20: 畳んだ「グループなし」は見出しだけ（今いる workspace は残る）。本物のグループが無ければ見出しの行は無い 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### 畳む設定: 見出しが無くても畳む (workspaceGrouping.ts)
     × AC20: 「グループなし」の見出しは、本物のグループが 1 つ以上あるときだけ。畳めるのも見出しがあるときだけ 8ms
     × AC20: 見出しが無い（本物のグループが無い）ときは畳む設定が残っていても全部見える 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### navigate: グループなしの見出しの行を足さない (workspaceGrouping.ts)
     × 見出しを中の行の前に差し込む（空のグループにも届く。「グループなし」の見出しも） 7ms
     × 畳んだグループも見出しは残り、中は今いる workspace だけ 1ms
     × AC20: 畳んだ「グループなし」は見出しだけ（今いる workspace は残る）。本物のグループが無ければ見出しの行は無い 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 114 passed (117)

#### topUnitOf: グループなしの中をグループ扱いする (workspaceGrouping.ts)
     × グループの中ならグループ、「グループなし」の中の 1 つの repo・管理外は workspace 単体（「グループなし」はグループ扱いしない） 7ms
     × 「グループなし」の中の worktree グループは repo 1ms
     × AC19: 代表でない workspace（同じフォルダの 2 つ目）は、worktree グループの一員ではなく workspace 単体 3ms
     × 配信の途中（レイアウトに無い workspace）でも一番上のまとまりを返す 1ms
     × sidebarTree と同じ決まり: 食い違い（w: で持つが今は repo）も今の判定 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
      Tests  5 failed | 112 passed (117)

#### hiddenWorktreeCount: 今いる子も数える (workspaceGrouping.ts)
     × AC21: 畳んだ worktree グループで隠れている子の数（今いる子は数えない） 6ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### layoutFromLegacy: u を末尾でなく先頭に置く (workspaceGrouping.ts)
     × 同じリポジトリが別々のグループ → 本体の所属に揃う（空のグループはその後ろ、u は末尾） 8ms
     × 単独の workspace（管理外）は自分の groupId で置く。1 つだけの repo も r: の項目。グループに入らないものは ungrouped 1ms
     × 位置: グループは先頭のメンバーの平らな順、空のグループはその後ろ、u は末尾。グループなしの項目は先頭の workspace の順 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 114 passed (117)

#### layoutFromLegacy: 空のグループを埋まったグループより前に置く (workspaceGrouping.ts)
     × 同じリポジトリが別々のグループ → 本体の所属に揃う（空のグループはその後ろ、u は末尾） 8ms
     × 単独の workspace（管理外）は自分の groupId で置く。1 つだけの repo も r: の項目。グループに入らないものは ungrouped 1ms
     × 位置: グループは先頭のメンバーの平らな順、空のグループはその後ろ、u は末尾。グループなしの項目は先頭の workspace の順 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 114 passed (117)

#### sidebarLayout: グループから外すと末尾でなくグループなしの先頭へ (sidebarLayout.ts)
     × 外すと「グループなし」の末尾へ置く。グループに居なければ何もしない 7ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### sidebarLayout: グループの削除で中身を捨てる (sidebarLayout.ts)
     × 中身を「グループなし」の末尾へ順に出し、グループのキーと top の参照を消す 9ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### sidebarLayout: 新しいグループを u の直後へ置く (sidebarLayout.ts)
     × top の u の直前へ足し、groups に空のキーを作る 6ms
     × u が先頭にあればその直前（グループの前）。u が top に無ければ末尾。すでにあれば同じ参照 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### sidebarLayout: moveItem がまとまりを top で動かさない (sidebarLayout.ts)
     × まとまり（グループ・グループなし）は top の中で動く 9ms
     × 位置が変わらない移動は受け付ける（moved: true・同じ参照） 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### sidebarLayout: moveItemBy がまとまりを動かさない (sidebarLayout.ts)
     × 1 つ動かす。端では巡回せず止まる 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### sidebarLayout: 項目をまとまりの外（top）へ入れられる (sidebarLayout.ts)
     × まとまり（g:・u）は入れない。存在しないグループへも入れない 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### flatten: 代表を同じ worktree の先頭に保たない (sidebarLayout.ts)
     × AC19: r: の展開は代表だけ。代表でない workspace は w: の位置に出る 6ms
     × AC19: 代表でない workspace を代表の前へ並べても、代表は同じ worktree の workspace の一番前に残る（代表が入れ替わり続けない） 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### flatten: グループなしを u の位置でなく先頭に展開する (sidebarLayout.ts)
     × 平らな順: top の順にまとまりの中身を並べる。r: は本体が先頭で展開、グループなしは u の位置 8ms
     × AC19: 代表でない workspace を代表の前へ並べても、代表は同じ worktree の workspace の一番前に残る（代表が入れ替わり続けない） 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)

#### repairLayout: u を足さない (sidebarLayout.ts)
     × 無い workspace は「グループなし」の末尾へ、無いグループは u の直前へ、u が無ければ末尾に足す 6ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 116 passed (117)

#### repairLayout: 無い workspace をグループなしへ足さない (sidebarLayout.ts)
     × 無い workspace は「グループなし」の末尾へ、無いグループは u の直前へ、u が無ければ末尾に足す 6ms
     × workspace の今の判定と合わない参照（w: なのに repoKey を持つ代表）は捨て、判定どおりの項目を足す 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 115 passed (117)
```
- T23 [nit] repairLayout の重複の先勝ちの順（groups のキー順→ungrouped）が描画（top 順）と違いうる → docstring に順を明記（壊れた保存の復元時のみ） [conv:-]


### T24 壊して落ちる確認

実装の該当行を 1 つずつ壊して、足した回帰テストが落ちることを確かめた（壊した行は確認の後に必ず元へ戻し、server 全体のテストが通ることを確認）。出力は vitest の生の出力（長い行は幅で切れている）。B5 は最初の壊し方が構文エラーだったので、条件を `false &&` にして壊し直した出力を載せている。

```
#### B1: worktreeKey を --git-dir の値でなく repoKey にする(GitInfoPoller.probe)
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller > gives a linked worktree the same repoKey as the main checkout, and isLinkedWorktree=true
AssertionError: expected false to be true // Object.is equality
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir が共通ディレクトリと違えば linked worktree
AssertionError: expected { kind: 'git', …(1) } to match object { kind: 'git', git: { …(3) } }
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 結合（実物の git） > 本体と linked worktree は同じ repoKey（絶対パス）で、isLinkedWorktree だけ違う
AssertionError: expected { kind: 'git', git: { …(6) } } to match object { kind: 'git', git: { …(2) } }
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 結合（実物の git） > worktreeKey は --git-dir の絶対パス: 同じフォルダ（とその下・symlink 経由）なら同じ値、linked worktree は <共通ディレクトリ>/worktrees/<名前>（追補 01 A）
AssertionError: expected '/tmp/soda-gitpoller-plain-6VfY60/real…' to match /\/real\/\.git\/worktrees\/[^/]+$/real\
---- 中身(最初の失敗の差分)
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/git/GitInfoPoller.test.ts:145:38
    143|     expect(wt.git?.repoKey).toBe(main.git?.repoKey); // 同じ共通ディレクトリ＝同じグ…
    144|     expect(main.git?.isLinkedWorktree).toBe(false);
    145|     expect(wt.git?.isLinkedWorktree).toBe(true);
       |                                      ^
    146|     await rm(worktreeDir, { recursive: true, force: true });
    147|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/13]⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir が共通ディレクトリと違えば linked worktree

#### B2: 代表の引き継ぎ(同じリポジトリの代表を引き継いだだけなら所属に従う)の行を無効にする
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > the successor keeps the repository item where it is, even if the successor itself was put in another group (the repository's place wins)
AssertionError: expected [ 'r:/k/.git' ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 166 passed (167)
---- 中身(最初の失敗の差分)
AssertionError: expected [ 'r:/k/.git' ] to deeply equal []
- Expected
+ Received
- []
+ [
+   "r:/k/.git",
+ ]
 ❯ src/session/SessionModel.test.ts:1792:46
    1790|       const g = model.createGroup("g", a2); // 代表でない a2 を自分でグループへ
    1791|       model.closeWorkspace(a);
    1792|       expect(model.getLayout().groups[g.id]).toEqual([]); // r:K は「グルー…
       |                                              ^
    1793|       expect(model.getLayout().ungrouped).toContain(`r:${K}`);
    1794|       expect(model.getRepoGroups().size).toBe(0);

#### B3: 閉じた workspace の参照を、代表が残っていても外す(reflectRefs の removed 分岐)
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > a workspace that disappears leaves the layout through every path > a repository item stays until its last workspace is gone; repoGroups is kept
AssertionError: expected [] to deeply equal [ 'r:/repo/.git' ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > the successor keeps the repository item where it is, even if the successor itself was put in another group (the repository's place wins)
AssertionError: expected [ 'r:/k/.git' ] to deeply equal []
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 215 passed (217)
---- 中身(最初の失敗の差分)
AssertionError: expected [] to deeply equal [ 'r:/repo/.git' ]
- Expected
+ Received
- [
-   "r:/repo/.git",
- ]
+ []
 ❯ src/session/SessionModel.test.ts:1356:50
    1354|       expect(model.getLayout().groups[group.id]).toEqual(["r:/repo/.gi…
    1355|       model.closeWorkspace(a);
    1356|       expect(model.getLayout().groups[group.id]).toEqual(["r:/repo/.gi…
       |                                                  ^
    1357|       model.closeWorkspace(b);
    1358|       expect(model.getLayout().groups[group.id]).toEqual([]);

#### B4: 新しいグループを「グループなし」の直前でなく top の末尾に作る
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > addToGroup on a workspace whose judgment arrived puts the repository item (r:) in the group, with no w:<id> left
AssertionError: expected { top: [ 'u', 'g:g1' ], …(2) } to deeply equal { top: [ 'g:g1', 'u' ], …(2) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > a workspace that disappears leaves the layout through every path > a workspace inside a group leaves the group's list too
AssertionError: expected [ 'u', 'g:g1' ] to deeply equal [ 'g:g1', 'u' ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > groups work on whole items > createGroup with no target puts an empty group right before the ungrouped unit
AssertionError: expected [ 'u', 'g:g1', 'g:g2' ] to deeply equal [ 'g:g1', 'g:g2', 'u' ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > groups work on whole items > createGroup with an item target moves the item into the new group; the group goes before the ungrouped unit
AssertionError: expected { top: [ 'u', 'g:g1' ], …(2) } to deeply equal { top: [ 'g:g1', 'u' ], …(2) }
---- 中身(最初の失敗の差分)
AssertionError: expected { top: [ 'u', 'g:g1' ], …(2) } to deeply equal { top: [ 'g:g1', 'u' ], …(2) }
- Expected
+ Received
@@ -3,10 +3,10 @@
      "g1": [
        "r:/a/.git",
      ],
    },
    "top": [
-     "g:g1",
      "u",
+     "g:g1",
    ],
    "ungrouped": [],

#### B5: 復元で r: の項目を repoGroups が覚えているグループへ入れる処理を外す
 FAIL  src/session/SessionService.test.ts > SessionService — layout の復元（保存と復元） > 壊れた参照（実在しない workspace・グループ・重複・repoKey を持つのに w:�
AssertionError: expected { top: [ 'g:g1', 'u' ], …(2) } to deeply equal { top: [ 'g:g1', 'u' ], …(2) }
 FAIL  src/session/SessionService.test.ts > SessionService — layout の復元（保存と復元） > 管理外・代表でない workspace（w:<id>）の所属はレイアウトの入れ物が正で
AssertionError: expected { top: [ 'g:g1', 'g:g2', 'u' ], …(2) } to deeply equal { top: [ 'g:g1', 'g:g2', 'u' ], …(2) }
 Test Files  1 failed (1)
      Tests  2 failed | 182 passed (184)
---- 中身(最初の失敗の差分)
AssertionError: expected { top: [ 'g:g1', 'u' ], …(2) } to deeply equal { top: [ 'g:g1', 'u' ], …(2) }
- Expected
+ Received
  {
    "groups": {
      "g1": [
        "w:w3",
-       "r:/repos/app/.git",
      ],
    },
    "top": [
      "g:g1",
      "u",
    ],
    "ungrouped": [
      "w:w2",
+     "r:/repos/app/.git",
    ],

#### B6: 復元で w:<id> の groupId をレイアウトの入れ物に合わせる処理を外す
 FAIL  src/session/SessionService.test.ts > SessionService — layout の復元（保存と復元） > 管理外・代表でない workspace（w:<id>）の所属はレイアウトの入れ物が正で、groupId を合わせる。r:<repoKey> は repoGroups が正で、食い違えば覚えているグループへ入る
AssertionError: expected [ Array(3) ] to deeply equal [ Array(3) ]
 Test Files  1 failed (1)
      Tests  1 failed | 183 passed (184)
---- 中身(最初の失敗の差分)
AssertionError: expected [ Array(3) ] to deeply equal [ Array(3) ]
- Expected
+ Received
  [
    [
      "w2",
-     "g1",
+     null,
    ],
    [
      "w1",
      "g2",
    ],
    [

#### B7: 古い move_to の (b): 落とし先の別のまとまり(グループ・グループなし)を探さない
 FAIL  src/session/SessionModel.test.ts > SessionModel — item moves > moveWorkspacesTo reads an old request as an item move > (b) all the effective members of a group move the group in `top`: before the first workspace of another unit (a group or the ungrouped unit), or to the end
AssertionError: expected false to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 166 passed (167)
---- 中身(最初の失敗の差分)
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/session/SessionModel.test.ts:2039:52
    2037|       expect(model.moveWorkspacesTo([c, b, a], null)).toBe(true); // 末…
    2038|       expect(model.getLayout().top).toEqual([`g:${h.id}`, "u", `g:${g.…
    2039|       expect(model.moveWorkspacesTo([a, b, c], d)).toBe(true); // 「グルー…
       |                                                    ^
    2040|       expect(model.getLayout().top).toEqual([`g:${h.id}`, `g:${g.id}`,…
    2041|       expect(model.moveWorkspacesTo([a, b, c], e)).toBe(true); // H の先…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)

#### B8: 旧形の layout を捨てずに保存全体を壊れた扱いにする(SessionFile)
 FAIL  src/persist/SessionFile.test.ts > FsSessionFile > layout が壊れた形・旧形（ungrouped が無い途中の形）なら layout だけ捨て、残りは読める
 FAIL  src/persist/SessionFile.test.ts > FsSessionFile > layout が壊れた形・旧形（top が配列でない）なら layout だけ捨て、残りは読める
 FAIL  src/persist/SessionFile.test.ts > FsSessionFile > layout が壊れた形・旧形（配列でも object でもない）なら layout だけ捨て、残りは読める
AssertionError: expected 'corrupt' to be 'ok' // Object.is equality
 Test Files  1 failed (1)
      Tests  3 failed | 8 passed (11)
---- 中身(最初の失敗の差分)
AssertionError: expected 'corrupt' to be 'ok' // Object.is equality
Expected: "ok"
Received: "corrupt"
 ❯ src/persist/SessionFile.test.ts:178:25
    176|     await writeFileAtomic(join(dir, "session.json"), JSON.stringify({ …
    177|     const result = await file.load();
    178|     expect(result.kind).toBe("ok");
       |                         ^
    179|     if (result.kind !== "ok") throw new Error("unreachable");
    180|     expect(result.data.layout).toBeUndefined();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
 Test Files  1 failed (1)
      Tests  3 failed | 8 passed (11)
   Start at  14:32:51

#### B9: worktreeKey を保存に書かない(toSessionFileData)
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ
AssertionError: expected { branch: null, ahead: +0, …(3) } to deeply equal { branch: null, ahead: +0, …(4) }
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > 同じフォルダの 2 つ目（通常の項目）は、復元の直後も最初の 1 周の後も代表にならない（worktreeKey を保存する）
AssertionError: expected [ undefined, undefined ] to deeply equal [ …(2) ]
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 59 passed (61)
---- 中身(最初の失敗の差分)
AssertionError: expected { branch: null, ahead: +0, …(3) } to deeply equal { branch: null, ahead: +0, …(4) }
- Expected
+ Received
@@ -2,7 +2,6 @@
    "ahead": 0,
    "behind": 0,
    "branch": null,
    "isLinkedWorktree": true,
    "repoKey": "/tmp/soda-persist-SKFnJ8/.git",
-   "worktreeKey": "/tmp/soda-persist-SKFnJ8/.git/worktrees/soda-persist-SKFnJ8-wt",
  }
 ❯ src/git/GitInfoPoller.test.ts:983:43
    981|     expect(after.snapshot().layout).toEqual(expectedLayout);
    982|     expect(after.snapshot().workspaces.map((x) => x.id)).toEqual(expec…

#### B10: worktreeKey を復元しない(restoreWorkspace)
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > グループ・worktree グループ・管理外が混ざった並びは、復元の直後も最初の 1 周の後も停止前と同じ
AssertionError: expected { branch: null, ahead: +0, …(3) } to deeply equal { branch: null, ahead: +0, …(4) }
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > 同じフォルダの 2 つ目（通常の項目）は、復元の直後も最初の 1 周の後も代表にならない（worktreeKey を保存する）
AssertionError: expected { top: [ 'u' ], groups: {}, …(1) } to deeply equal { top: [ 'u' ], groups: {}, …(1) }
 Test Files  1 failed (1)
      Tests  2 failed | 48 passed (50)
---- 中身(最初の失敗の差分)
AssertionError: expected { branch: null, ahead: +0, …(3) } to deeply equal { branch: null, ahead: +0, …(4) }
- Expected
+ Received
@@ -2,7 +2,6 @@
    "ahead": 0,
    "behind": 0,
    "branch": null,
    "isLinkedWorktree": true,
    "repoKey": "/tmp/soda-persist-HJyJwZ/.git",
-   "worktreeKey": "/tmp/soda-persist-HJyJwZ/.git/worktrees/soda-persist-HJyJwZ-wt",
  }
 ❯ src/git/GitInfoPoller.test.ts:983:43
    981|     expect(after.snapshot().layout).toEqual(expectedLayout);
    982|     expect(after.snapshot().workspaces.map((x) => x.id)).toEqual(expec…

#### B11: 所属の書き込みを代表かどうかでなく repoKey の有無で決める(setItemGroup)
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > a second workspace in the same folder moves on its own: it joins a group without the worktree group
AssertionError: expected 1 to be +0 // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > the successor keeps the repository item where it is, even if the successor itself was put in another group (the repository's place wins)
AssertionError: expected 1 to be +0 // Object.is equality
 FAIL  src/surface/methods/index.test.ts > registerAllMethods — client / workspace / tab / pane flow > 項目単位のグループ操作と一括クローズ > 同じフォルダの 2 つ目は通常の項目で、group.add_member は 2 つ目だけを動かし、一括クローズの対象にならない
AssertionError: expected [ 'g1', 'g1', null ] to deeply equal [ null, null, 'g1' ]
 Test Files  2 failed (2)
      Tests  3 failed | 199 passed (202)
---- 中身(最初の失敗の差分)
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
 ❯ src/session/SessionModel.test.ts:1726:42
    1724|       expect(model.getLayout().groups[g.id]).toEqual([`w:${a2}`]);
    1725|       expect(model.getLayout().ungrouped).toContain(`r:${K}`);
    1726|       expect(model.getRepoGroups().size).toBe(0);
       |                                          ^
    1727|       expect(model.getWorkspace(a2)?.groupId).toBe(g.id);
    1728|       expect(model.getWorkspace(a)?.groupId).toBeNull();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > the successor keeps the repository item where it is, even if the successor itself was put in another group (the repository's place wins)

#### B12: 実効の groupId を代表かどうかを見ずに repoGroups から決める(recomputeGroupIds)
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > a second workspace in the same folder moves on its own: it joins a group without the worktree group
AssertionError: expected null to be 'g1' // Object.is equality
 FAIL  src/surface/methods/index.test.ts > registerAllMethods — client / workspace / tab / pane flow > 項目単位のグループ操作と一括クローズ > 同じフォルダの 2 つ目は通常の項目で、group.add_member は 2 つ目だけを動かし、一括クローズの対象にならない
AssertionError: expected [ null, null, null ] to deeply equal [ null, null, 'g1' ]
 Test Files  2 failed (2)
      Tests  2 failed | 200 passed (202)
---- 中身(最初の失敗の差分)
AssertionError: expected null to be 'g1' // Object.is equality
- Expected:
"g1"
+ Received:
null
 ❯ src/session/SessionModel.test.ts:1727:47
    1725|       expect(model.getLayout().ungrouped).toContain(`r:${K}`);
    1726|       expect(model.getRepoGroups().size).toBe(0);
    1727|       expect(model.getWorkspace(a2)?.groupId).toBe(g.id);
       |                                               ^
    1728|       expect(model.getWorkspace(a)?.groupId).toBeNull();
    1729|       expect(model.getWorkspace(wt)?.groupId).toBeNull();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL  src/surface/methods/index.test.ts > registerAllMethods — client / workspace / tab / pane flow > 項目単位のグループ操作と一括クローズ > 同じフォルダの 2 つ目は通常の項目で、group.add_member は 2 つ目だけを動かし、一括クローズの対象にならない

#### B13: 判定の変化に worktreeKey を含めない(gitIdentityChanged)
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > a worktreeKey change alone (same repository, both linked) hands the representative over to the next workspace of the old folder
AssertionError: expected [ 'r:/k/.git', 'w:w3' ] to deeply equal [ 'r:/k/.git' ]
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > judgments (git / unmanaged / unknown) go through the one model entry > a worktreeKey-only change (same repoKey, same isLinkedWorktree) still goes through the layout exit: the next workspace of the old folder becomes the representative
AssertionError: expected [ 'workspace.updated' ] to deeply equal [ 'workspace.updated', …(1) ]
 Test Files  2 failed (2)
      Tests  2 failed | 349 passed (351)
---- 中身(最初の失敗の差分)
AssertionError: expected [ 'r:/k/.git', 'w:w3' ] to deeply equal [ 'r:/k/.git' ]
- Expected
+ Received
  [
    "r:/k/.git",
+   "w:w3",
  ]
 ❯ src/session/SessionModel.test.ts:1809:43
    1807|       expect(model.getLayout().ungrouped).toEqual([`r:${K}`, `w:${z.id…
    1808|       model.updateWorkspaceGit(y.id, judged(true, "/k/.git/worktrees/w…
    1809|       expect(model.getLayout().ungrouped).toEqual([`r:${K}`]); // z が代…
       |                                           ^
    1810|       expect(members(model)).toEqual([x.id, y.id, z.id]);
    1811|     });

#### B14: sameGit が worktreeKey の違いを無視する(SessionService)
 FAIL  src/session/SessionService.test.ts > SessionService — runtime updates > judgments (git / unmanaged / unknown) go through the one model entry > a worktreeKey-only change (same repoKey, same isLinkedWorktree) still goes through the layout exit: the next workspace of the old folder becomes the representative
AssertionError: expected [] to deeply equal [ 'workspace.updated', …(1) ]
 Test Files  1 failed (1)
      Tests  1 failed | 183 passed (184)
---- 中身(最初の失敗の差分)
AssertionError: expected [] to deeply equal [ 'workspace.updated', …(1) ]
- Expected
+ Received
- [
-   "workspace.updated",
-   "sidebar.layout_changed",
- ]
+ []
 ❯ src/session/SessionService.test.ts:1175:22
    1173|       persist.touchCount = 0;
    1174|       service.updateWorkspaceGit(y.id, wt("/repo/.git/worktrees/y2"));
    1175|       expect(events).toEqual(["workspace.updated", "sidebar.layout_cha…
       |                      ^
    1176|       expect(service.snapshot().layout?.ungrouped).toEqual(["r:/repo/.…

#### B15: 代表が管理外になったとき、項目の直後でなく直前へ w:<id> を置く(transition)
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 判定のレイアウトへの反映（実物の git） > 同じフォルダの workspace（代表） > pane の場所が別のフォルダへ移ると、代表が交代する: 移った workspace は元の項目を離れ、同じフォルダの次が代表になる
AssertionError: expected [ 'w:w1', …(1) ] to deeply equal [ …(2) ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > judgments are reflected in the layout > unmanaged (R1 -> none): w:<id> goes right after r:R1 in the same container, and groupId is that group
AssertionError: expected { top: [ 'g:g1', 'u' ], …(2) } to deeply equal { top: [ 'g:g1', 'u' ], …(2) }
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > the representative becoming unmanaged leaves the item to the next workspace and becomes a plain item right after it
AssertionError: expected [ 'w:w1', 'r:/k/.git', 'w:w4' ] to deeply equal [ 'r:/k/.git', 'w:w1', 'w:w4' ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > an earlier workspace judged later takes over as the representative; the later one becomes a plain item after the item
AssertionError: expected [ 'w:w2', 'r:/k/.git' ] to deeply equal [ 'r:/k/.git', 'w:w2' ]
---- 中身(最初の失敗の差分)
AssertionError: expected [ 'w:w1', …(1) ] to deeply equal [ …(2) ]
- Expected
+ Received
  [
-   "r:/tmp/soda-judge-fP3tFR/.git",
    "w:w1",
+   "r:/tmp/soda-judge-fP3tFR/.git",
  ]
 ❯ src/git/GitInfoPoller.test.ts:884:34
    882|       await poller.pollNow();
    883|       expect(service.getWorkspace(a.id)?.git).toBeNull();
    884|       expect(layout().ungrouped).toEqual([`r:${key}`, `w:${a.id}`]); /…
       |                                  ^
    885|       const snap = service.snapshot();
```
- T24 [nit] linkedWorktreeGroupMembers が追補 A の代表を見ない旧判定のまま残り、テストだけが参照する → T19（古い関数の撤去）で消す前提のため残す [conv:-]

### T25 壊して落ちる確認

実装の 1 行（または 1 つの条件）を壊して `vitest run`（web）を流した生の出力（`FAIL` 行と最初の `AssertionError`。各ケースとも壊した行は元に戻し、`git diff` で確認済み）。ケース名は壊した内容。

#### B1: 「グループなし」の見出しを本物のグループが無くても出す（if (row.heading) を外す）
 Test Files  1 failed (1)
      Tests  23 failed | 106 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > workspace の行に状態の印と名前を出す
AssertionError: expected '▾×グループなし1' to contain 'my-project'
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > クリックで workspace の active tab へ切り替え、workspace.focus を送る
AssertionError: expected null to be 'w1' // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > 右クリックで UiPort.openContextMenu を呼ぶ（workspace 対象）
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'workspace', …(1) }, …(1) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > navigate モードで選択中の workspace に選択スタイルを付ける
AssertionError: expected [ 'sidebar-row', 'sidebar-row-group' ] to include 'sidebar-row-selected'
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > 表示中の workspace の行に、モードに関係なく表示中のスタイルと aria-current を付ける
AssertionError: expected [ 'sidebar-row', 'sidebar-row-group' ] to include 'sidebar-row-current'
 FAIL  src/components/Sidebar.test.ts > Sidebar — spaces > 表示中かつ navigate で選択中の行には、2 つのクラスが同時に付く
AssertionError: expected [ 'sidebar-row', 'sidebar-row-group' ] to include 'sidebar-row-current'

#### B2: 「グループなし」の見出しの折りたたみが共有の設定を切り替えない
 Test Files  1 failed (1)
      Tests  2 failed | 127 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの折りたたみの印を押すと共有の設定 ungroupedCollapsed を切り替えて保存し、中は今いる workspace の行だけになる
AssertionError: expected false to be true // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの行をクリックしても畳む・広げる（押した印と同じ）
AssertionError: expected false to be true // Object.is equality

#### B3: 「グループなし」の見出しにフォルダの印を付ける
 Test Files  1 failed (1)
      Tests  3 failed | 126 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > グループの中の worktree グループは字下げ 1（先頭）・2（子）。「グループなし」の中は字下げ 1。種類の印は見出し（「グループなし」には付けない）と worktree グループの行（先頭・子）だけ（読み上げ用の文言つき）
AssertionError: expected [ 'グループ', null, 'worktree グループ', …(3) ] to deeply equal [ 'グループ', null, 'worktree グループ', …(3) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ）
AssertionError: expected [ [ 'img', 'グループ' ], …(3) ] to deeply equal [ [ 'img', 'グループ' ], …(2) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 本物のグループがあれば出す。中の項目は 1 段字下げ。フォルダの印は付けず、数と状態のまとめがある
AssertionError: expected true to be false // Object.is equality

#### B4: グループの見出しの状態のまとめを空にする（グループだけ。「グループなし」は残す）
 Test Files  1 failed (1)
      Tests  2 failed | 127 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > グループの見出し > 広げていても畳んでいても、中の状態をまとめたアイコンと、中の項目の数（worktree グループは 1 つ）を出す
AssertionError: expected 'none' to be 'working' // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > グループの見出し > エージェントが居ない中身なら状態のまとめは空（none）。優先度の低い状態だけなら、その状態
AssertionError: expected 'none' to be 'idle' // Object.is equality

#### B4b: 「グループなし」の見出しの状態のまとめを空にする
 Test Files  1 failed (1)
      Tests  2 failed | 127 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 本物のグループがあれば出す。中の項目は 1 段字下げ。フォルダの印は付けず、数と状態のまとめがある
AssertionError: expected 'none' to be 'working' // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの折りたたみの印を押すと共有の設定 ungroupedCollapsed を切り替えて保存し、中は今いる workspace の行だけになる
AssertionError: expected 'none' to be 'working' // Object.is equality

#### B5: 見出しの数を workspace の数で数える（worktree グループを 1 つと数えない）
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > グループの見出し > 広げていても畳んでいても、中の状態をまとめたアイコンと、中の項目の数（worktree グループは 1 つ）を出す
AssertionError: expected '3' to be '2' // Object.is equality

#### B5b: 「グループなし」の見出しの数を workspace の数で数える
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 本物のグループがあれば出す。中の項目は 1 段字下げ。フォルダの印は付けず、数と状態のまとめがある
AssertionError: expected '3' to be '2' // Object.is equality

#### B6: 畳んだ worktree グループの先頭の行の状態を、本体だけにする（まとめない）
 Test Files  1 failed (1)
      Tests  2 failed | 127 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 畳んでいるときの先頭の行は本体と worktree の全部をまとめた状態で、隠れている worktree の数を +n で添える
AssertionError: expected 'idle' to be 'working' // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 畳んでいて worktree を開いているときは、その行が見えているので +n に数えない（状態のまとめは全部のまま）
AssertionError: expected 'idle' to be 'working' // Object.is equality

#### B7: 畳んだ worktree グループの +n を、今いる子も数えて出す（hiddenWorktreeCount を使わず子の数）
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 畳んでいて worktree を開いているときは、その行が見えているので +n に数えない（状態のまとめは全部のまま）
AssertionError: expected true to be false // Object.is equality

#### B7b: +n を畳んでいなくても出す
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 広げているときの先頭の行は本体の状態。+n は出さない
AssertionError: expected 'working' to be 'idle' // Object.is equality

#### B8: 最後の子の縦線止めの印（treeLast）を付けない
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 先頭と子に木の線のクラスを付け、最後の子だけ縦線が止まる印を持つ。通常の行には付けない
AssertionError: expected [ 'sidebar-row', …(2) ] to include 'sidebar-row-tree-last'

#### B8b: 子の行に木の線のクラスを付けない
 Test Files  1 failed (1)
      Tests  2 failed | 127 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 先頭と子に木の線のクラスを付け、最後の子だけ縦線が止まる印を持つ。通常の行には付けない
AssertionError: expected [ 'sidebar-row', 'sidebar-row-indent' ] to include 'sidebar-row-tree'
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 同じフォルダの 2 つ目の workspace（代表でない）は通常の行。worktree の印・木の線・ブランチ名は付かない
AssertionError: expected [ 'sidebar-row', …(2) ] to include 'sidebar-row-tree'

#### B9: 子の行に worktree の印を付けない
 Test Files  1 failed (1)
      Tests  3 failed | 126 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > グループの中の worktree グループは字下げ 1（先頭）・2（子）。「グループなし」の中は字下げ 1。種類の印は見出し（「グループなし」には付けない）と worktree グループの行（先頭・子）だけ（読み上げ用の文言つき）
AssertionError: expected [ 'グループ', null, 'worktree グループ', …(3) ] to deeply equal [ 'グループ', null, 'worktree グループ', …(3) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行） > 畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ）
AssertionError: expected [ [ 'img', 'グループ' ], …(1) ] to deeply equal [ [ 'img', 'グループ' ], …(2) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 先頭の行にも子の行にも worktree の印を出し、通常の行には出さない
AssertionError: expected [ true, false, false ] to deeply equal [ true, true, false ]

#### B10: ブランチ名を出さない
 Test Files  1 failed (1)
      Tests  3 failed | 126 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > ブランチ名を worktree グループの行（先頭・子）の 1 行目の右に出す。通常の行には出さない
AssertionError: expected [ null, null, null ] to deeply equal [ 'main', 'feature/x', null ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 行の並びの設定に git の項目が無くても出す（1 行目に branch・git があれば重ねない）
Error: Cannot call text on an empty DOMWrapper.
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 1 行目に git の項目が無く 2 行目にあるだけなら、1 行目の右にブランチ名を出す（既定の並び）
AssertionError: expected false to be true // Object.is equality

#### B10b: 通常の行にもブランチ名を出す
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 同じフォルダの 2 つ目の workspace（代表でない）は通常の行。worktree の印・木の線・ブランチ名は付かない
AssertionError: expected true to be false // Object.is equality

#### B11: 1 行目に git の項目があってもブランチ名を重ねる
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 行の並びの設定に git の項目が無くても出す（1 行目に branch・git があれば重ねない）
AssertionError: expected true to be false // Object.is equality

#### B11b: 設定に git の項目が無いときはブランチ名を出さない（常に「ある」扱い）
 Test Files  1 failed (1)
      Tests  3 failed | 126 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > ブランチ名を worktree グループの行（先頭・子）の 1 行目の右に出す。通常の行には出さない
AssertionError: expected [ null, null, null ] to deeply equal [ 'main', 'feature/x', null ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 行の並びの設定に git の項目が無くても出す（1 行目に branch・git があれば重ねない）
Error: Cannot call text on an empty DOMWrapper.
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 1 行目に git の項目が無く 2 行目にあるだけなら、1 行目の右にブランチ名を出す（既定の並び）
AssertionError: expected false to be true // Object.is equality

#### B12: 「グループなし」の見出しの右クリックでグループのメニューを開く（groupTargetId を持たせる）
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの右クリックでは何のメニューも開かない（名前の変更・削除はできない）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

#### B13: 見出しの行のクリックで畳まない（クリックの分岐を空に）
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの行をクリックしても畳む・広げる（押した印と同じ）
AssertionError: expected false to be true // Object.is equality

#### B14: 「グループなし」の中の項目の入れ物を一番上（null）にする
 Test Files  1 failed (1)
      Tests  2 failed | 127 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループを、「グループなし」の中の行の上へ落とすことはできない（グループは見出しの間でだけ動く）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 掴んだ「グループなし」の中の行の上で離しても何も送らず、知らせない（自分の項目の上）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

#### B15: 名前順で「グループなし」の中の項目の並べ替えを受け付ける
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 名前順（design「並びと名前順」） > 「グループなし」の中の項目の並べ替えも受け付けない（名前で決まるので、送っても変わらない）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

#### B16: 掴んだ「グループなし」の見出しが自分の項目の上でも落とせる扱いにする
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 掴んだ「グループなし」の中の行の上で離しても何も送らず、知らせない（自分の項目の上）
AssertionError: expected [ { id: 5, …(1) } ] to have a length of +0 but got 1

#### B17: 古いサーバで「グループなし」の見出しを掴めるようにする
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 古いサーバ（layout が無い）では「グループなし」の見出しは掴めない（workspace.move_to では動かせない）
AssertionError: expected { sourceIds: [ 'w3' ], …(2) } to be null

#### B18: 畳んだ「グループなし」の中を畳まず描く（ungroupedCollapsed を木へ渡さない）
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの折りたたみの印を押すと共有の設定 ungroupedCollapsed を切り替えて保存し、中は今いる workspace の行だけになる
AssertionError: expected [ 'backend', 'グループなし', 'main', …(2) ] to deeply equal [ 'backend', 'グループなし', 'plain' ]

#### B19: ungroupedCollapsed を保存しない
 Test Files  2 failed (2)
      Tests  2 failed | 176 passed (178)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの折りたたみの印を押すと共有の設定 ungroupedCollapsed を切り替えて保存し、中は今いる workspace の行だけになる
AssertionError: expected undefined to be true // Object.is equality
 FAIL  src/store/view.test.ts > useViewStore — 「グループなし」の折りたたみ（共有の設定 ungroupedCollapsed） > 既定は広げている。切り替えるたびに soda.prefs.v1 へ書く
AssertionError: expected undefined to be true // Object.is equality

#### B20: 共有の設定から ungroupedCollapsed を当てない
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
 FAIL  src/store/prefsApply.test.ts > applyPrefsToStores > 保存の項目名をストアの値へ（読み込みと同じ load* で）当てる
AssertionError: expected false to be true // Object.is equality

#### C1: 代表でない workspace も代表として扱う（client-core の `isRepresentative` が常に true。dist をビルドし直して web を実行。確認後に元へ戻して再ビルド）
 Test Files  1 failed (1)
      Tests  1 failed | 128 passed (129)
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 同じフォルダの 2 つ目の workspace（代表でない）は通常の行。worktree の印・木の線・ブランチ名は付かない
AssertionError: expected true to be false // Object.is equality

#### 独立点検の指摘への追加（H1〜H8。各ケースとも壊した行は元に戻し、`git diff` で差分が増えていないことを確認済み）

指摘 1（空でも見出しを出す）は H1、指摘 2（畳んだサイドバー）は H2〜H7、指摘 3（treeLast を見えている子の最後で決める）は H8。

##### H1: 「グループなし」が空なら見出しを隠す（if (row.heading && row.items.length > 0)）

 FAIL  src/components/Sidebar.test.ts > Sidebar — グループの表示 > 手動グループ：ヘッダー行（グループ名）＋インデントしたメンバー行
AssertionError: expected [ 'backend', 'api', 'worker' ] to deeply equal [ Array(4) ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — グループの表示 > 手動グループが折りたたまれていればメンバー行を隠す
AssertionError: expected [ 'backend' ] to deeply equal [ 'backend', 'グループなし' ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — グループの表示 > 折りたたみ中でも focus 中の workspace があればその行だけは見える（AC6）
AssertionError: expected [ 'backend', 'worker' ] to deeply equal [ 'backend', 'worker', 'グループなし' ]
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 全部の項目がグループの中で「グループなし」が空�
AssertionError: expected [ 'backend', 'main', 'wt', 'plain' ] to deeply equal [ 'backend', 'main', 'wt', …(2) ]
 Test Files  1 failed (1)
      Tests  4 failed | 128 passed (132)
##### H2: 畳んだサイドバーで見出しの状態アイコンを出さない

 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 畳んだサイドバー（view.sidebarCollapsed）の見出し > 見出しの状態アイコンは出るが�
AssertionError: expected false to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 131 passed (132)
##### H3: 畳んだサイドバーでも見出しの数を出す

 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 畳んだサイドバー（view.sidebarCollapsed）の見出し > 見出しの状態アイコンは出るが�
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 131 passed (132)
##### H4: 畳んだサイドバーでも見出しの横線を出す

 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 畳んだサイドバー（view.sidebarCollapsed）の見出し > 見出しの状態アイコンは出るが�
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 131 passed (132)
##### H5: 畳んだサイドバーでも +n を出す

 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 畳んだサイドバー（view.sidebarCollapsed）の見出し > 見出しの状態アイコンは出るが�
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 131 passed (132)
##### H6: 畳んだサイドバーでもブランチ名を出す

 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 畳んだサイドバー（view.sidebarCollapsed）の見出し > 見出しの状態アイコンは出るが�
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 131 passed (132)
##### H7: 畳んだサイドバーでも名前を出す

 FAIL  src/components/Sidebar.test.ts > Sidebar — 折りたたみ > view.sidebarCollapsed のときラベル類を出さない
AssertionError: expected true to be false // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — 行の並びの設定と独自トークン（20260927-sidebar-row-tokens の AC9・AC12・AC13） > 畳んだサイドバーは並びの設定に関わらず今までどおり（状態の印だけ）
AssertionError: expected '◐w1' to be '◐' // Object.is equality
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 畳んだサイドバー（view.sidebarCollapsed）の見出し > 見出しの状態アイコンは出るが�
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  3 failed | 129 passed (132)
##### H8: treeLast を全子の最後で決める（元の実装）

 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > worktree グループ > 畳んでいて今いる子が最後でないときは、見えている子（今い�
AssertionError: expected [ 'sidebar-row', …(3) ] to include 'sidebar-row-tree-last'
 Test Files  1 failed (1)
      Tests  1 failed | 131 passed (132)
- 指摘 3 の直し: `treeLast` を `children`（見えている子）の最後で決める。畳んだとき今いる子が最後でなくても縦線が行の下端まで伸びない。
- T25 [should] 空の「グループなし」の見出し（D32）を固定するテストが無い → 全項目がグループ内の場面のテストと壊して落ちる確認を足した [conv:regression-negative-control]
- T25 [nit] 畳んだサイドバーでの新しい描画のテストが無い → テストと壊して落ちる確認（H2〜H7）を足した [conv:regression-negative-control]
- T25 [nit] treeLast が畳んだときに全子の最後で決まる → 見えている子の最後で判定するよう直した [conv:-]

### T26 壊して落ちる確認

実装の該当行を 1 つずつ壊して対応するテストファイルを走らせた生の出力（抜粋: 落ちたテスト名と最初の AssertionError）。各回とも確認後に元へ戻した（`git diff` で意図した差分のみ。戻した後の web 全体 2219 件 pass）。

### B1 メニューの項目（「グループなし」見出しを古いサーバ扱い）
      Tests  2 failed | 35 passed (37)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — 「グループなし」の見出し（追補 01 B） > layout を持つサーバでは「上へ移動」「下へ移動」だけ（名前の変更・グループを削除は出ない）。それぞれの入口を呼ぶ
AssertionError: expected [] to deeply equal [ '上へ移動', '下へ移動' ]
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — 「グループなし」の見出し（追補 01 B） > layout の無い古いサーバでは項目を出さない
AssertionError: expected [ DOMWrapper{ …(3) }, …(1) ] to deeply equal []

### B2 メニューの「下へ移動」の向き
      Tests  1 failed | 36 passed (37)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/ContextMenu.test.ts > ContextMenu — 「グループなし」の見出し（追補 01 B） > layout を持つサーバでは「上へ移動」「下へ移動」だけ（名前の変更・グループを削除は出ない）。それぞれの入口を呼ぶ
AssertionError: expected "vi.fn()" to be called with arguments: [ 'next' ]

### B3 見出しの右クリックがメニューを開かない
      Tests  1 failed | 135 passed (136)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しの右クリックは「グループなし」のメニュー（上へ／下へ移動だけ。名前の変更・削除は ContextMenu に出ない）を開く
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'ungrouped' }, …(1) ]

### B4 古いサーバでもメニューを開く
      Tests  1 failed | 135 passed (136)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > layout の無い古いサーバでは、見出しの右クリックはメニューを開かない（出す項目が無い）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

### B5 navigate のメニューが「グループなし」を開かない
      Tests  1 failed | 135 passed (136)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > navigate の「メニューを開く」は、選んでいる「グループなし」の見出しの位置で「グループなし」のメニューを開く
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'ungrouped' }, …(1) ]

### B6 見出しが無いのに残った選択の扱い（Sidebar）
      Tests  1 failed | 135 passed (136)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ） > 「グループなし」の見出し > 見出しが出ていない（グループが無い）のに「グループなし」が選択に残っていたら、メニューは開かず選択を外す
AssertionError: expected 'ungrouped:' to be null

### B7 navigate の選択から「グループなし」を外す
      Tests  3 failed | 210 passed (213)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > up/down はグループの見出しと「グループなし」の見出しも順に選ぶ（空のグループにも届く）。キーは workspace の id と混ざらない
AssertionError: expected [ 'M', 'W1', 'A', 'group:g2', …(3) ] to deeply equal [ 'M', 'W1', 'A', 'group:g2', …(3) ]
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > 「グループなし」の見出しを畳むと、中の項目は up/down で選べなくなる（見出し自体には届く）
AssertionError: expected 'B' to be 'ungrouped:' // Object.is equality
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: 「グループなし」は共有の設定を切り替えるだけで、サーバへは何も送らない（広げ直せる）
AssertionError: expected false to be true // Object.is equality

### B8 toggleCollapse が共有の設定を切り替えない
      Tests  2 failed | 211 passed (213)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > 「グループなし」の見出しを畳むと、中の項目は up/down で選べなくなる（見出し自体には届く）
AssertionError: expected false to be true // Object.is equality
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: 「グループなし」は共有の設定を切り替えるだけで、サーバへは何も送らない（広げ直せる）
AssertionError: expected false to be true // Object.is equality

### B9 toggleCollapse の見出し無しガード
      Tests  1 failed | 212 passed (213)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > toggleCollapse: 見出しが出ていない（グループが無くなった）のに「グループなし」が選択に残っていたら、畳まずに選択を外す
AssertionError: expected true to be false // Object.is equality

### B10 activate が「グループなし」の選択で workspace.focus を送る
      Tests  1 failed | 212 passed (213)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > activate: 「グループなし」を選んでいるときは選択をやめるだけで workspace.focus を送らない
AssertionError: expected [ [ 'workspace.focus', …(1) ] ] to deeply equal []

### B11 moveUngroupedBy が item.move_by の向きを逆に送る
      Tests  1 failed | 212 passed (213)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveUngroupedBy: 「グループなし」の項目で item.move_by を送る
AssertionError: expected [ [ 'item.move_by', { …(2) } ] ] to deeply equal [ [ 'item.move_by', { …(2) } ] ]

### B12 moveUngroupedBy が名前順でも送る
      Tests  1 failed | 212 passed (213)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/actions/ActionDispatcher.test.ts > ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15） > moveUngroupedBy: 名前順のときは送らず「名前順では並べ替えできません」と知らせる
AssertionError: expected [ [ 'item.move_by', { …(2) } ] ] to deeply equal []

- T26 [nit] Sidebar.vue が "ungrouped:" を直書きしていた → navigateKeyOfUngrouped() を使うよう直した [conv:-]
- T26 [nit] 古いサーバで「グループなし」を選んで開くと無反応になる点が D33 に無い → D33 に補足 [conv:-]

### T27（T16 の部分）壊して落ちる確認

`packages/tui/src/render/chrome/sidebar.test.ts`（実装の 1 行ずつを壊し、落ちたテストの生の出力。確認後は戻して `diff` で一致を確かめた）。

```
===  見出しの状態のまとめを壊す（見出しは null）
     × グループの見出しは「▾ ◐ 名前 ──── 数」、中は 2 桁の字下げ。worktree グループは木の線と ⎇ とブランチ名（行の右） 15ms
     × 見出しの状態は広げていても畳んでいても中の全部のまとめ。「グループなし」も同じ決まり 3ms
      Tests  2 failed | 10 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
===  畳んだ先頭の行を本体の状態だけにする
     × 畳んだ worktree グループの先頭の行は、本体と worktree 全部の状態のまとめと、隠れている数 +n。広げていれば本体の状態 7ms
      Tests  1 failed | 11 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
===  +n を出さない
     × 畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ 7ms
     × 畳んだ worktree グループの先頭の行は、本体と worktree 全部の状態のまとめと、隠れている数 +n。広げていれば本体の状態 2ms
     × workspace の切り替え・番号・navigate の順（見えている行の順）は描画と同じ木から出る。「グループなし」を畳むと今いる行だけ 2ms
      Tests  3 failed | 9 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
===  「グループなし」の見出しを常に出す
     × グループなしの見出しはグループが 1 つ以上あるときだけ（フォルダの印は付けない）。無ければ項目が字下げなしで並ぶ 8ms
     × 畳んだ worktree グループの先頭の行は、本体と worktree 全部の状態のまとめと、隠れている数 +n。広げていれば本体の状態 1ms
     × ブランチ名は、行の並びの 1 行目に git の項目があれば重ねない。通常の行（worktree でない行）には出さない 2ms
      Tests  3 failed | 9 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
===  ブランチ名を常に出さない
     × グループの見出しは「▾ ◐ 名前 ──── 数」、中は 2 桁の字下げ。worktree グループは木の線と ⎇ とブランチ名（行の右） 12ms
     × グループなしの見出しはグループが 1 つ以上あるときだけ（フォルダの印は付けない）。無ければ項目が字下げなしで並ぶ 2ms
     × 畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ 1ms
     × 畳んだ worktree グループの先頭の行は、本体と worktree 全部の状態のまとめと、隠れている数 +n。広げていれば本体の状態 1ms
     × workspace の切り替え・番号・navigate の順（見えている行の順）は描画と同じ木から出る。「グループなし」を畳むと今いる行だけ 3ms
      Tests  5 failed | 7 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
===  行の並びに git があっても重ねる
     × ブランチ名は、行の並びの 1 行目に git の項目があれば重ねない。通常の行（worktree でない行）には出さない 6ms
      Tests  1 failed | 11 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
===  ⎇ を状態の記号の前に置く
     × グループの見出しは「▾ ◐ 名前 ──── 数」、中は 2 桁の字下げ。worktree グループは木の線と ⎇ とブランチ名（行の右） 11ms
     × 畳んだ worktree グループの先頭の行は、本体と worktree 全部の状態のまとめと、隠れている数 +n。広げていれば本体の状態 2ms
      Tests  2 failed | 10 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
===  先頭の行の toggleX をずらす
     × 当たり判定: 先頭の行（autoGroup）・グループ・「グループなし」の見出しは左の ▸/▾ の桁 toggleX を持つ 9ms
      Tests  1 failed | 11 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
===  グループの当たりに toggleX を付けない（0）
     × 当たり判定: 先頭の行（autoGroup）・グループ・「グループなし」の見出しは左の ▸/▾ の桁 toggleX を持つ 8ms
      Tests  1 failed | 11 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
===  木の線を最後の子でも ├ にする
     × グループの見出しは「▾ ◐ 名前 ──── 数」、中は 2 桁の字下げ。worktree グループは木の線と ⎇ とブランチ名（行の右） 14ms
     × グループなしの見出しはグループが 1 つ以上あるときだけ（フォルダの印は付けない）。無ければ項目が字下げなしで並ぶ 3ms
     × 畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ 2ms
     × ブランチ名は、行の並びの 1 行目に git の項目があれば重ねない。通常の行（worktree でない行）には出さない 3ms
     × layout の無い古いサーバは layoutFromLegacy で本体の所属に描く（子が別のグループでも 1 つの項目） 2ms
      Tests  5 failed | 7 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
===  「グループなし」の畳みを木へ渡さない
     × workspace の切り替え・番号・navigate の順（見えている行の順）は描画と同じ木から出る。「グループなし」を畳むと今いる行だけ 8ms
      Tests  1 failed | 11 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
===  グループの中の字下げをなくす
     × グループの見出しは「▾ ◐ 名前 ──── 数」、中は 2 桁の字下げ。worktree グループは木の線と ⎇ とブランチ名（行の右） 19ms
     × グループなしの見出しはグループが 1 つ以上あるときだけ（フォルダの印は付けない）。無ければ項目が字下げなしで並ぶ 5ms
     × 当たり判定: 先頭の行（autoGroup）・グループ・「グループなし」の見出しは左の ▸/▾ の桁 toggleX を持つ 6ms
      Tests  3 failed | 9 passed (12)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
```

「グループなし」の見出しのクリック（`input/mouse.test.ts`。`mouse.ts` の `hit.kind === "ungrouped"` の分岐を `void 0` に）:

```
     × 「グループなし」の見出しのクリックは折りたたみ（共有の設定 ungroupedCollapsed。追補 01） 63ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [] to deeply equal [ { patch: { …(1) } } ]
      Tests  1 failed | 21 passed (22)
```

`toggleUngroupedCollapsed`（`actions/TuiDispatcher.test.ts`。反転を外した）:

```
     × 共有の設定 ungroupedCollapsed を反転して保存する（追補 01） 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected false to be true // Object.is equality
      Tests  1 failed | 104 passed (105)
```
- T16 [nit] 畳んだまとまりで今いる子だけを描くとき、木の線が全子の中の位置で決まり web と食い違う → 見えている子の最後で決めるよう直した（D34 補足） [conv:-]
- T16 [nit] 別のマシンの行はローカルの行と桁が揃わない → 変えない範囲として D34 に許容と明記 [conv:-]


### T27（T17 の部分）壊して落ちる確認

実装の該当行を 1 つずつ一時的に壊して、足したテストが落ちることを確かめた（確認後は元に戻し、全体で 500 件通過）。各ブロックは `vitest run` の出力のうち失敗の行（`×`・`FAIL`・`AssertionError`・件数）を抜いた生の出力。

壊し: 木の線の最後: 見えている子の最後 → 子全体の最後（途中の子が今いるとき ├ になる）

```
     × 畳んだまとまりで今いる子が途中の子のとき、木の線の最後は「見えている子の最後」で決まる（└。├ にしない） 6ms
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
 FAIL  src/render/chrome/sidebar.test.ts > サイドバー：木の線の最後と navigate の見出しの選択（T17） > 畳んだまとまりで今いる子が途中の子のとき、木の線の最後は「見えている子の最後」で決まる（└。├ にしない）
AssertionError: expected [ '▸ G ─ 2', '├ ⎇ wt-a feat-a', …(1) ] to deeply equal [ '▸ G ─ 2', '└ ⎇ wt-a feat-a', …(1) ]
- Expected
+ Received
```

壊し: 見出しの navigate 強調を外す

```
     × navigate でグループの見出し・「グループなし」の見出しを選ぶと、その行だけアクセントの色になる 5ms
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
 FAIL  src/render/chrome/sidebar.test.ts > サイドバー：木の線の最後と navigate の見出しの選択（T17） > navigate でグループの見出し・「グループなし」の見出しを選ぶと、その行だけアクセントの色になる
AssertionError: expected 36186678 not to be 36186678 // Object.is equality
```

壊し: reveal: グループの見出しに合わせない

```
     × 区画の外へ出ているグループ・「グループなし」の見出しを選ぶと、そこまで動かす（reveal） 6ms
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
 FAIL  src/render/chrome/sidebar.test.ts > サイドバー：木の線の最後と navigate の見出しの選択（T17） > 区画の外へ出ているグループ・「グループなし」の見出しを選ぶと、そこまで動かす（reveal）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
```

壊し: navigate の up/down が見出しを選ばない

```
     × navigate の up/down は、グループの見出しと「グループなし」の見出しも順に選ぶ（空のグループにも届く） 8ms
     × 畳んだグループの見出しにも届く（中は今いる workspace だけ） 2ms
     × toggleCollapse: 「グループなし」は共有の設定 ungroupedCollapsed を切り替える。畳むと中の行は up/down で飛ばされ、見出しには届く 1ms
 Test Files  1 failed (1)
      Tests  3 failed | 119 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > navigate の up/down は、グループの見出しと「グループなし」の見出しも順に選ぶ（空のグループにも届く）
AssertionError: expected [ 'M', 'W1', 'A', 'B', 'M', 'W1', 'A' ] to deeply equal [ 'M', 'W1', 'A', 'group:g2', …(3) ]
- Expected
+ Received
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > 畳んだグループの見出しにも届く（中は今いる workspace だけ）
AssertionError: expected 'B' to be 'group:g2' // Object.is equality
Expected: "group:g2"
```

壊し: activate: 見出しでも workspace.focus を送る

```
     × activate（Enter）: 見出しを選んでいるときは選択をやめるだけで workspace.focus を送らない 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > activate（Enter）: 見出しを選んでいるときは選択をやめるだけで workspace.focus を送らない
AssertionError: expected [ [ 'workspace.focus', …(1) ], …(1) ] to deeply equal []
- Expected
+ Received
```

壊し: toggleCollapse: グループの見出しがサーバへ送らない

```
     × toggleCollapse: グループの見出しは group.toggle_collapsed（サーバ） 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > toggleCollapse: グループの見出しは group.toggle_collapsed（サーバ）
AssertionError: expected [ Array(1) ] to deeply equal [ [ 'group.toggle_collapsed', …(1) ] ]
- Expected
+ Received
```

壊し: toggleCollapse: 「グループなし」の畳みが働かない

```
     × toggleCollapse: 「グループなし」は共有の設定 ungroupedCollapsed を切り替える。畳むと中の行は up/down で飛ばされ、見出しには届く 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > toggleCollapse: 「グループなし」は共有の設定 ungroupedCollapsed を切り替える。畳むと中の行は up/down で飛ばされ、見出しには届く
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
```

壊し: toggleCollapse: 消えた「グループなし」の選択を外さない

```
     × toggleCollapse: 見出しが消えているのに選択が残っていたら、何も送らず選択を外す（グループ・「グループなし」とも） 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > toggleCollapse: 見出しが消えているのに選択が残っていたら、何も送らず選択を外す（グループ・「グループなし」とも）
AssertionError: expected 'ungrouped:' to be null
- Expected:
+ Received:
```

壊し: toggleCollapse: 消えたグループの選択を外さない

```
     × toggleCollapse: 見出しが消えているのに選択が残っていたら、何も送らず選択を外す（グループ・「グループなし」とも） 8ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > toggleCollapse: 見出しが消えているのに選択が残っていたら、何も送らず選択を外す（グループ・「グループなし」とも）
AssertionError: expected 'group:g2' to be null
- Expected:
+ Received:
```

壊し: toggleCollapse: worktree グループの畳み（共有の設定）が働かない

```
     × toggleCollapse: worktree グループの先頭でも子でも、その worktree グループを共有の設定で畳む・広げる（サーバへは送らない） 6ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > toggleCollapse: worktree グループの先頭でも子でも、その worktree グループを共有の設定で畳む・広げる（サーバへは送らない）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
```

壊し: moveWorkspace: 名前順の拒否が無い

```
     × moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ 8ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ
AssertionError: expected [ [ 'item.move_by', …(1) ] ] to deeply equal []
- Expected
+ Received
```

壊し: moveWorkspace: グループの中でも名前順で拒否する

```
     × moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ 10ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ
AssertionError: expected [] to deeply equal [ { item: { …(2) }, …(1) } ]
- Expected
+ Received
```

壊し: moveWorkspace: 項目の item.move_by にしない（常に workspace.move）

```
     × moveWorkspace: layout を持つサーバには項目の item.move_by（対象は今いる workspace）。layout の無いサーバは workspace.move 11ms
     × moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ 2ms
 Test Files  1 failed (1)
      Tests  2 failed | 120 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > moveWorkspace: layout を持つサーバには項目の item.move_by（対象は今いる workspace）。layout の無いサーバは workspace.move
AssertionError: expected [ [ 'workspace.move', …(1) ] ] to deeply equal [ [ 'item.move_by', …(1) ] ]
- Expected
+ Received
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ
AssertionError: expected [] to deeply equal [ { item: { …(2) }, …(1) } ]
- Expected
+ Received
```

壊し: moveGroupBy/moveUngroupedBy: 名前順の拒否が無い

```
     × moveGroupBy・moveUngroupedBy: item.move_by を送る。名前順は送らず知らせる 8ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > moveGroupBy・moveUngroupedBy: item.move_by を送る。名前順は送らず知らせる
AssertionError: expected [ [ 'item.move_by', …(1) ], …(2) ] to have a length of 2 but got 3
- Expected
+ Received
```

壊し: moveUngroupedBy: 名前順の拒否が無い

```
     × moveGroupBy・moveUngroupedBy: item.move_by を送る。名前順は送らず知らせる 15ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > moveGroupBy・moveUngroupedBy: item.move_by を送る。名前順は送らず知らせる
AssertionError: expected [ [ 'item.move_by', …(1) ], …(2) ] to have a length of 2 but got 3
- Expected
+ Received
```

壊し: group.create: workspaceId を添えない

```
     × group.create: layout を持つサーバは workspaceId を添えて 1 回。古いサーバは 2 段で、項目の workspace 全部に add_member 13ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > group.create: layout を持つサーバは workspaceId を添えて 1 回。古いサーバは 2 段で、項目の workspace 全部に add_member
AssertionError: expected [ [ 'group.create', { label: '新' } ] ] to deeply equal [ [ 'group.create', …(1) ] ]
- Expected
+ Received
```

壊し: 古いサーバの追加: 項目の workspace 全部に送らず 1 件だけ

```
     × group.create: layout を持つサーバは workspaceId を添えて 1 回。古いサーバは 2 段で、項目の workspace 全部に add_member 17ms
     × group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める 13ms
 Test Files  1 failed (1)
      Tests  2 failed | 120 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > group.create: layout を持つサーバは workspaceId を添えて 1 回。古いサーバは 2 段で、項目の workspace 全部に add_member
AssertionError: expected [ …(2) ] to deeply equal [ …(3) ]
- Expected
+ Received
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める
AssertionError: expected [ [ 'group.add_member', …(1) ], …(2) ] to deeply equal [ [ 'group.add_member', …(1) ], …(3) ]
- Expected
+ Received
```

壊し: 古いサーバの外す: 項目の workspace 全部に送らず 1 件だけ

```
     × group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める 23ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める
AssertionError: expected [ [ 'group.add_member', …(1) ], …(2) ] to deeply equal [ [ 'group.add_member', …(1) ], …(3) ]
- Expected
+ Received
```

壊し: 選択肢: 今のグループを除かない

```
     × 「別のグループへ移す…」の一覧は題が「別のグループへ移す」で、今のグループを除く。「グループへ追加」の題は変えない 9ms
     × openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き 7ms
 Test Files  2 failed (2)
      Tests  2 failed | 149 passed (151)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き
AssertionError: expected [ 'g2', 'g1' ] to deeply equal [ 'g2' ]
- Expected
+ Received
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 「別のグループへ移す…」の一覧は題が「別のグループへ移す」で、今のグループを除く。「グループへ追加」の題は変えない
AssertionError: expected '                                     …' not to contain 'G1'
- Expected
+ Received
```

壊し: 選択肢: レイアウトの順にしない（グループの配列の順）

```
     × openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き 8ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き
AssertionError: expected [ 'g1', 'g2' ] to deeply equal [ 'g2', 'g1' ]
- Expected
+ Received
```

壊し: 選択肢: moving を付けない

```
     × 「別のグループへ移す…」の一覧は題が「別のグループへ移す」で、今のグループを除く。「グループへ追加」の題は変えない 8ms
     × openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き 9ms
 Test Files  2 failed (2)
      Tests  2 failed | 149 passed (151)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き
AssertionError: expected { kind: 'addToGroup', …(2) } to match object { moving: true }
- Expected
+ Received
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 「別のグループへ移す…」の一覧は題が「別のグループへ移す」で、今のグループを除く。「グループへ追加」の題は変えない
AssertionError: expected '                                     …' to contain '別のグループへ移す'
- Expected
+ Received
```

壊し: メニュー: 所属を workspace.groupId で見る（子の行で外れる）

```
     × 所属なし:「グループへ追加…」「新しいグループを作る…」。所属あり:「別のグループへ移す…」「グループから外す」「新しいグループを作る…」。子の行でも項目全体の所属で出る 8ms
     × 所属ありで移し先が無い（今のグループしか無い）ときは「別のグループへ移す…」を出さない 2ms
 Test Files  1 failed (1)
      Tests  2 failed | 27 passed (29)
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 所属なし:「グループへ追加…」「新しいグループを作る…」。所属あり:「別のグループへ移す…」「グループから外す」「新しいグループを作る…」。子の行でも項目全体の所属で出る
AssertionError: expected [ Array(6) ] to deeply equal [ Array(7) ]
- Expected
+ Received
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 所属ありで移し先が無い（今のグループしか無い）ときは「別のグループへ移す…」を出さない
AssertionError: expected [ '名前の変更', '閉じる', 'グループへ追加…', …(1) ] to deeply equal [ '名前の変更', '閉じる', 'グループから外す', …(1) ]
- Expected
+ Received
```

壊し: メニュー: 移し先が無くても「別のグループへ移す…」を出す

```
     × 所属ありで移し先が無い（今のグループしか無い）ときは「別のグループへ移す…」を出さない 6ms
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 所属ありで移し先が無い（今のグループしか無い）ときは「別のグループへ移す…」を出さない
AssertionError: expected [ '名前の変更', '閉じる', '別のグループへ移す…', …(2) ] to deeply equal [ '名前の変更', '閉じる', 'グループから外す', …(1) ]
- Expected
+ Received
```

壊し: メニュー: グループに上へ／下へ移動を出さない

```
     × グループの見出し:「名前の変更」「上へ移動」「下へ移動」「グループを削除」。layout の無い古いサーバでは上へ／下へは出さない 6ms
     × 項目を押すと閉じてから item.move_by を送る（見出し 2 種） 3ms
 Test Files  1 failed (1)
      Tests  2 failed | 27 passed (29)
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > グループの見出し:「名前の変更」「上へ移動」「下へ移動」「グループを削除」。layout の無い古いサーバでは上へ／下へは出さない
AssertionError: expected [ '名前の変更', 'グループを削除' ] to deeply equal [ '名前の変更', '上へ移動', '下へ移動', 'グループを削除' ]
- Expected
+ Received
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 項目を押すと閉じてから item.move_by を送る（見出し 2 種）
AssertionError: expected [ [ 'item.move_by', { …(2) } ], …(1) ] to deeply equal [ [ 'item.move_by', { …(2) } ], …(1) ]
- Expected
+ Received
```

壊し: メニュー: 古いサーバでも「グループなし」の項目を出す

```
     × 「グループなし」の見出し:「上へ移動」「下へ移動」だけ（名前の変更・削除は無い）。古いサーバでは項目が無い 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 「グループなし」の見出し:「上へ移動」「下へ移動」だけ（名前の変更・削除は無い）。古いサーバでは項目が無い
AssertionError: expected [ '上へ移動', '下へ移動' ] to deeply equal []
- Expected
+ Received
```

壊し: 一括クローズの件数: 代表でない workspace も数える（repoKey が同じ全部）

```
     × 同じフォルダの 2 つ目（代表でない workspace）は数えない。グループに入っていても数える。先頭でなければ出ない 10ms
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
 FAIL  src/modes/overlays.test.ts > 確認：一括クローズの件数は repoMembers（代表だけ。T17） > 同じフォルダの 2 つ目（代表でない workspace）は数えない。グループに入っていても数える。先頭でなければ出ない
AssertionError: expected '                                     …' to contain '[ ] 束ねた worktree も一緒に閉じる（1 件）'
- Expected
+ Received
```

壊し: 一括クローズの件数: 先頭でなくても出す

```
     × 同じフォルダの 2 つ目（代表でない workspace）は数えない。グループに入っていても数える。先頭でなければ出ない 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
 FAIL  src/modes/overlays.test.ts > 確認：一括クローズの件数は repoMembers（代表だけ。T17） > 同じフォルダの 2 つ目（代表でない workspace）は数えない。グループに入っていても数える。先頭でなければ出ない
AssertionError: expected '                                     …' not to contain '束ねた worktree'
- Expected
+ Received
```

壊し: ピッカーの題を「別のグループへ移す」にしない

```
     × 「別のグループへ移す…」の一覧は題が「別のグループへ移す」で、今のグループを除く。「グループへ追加」の題は変えない 13ms
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
 FAIL  src/modes/overlays.test.ts > 右クリックのメニュー：グループ・「グループなし」の項目（T17。web の ContextMenu.vue と同じ並び） > 「別のグループへ移す…」の一覧は題が「別のグループへ移す」で、今のグループを除く。「グループへ追加」の題は変えない
AssertionError: expected '                                     …' to contain '別のグループへ移す'
- Expected
+ Received
```

壊し: navigate の Space: 見出しのメニューを開かない（常に workspace のメニュー）

```
     × navigate の Space で、選んだ見出しのメニューを開く（グループ・「グループなし」）。見出しが消えていれば何も開かず選択を外す（T17） 1115ms
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
 FAIL  src/app/TuiApp.modes.test.ts > TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3） > navigate の Space で、選んだ見出しのメニューを開く（グループ・「グループなし」）。見出しが消えていれば何も開かず選択を外す（T17）
AssertionError: expected { kind: 'workspace', …(1) } to deeply equal { kind: 'group', groupId: 'g1' }
- Expected
+ Received
```

壊し: navigate の Space: 消えたグループの選択を外さない

```
     × navigate の Space で、選んだ見出しのメニューを開く（グループ・「グループなし」）。見出しが消えていれば何も開かず選択を外す（T17） 1222ms
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
 FAIL  src/app/TuiApp.modes.test.ts > TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3） > navigate の Space で、選んだ見出しのメニューを開く（グループ・「グループなし」）。見出しが消えていれば何も開かず選択を外す（T17）
AssertionError: expected 'group:g1' to be null
- Expected:
+ Received:
```

壊し: 右クリック: 「グループなし」の見出しのメニューを開かない

```
     × 見出しの右クリックでメニュー（グループ・「グループなし」）。layout の無い古いサーバでは「グループなし」のメニューは開かない（T17） 90ms
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 見出しの右クリックでメニュー（グループ・「グループなし」）。layout の無い古いサーバでは「グループなし」のメニューは開かない（T17）
AssertionError: expected undefined to deeply equal { kind: 'ungrouped' }
- Expected:
+ Received:
```

壊し: 右クリック: 古いサーバでも「グループなし」のメニューを開く

```
     × 見出しの右クリックでメニュー（グループ・「グループなし」）。layout の無い古いサーバでは「グループなし」のメニューは開かない（T17） 130ms
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 見出しの右クリックでメニュー（グループ・「グループなし」）。layout の無い古いサーバでは「グループなし」のメニューは開かない（T17）
AssertionError: expected { target: { kind: 'ungrouped' }, …(1) } to be null
- Expected:
+ Received:
```

壊し: reveal: 「グループなし」の見出しに合わせない

```
     × 区画の外へ出ているグループ・「グループなし」の見出しを選ぶと、そこまで動かす（reveal） 9ms
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
 FAIL  src/render/chrome/sidebar.test.ts > サイドバー：木の線の最後と navigate の見出しの選択（T17） > 区画の外へ出ているグループ・「グループなし」の見出しを選ぶと、そこまで動かす（reveal）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
```

壊し: 追加: layout を持つサーバでも 2 段（項目で 1 回にしない）

```
     × group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める 11ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める
AssertionError: expected [ [ 'group.add_member', …(1) ], …(1) ] to deeply equal [ [ 'group.add_member', …(1) ], …(1) ]
- Expected
+ Received
```

壊し: 外す: layout を持つサーバでも項目の workspace 全部に送る

```
     × group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める 9ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める
AssertionError: expected [ [ 'group.add_member', …(1) ], …(1) ] to deeply equal [ [ 'group.add_member', …(1) ], …(1) ]
- Expected
+ Received
```

壊し: navigate の openMenu: 別のマシンの行にも要求を立てる

```
     × openMenu: 見出しを選んでいても要求を立てる（開く先は TuiApp が決める）。別のマシンの行には立てない 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > openMenu: 見出しを選んでいても要求を立てる（開く先は TuiApp が決める）。別のマシンの行には立てない
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
```

壊し: メニューを閉じると navigate の選択が消える（見出しの選択が残らない）

```
     × 見出しのメニューから「下へ移動」を実行しても、見出しの選択が残る 13ms
 Test Files  1 failed (1)
      Tests  1 failed | 121 passed (122)
 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17） > 見出しのメニューから「下へ移動」を実行しても、見出しの選択が残る
AssertionError: expected null to be 'ungrouped:' // Object.is equality
- Expected:
+ Received:
```


### T17 追補 壊して落ちる確認（独立点検の指摘: 代表でない行で畳まない）

壊し: `toggleCollapseOfSelection` の `isRepresentative` の条件を外す（web・端末版の両方）

```
     × toggleCollapse: 代表でない通常の行（同じフォルダの 2 つ目）では、同じリポジトリの worktree グループを畳まない 21ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
      Tests  1 failed | 213 passed (214)
     × toggleCollapse: 代表でない通常の行（同じフォルダの 2 つ目）では、同じリポジトリの worktree グループを畳まない 6ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
      Tests  1 failed | 122 passed (123)
```

壊し: `parseRemoteKey` の正規表現を `machine:` 前置きなしでも拾うものに変える

```
     × 見出しのキーは別のマシンの行のキー（machine:…）と混ざらない 5ms
     × openMenu: 見出しを選んでいても要求を立てる（開く先は TuiApp が決める）。別のマシンの行には立てない 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected { machineId: 'group', …(1) } to be null
- Expected:
+ Received:
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
      Tests  2 failed | 121 passed (123)
```

確認後は両方とも元に戻し、git diff で確認した。
- T17 [should] navigate_toggle_collapse が代表でない通常の行でも worktree グループを畳む（web の T15 から持ち越し）→ web・端末版で isRepresentative のときだけに直した（D35 を書き換え） [conv:-]
- T17 [should] 上の回帰テストと壊して落ちる確認が無い → web・端末版に足して確認を貼った [conv:regression-negative-control]
- T17 [nit] 見出しのキーと remoteKey の非衝突の固定 → テストは既にあり、parseRemoteKey を壊して落ちる確認を貼った [conv:-]

### T18 壊して落ちる確認

実装の 1 行ずつを壊して `vitest run src/input/mouse.sidebarDrag.test.ts src/input/mouse.test.ts`（出力は `×`・`FAIL`・`AssertionError`・件数の行だけに絞った生の出力）。確認後は全部元に戻し（バックアップとの `cmp` で同一を確認）、tui の 513 件が通ることを確かめた。

壊し: A 下へ落とすと落とした項目の次の前（向きの判定） `src/input/sidebarDrag.ts`

```
× グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前 90ms
     × worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置 64ms
     × グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」） 63ms
     × 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る 70ms
       × 項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspace 62ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前
AssertionError: expected [ Array(1) ] to deeply equal [ { item: { …(2) }, before: null } ]
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置
AssertionError: expected { …(2) } to deeply equal { …(2) }
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」）
AssertionError: expected [ { item: { …(2) }, …(1) }, …(3) ] to deeply equal [ { item: { …(2) }, …(1) }, …(3) ]
```

壊し: B 入れ物をまたぐ落とし先を拒否 `src/input/sidebarDrag.ts`

```
× 入れ物をまたぐ落とし先（別のグループの項目・見出し・「グループなし」の項目）は送らず知らせる 65ms
     × グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない 61ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 入れ物をまたぐ落とし先（別のグループの項目・見出し・「グループなし」の項目）は送らず知らせる
AssertionError: expected [] to deeply equal [ …(3) ]
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない
AssertionError: expected [] to deeply equal [ Array(1) ]
      Tests  2 failed | 33 passed (35)
```

壊し: C 名前順の拒否 `src/input/sidebarDrag.ts`

```
× 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る 70ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る
AssertionError: expected [ { item: { …(2) }, …(1) }, …(1) ] to deeply equal []
      Tests  1 failed | 34 passed (35)
```

壊し: D 自分の項目の上は何も起きない（掴んだグループの中の行） `src/input/sidebarDrag.ts`

```
× グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない 68ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない
AssertionError: expected [ …(3) ] to deeply equal [ Array(1) ]
      Tests  1 failed | 34 passed (35)
```

壊し: E 古いサーバで落とし先に workspace が無い行を落とし先にしない `src/input/sidebarDrag.ts`

```
× グループの見出しはメンバー全部。空のグループは掴めず、落とし先にもならない。「グループなし」の見出しは掴めない 62ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > グループの見出しはメンバー全部。空のグループは掴めず、落とし先にもならない。「グループなし」の見出しは掴めない
AssertionError: expected [ { workspaceIds: [ 'w1' ], …(1) } ] to deeply equal []
      Tests  1 failed | 34 passed (35)
```

壊し: F 古いサーバで掴めない行（空のグループ・「グループなし」の見出し） `src/input/sidebarDrag.ts`

```
× グループの見出しはメンバー全部。空のグループは掴めず、落とし先にもならない。「グループなし」の見出しは掴めない 61ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > グループの見出しはメンバー全部。空のグループは掴めず、落とし先にもならない。「グループなし」の見出しは掴めない
AssertionError: expected [ { …(2) } ] to deeply equal []
      Tests  1 failed | 34 passed (35)
```

壊し: G Esc で取り消し `src/app/TuiApp.ts`

```
× Esc で取り消し（そのあと離しても送らない） 103ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > Esc で取り消し（そのあと離しても送らない）
AssertionError: expected [ { item: { …(2) }, before: null } ] to deeply equal []
      Tests  1 failed | 34 passed (35)
```

壊し: H 見出しは動かさずに離すと畳み・広げ `src/input/mouse.ts`

```
× 見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ 61ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ
AssertionError: expected [] to deeply equal [ { groupId: 'g1' } ]
      Tests  1 failed | 34 passed (35)
```

壊し: I 見出しの ▸/▾ は押した時点で畳む `src/input/mouse.ts`

```
× 見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ 63ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ
AssertionError: expected [ { id: '9', …(2) } ] to have a length of 2 but got 1
      Tests  1 failed | 34 passed (35)
```

壊し: J 子の行は worktree グループ全体（先頭の workspace の項目） `src/render/chrome/sidebar.ts`

```
× グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前 82ms
     × worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置 61ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前
AssertionError: expected { …(2) } to deeply equal { …(2) }
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置
AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]
      Tests  2 failed | 33 passed (35)
```

壊し: K layout の無いサーバは workspace.move_to `src/actions/TuiDispatcher.ts`

```
× 項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspace 60ms
     × サイドバーの workspace の行のドラッグで並べ替え 65ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > 項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspace
AssertionError: expected [] to deeply equal [ { workspaceIds: [ 'w4' ], …(1) } ]
 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > サイドバーの workspace の行のドラッグで並べ替え
AssertionError: expected [] to deeply equal [ { workspaceIds: [ 'w2' ], …(1) } ]
      Tests  2 failed | 33 passed (35)
```

壊し: L 見出しも掴める（ドラッグの開始） `src/input/mouse.ts`

```
× グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」） 65ms
     × グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない 57ms
     × 見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ 60ms
     × 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る 62ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」）
AssertionError: expected [] to deeply equal [ { item: { …(2) }, …(1) }, …(3) ]
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない
AssertionError: expected [] to deeply equal [ Array(1) ]
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ
AssertionError: expected [ { id: '9', …(2) }, …(1) ] to have a length of 1 but got 2
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る
```


### T18 追加の壊して落ちる確認（独立点検の指摘: 古いサーバのまとまりの並べ替え・失敗のトースト・dropSidebarItem の単体）

足したテスト: `mouse.sidebarDrag.test.ts`「グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と…」（古いサーバ。g2 を g1 の上へ＝`{w3, before w1}`、g1 を g2 へ＝`{w1,w2, before w4}`、g1 を「グループなし」の見出しへ＝`{w1,w2, before null}`）、`TuiDispatcher.test.ts` の `dropSidebarItem` 5 件（layout あり＝item.move・無し＝workspace.move_to・名前順/入れ物の拒否と黙る場合・空の workspaceIds を送らない・RPC 失敗のトースト）。旧 `moveWorkspacesByDrag` のテストの置き換え。各行を 1 つずつ壊し（`vitest run src/input/mouse.sidebarDrag.test.ts src/actions/TuiDispatcher.test.ts`、出力は `×`・`FAIL`・`AssertionError`・件数に絞った生の出力）、全部元に戻して `cmp` で同一を確認。

壊し: M `unitDrag` の `workspaceIds: ids` → `ids.slice(0, 1)`（sidebar.ts）

```
       × グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落とし先の見出しの先頭の workspace（末尾なら null） 63ms
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落とし先の見出しの先頭の workspace（末尾なら null）
AssertionError: expected [ …(3) ] to deeply equal [ …(3) ]
      Tests  1 failed | 140 passed (141)
```

壊し: N `unitDrag` の `next` の `anchorId: unitIds(nx)[0] ?? null` → `null`（sidebar.ts）

```
       × グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落とし先の見出しの先頭の workspace（末尾なら null） 62ms
 FAIL  src/input/mouse.sidebarDrag.test.ts > ... > layout の無い古いサーバ（workspace.move_to） > グループの見出しを掴んでまとまりどうしを並べ替える：...
AssertionError: expected [ …(2) ] to deeply equal [ …(3) ]
      Tests  1 failed | 140 passed (141)
```

壊し: O `planDrop` の legacy `beforeWorkspaceId: before?.anchorId ?? null` → `null`（sidebarDrag.ts）

```
     × layout の無いサーバは workspace.move_to（動かす workspace 全部と落とし先の先頭の workspace） 13ms
       × 項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspace 64ms
       × グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落とし先の見出しの先頭の workspace（末尾なら null） 59ms
AssertionError: expected [ …(2) ] to deeply equal [ …(2) ]（3 件とも）
      Tests  3 failed | 138 passed (141)
```

壊し: P `planDrop` の legacy `workspaceIds: source.workspaceIds` → `.slice(0, 1)`（sidebarDrag.ts）

```
       × グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落とし先の見出しの先頭の workspace（末尾なら null） 64ms
AssertionError: expected [ …(3) ] to deeply equal [ …(3) ]
      Tests  1 failed | 140 passed (141)
```

壊し: Q `item.move` の `.catch` のトーストを外す（TuiDispatcher.ts）

```
     × 送った RPC が失敗したら「移動できませんでした」と知らせる（item.move・workspace.move_to） 16ms
AssertionError: expected [] to deeply equal [ '移動できませんでした' ]
      Tests  1 failed | 140 passed (141)
```

壊し: R `workspace.move_to` の `.catch` のトーストを外す（TuiDispatcher.ts）

```
     × 送った RPC が失敗したら「移動できませんでした」と知らせる（item.move・workspace.move_to） 20ms
AssertionError: expected [] to deeply equal [ '移動できませんでした' ]
      Tests  1 failed | 140 passed (141)
```

壊し: S 古いサーバで `workspaceIds` が空なら送らない行を削る（TuiDispatcher.ts）

```
     × 古いサーバで動かす workspace が無い（空のグループ）ときは送らないテスト
AssertionError: expected [ [ 'workspace.move_to', …(1) ] ] to deeply equal []
      Tests  1 failed | 140 passed (141)
```

壊し: T 拒否の知らせ `this.ui.toast(plan.reason)` を外す（TuiDispatcher.ts）

```
     × 名前順の拒否・入れ物をまたぐ拒否は送らず知らせる。行の外・自分の上は黙って何もしない 13ms
     × 入れ物をまたぐ落とし先（別のグループの項目・見出し・「グループなし」の項目）は送らず知らせる 62ms
     × グループの見出しは項目の行の上へは落とせない（...） 57ms
     × 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る 63ms
      Tests  4 failed | 137 passed (141)
```

壊し: U layout ありでも workspace.move_to へ分岐（`if (!this.model.hasServerLayout)` → `if (true)`、TuiDispatcher.ts）

```
     × layout ありは item.move（下へは落とした項目の次の前、上へは落とした項目の前） 15ms
     × グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前 93ms
     （ほか mouse.sidebarDrag の 8 件中 6 件が item.move を送らず落ちる）
      Tests  8 failed | 133 passed (141)
```
- T18 [should] 古いサーバでグループの見出しを掴んで並べ替える成功経路のテストと壊して落ちる確認が無い → テストを足し M〜P を貼った [conv:regression-negative-control]
- T18 [nit] 失敗時のトーストと dropSidebarItem の単体テストが無い → TuiDispatcher.test.ts に足し Q〜U を貼った [conv:-]

### T19 壊して落ちる確認

対象: `SessionModel.clientAgreement.test.ts`（サーバと画面の木の一致）と `WsGateway.integration.test.ts` の「サイドバーの並びが 2 つの接続で同じ木になる」。実装の 1 行を壊して該当テストだけを流した生の出力（壊した行は確認後に `git checkout`／バックアップから戻し、`git diff` で確認済み）。

壊し: N1 layout_changed を配らない（`SessionService.ts`／`SessionModel.ts` の該当行を `// BROKEN` に）

```
 ❯ src/ws/WsGateway.integration.test.ts (19 tests | 1 failed | 18 skipped) 3598ms
     × 入れる・外す・並べ替える（グループ・グループなし）・畳む・グループの削除・閉じる: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 3597ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
Error: timed out waiting for workspace.created, sidebar.layout_changed; got: workspace.created, tab.created, pane.created, workspace.updated
 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
```

壊し: N2 workspace.updated を配らない（`SessionService.ts`／`SessionModel.ts` の該当行を `// BROKEN` に）

```
 ❯ src/ws/WsGateway.integration.test.ts (19 tests | 1 failed | 18 skipped) 659ms
     × 入れる・外す・並べ替える（グループ・グループなし）・畳む・グループの削除・閉じる: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 658ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected { rows: [ { …(3) } ], …(2) } to deeply equal { rows: [ { …(3) } ], …(2) }
 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
```

壊し: N3 order_changed を配らない（`SessionService.ts`／`SessionModel.ts` の該当行を `// BROKEN` に）

```
 ❯ src/ws/WsGateway.integration.test.ts (19 tests | 1 failed | 18 skipped) 701ms
     × 入れる・外す・並べ替える（グループ・グループなし）・畳む・グループの削除・閉じる: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 700ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: group.add_member (second): B == snapshot: expected { …(3) } to deeply equal { …(3) }
 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
```

壊し: N4 group.updated を配らない（`SessionService.ts`／`SessionModel.ts` の該当行を `// BROKEN` に）

```
 ❯ src/ws/WsGateway.integration.test.ts (19 tests | 1 failed | 18 skipped) 3701ms
     × 入れる・外す・並べ替える（グループ・グループなし）・畳む・グループの削除・閉じる: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 3700ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
Error: timed out waiting for group.updated; got: 
 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 22 skipped (23)
```

壊し: N5 settle が Map を並べ直さない（`SessionService.ts`／`SessionModel.ts` の該当行を `// BROKEN` に）

```
 ❯ src/session/SessionModel.clientAgreement.test.ts (4 tests | 1 failed) 15ms
     × 操作のたびに、サーバの並び・実効の groupId・配るレイアウトが画面の木と一致する（入れる・外す・並べ替える・グループの削除・代表の交代） 10ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: moveItem: flatten: expected [ 'w4', 'w1', 'w2', 'w3', 'w5', 'w6' ] to deeply equal [ 'w1', 'w2', 'w3', 'w4', 'w5', 'w6' ]
 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 3 passed | 19 skipped (23)
```

壊し: N6 仮の状態で layoutFromLegacy を使わない（`SessionService.ts`／`SessionModel.ts` の該当行を `// BROKEN` に）

```
 ❯ src/session/SessionModel.clientAgreement.test.ts (4 tests | 1 failed) 22ms
     × 仮の状態（layout の無い保存からの復元）: 配るレイアウトは、画面が古いサーバに対して導くレイアウトと同じ 11ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected { top: [ 'u' ], groups: {}, …(1) } to deeply equal { top: [ 'g:g2', 'g:g1', 'u' ], …(2) }
 Test Files  1 failed | 1 skipped (2)
      Tests  1 failed | 3 passed | 19 skipped (23)
```

- N1 は最初の待ち（`workspace.created`＋`sidebar.layout_changed`）で落ちる（配らなければ見ている接続が木を作れない）。N2 は `workspace.updated`（グループの実効の `groupId`）、N3 は `workspace.order_changed`（`item.move` の後の平らな順）、N4 は `group.updated`（畳み）がそれぞれ届かず落ちる。
- N5（`settle` が Map を並べ直さない）と N6（仮の状態で `layoutFromLegacy` を使わない）は、サーバと画面が同じ関数で同じ結果になるテストが落ちる。

### T19 壊して落ちる確認（独立点検の指摘の修正後）

統合テストは固定時間の待ちをやめ（判定のイベントを数えて待つ・`sync()` で同じ接続の応答まで待つ・新しい接続は毎回つなぎ直してすぐ閉じる）、`SessionModel.clientAgreement.test.ts` に「layout が先に届く向き」「git 判定前」のテストを足した。実装の 1 行を壊して流した生の出力（確認ごとに元へ戻し `diff` で確認済み。client-core は戻して build し直し）。

壊し: P1 `sidebar.layout_changed` を step 単位で止める（`SessionService.ts:271` を `if (changes.layout && changes.layout.top.length === 1)` に）

```
     × 入れる・外す・並べ替える（…）: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 3648ms
Error: timed out waiting for group.created, workspace.updated, sidebar.layout_changed; got: group.created, workspace.updated
 ❯ step src/ws/WsGateway.integration.test.ts:644:9
 ❯ src/ws/WsGateway.integration.test.ts:661:7
      Tests  1 failed | 18 skipped (19)
```

壊し: P2 `group.created` を配らない（`SessionService.ts:594` を `// BROKEN`）

```
     × 入れる・外す・並べ替える（…）: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 3652ms
Error: timed out waiting for group.created, workspace.updated, sidebar.layout_changed; got: workspace.updated, sidebar.layout_changed
 ❯ step src/ws/WsGateway.integration.test.ts:644:9
      Tests  1 failed | 18 skipped (19)
```

壊し: P3 `group.deleted` を配らない（`SessionService.ts:615`）

```
     × 入れる・外す・並べ替える（…）: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 4046ms
Error: timed out waiting for group.deleted, workspace.updated, sidebar.layout_changed; got: workspace.updated, sidebar.layout_changed
 ❯ step src/ws/WsGateway.integration.test.ts:687:7
      Tests  1 failed | 18 skipped (19)
```

壊し: P4 `workspace.closed` を配らない（`SessionService.ts:560`。699・877 だけでは `workspace.close` の経路に当たらず通る）

```
     × 入れる・外す・並べ替える（…）: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる 4086ms
Error: timed out waiting for workspace.closed, sidebar.layout_changed; got: pane.closed, tab.closed, sidebar.layout_changed
 ❯ step src/ws/WsGateway.integration.test.ts:684:7
      Tests  1 failed | 18 skipped (19)
```

壊し: P6 画面の木が「レイアウトに無い workspace を『グループなし』の末尾へ足す」を止める（client-core `placeItems` の `ungrouped.items.push(...take(...))` を `// BROKEN`）。新テスト「layout が先に届く向き」が落ちる

```
     × 配信の途中（workspace.created が layout の前に届いた）でも、…… 8ms
     × 配信の途中（layout が workspace.created／workspace.closed より先に届いた）: 実在しない workspace を指すレイアウトでも、画面の木は今ある workspace を 1 度ずつ並べる 2ms
AssertionError: expected [ 'w1', 'w2', 'w3', 'w4', 'w5', 'w6' ] to deeply equal [ 'w1', 'w2', 'w3', 'w4', 'w5', …(2) ]
 ❯ src/session/SessionModel.clientAgreement.test.ts:274:35
      Tests  2 failed | 4 passed (6)
```

壊し: P7 git の判定が無い workspace を木に載せない（`placeItems` に `if (!w.git) continue;`）。新テスト「git 判定前」が落ちる（ほかの 5 件も落ちる粗い壊し。判定なしだけに効く細かい壊しは作れなかった）

```
 Tests  6 failed (6)
     × workspace.created の直後（updateWorkspaceGit の前。git の判定がまだ無い）でも、サーバの並び・実効の groupId・レイアウトは画面の木と一致する 4ms
TypeError: Cannot read properties of undefined (reading 'startsWith')
 ❯ placeItems ../client-core/src/workspace/workspaceGrouping.ts:175:27
 ❯ expectAgreement src/session/SessionModel.clientAgreement.test.ts:280:5
```
- T19 [should] 統合テストの no-inner-declarations（eslint）→ const の関数式に直した [conv:-]
- T19 [should] 統合テストに固定時間の待ち（setTimeout 50）→ イベント待ち（waitForCount・sync）に替え、c は毎回つなぎ直す [conv:e2e-observe-browser]
- T19 [should] 配信の途中の入力（layout 先行・判定前）の一致テストが無い → 2 件足した [conv:-]
- T19 [nit] 壊して落ちる確認の網羅（操作ごとの layout_changed・group.created／deleted・workspace.closed）→ P1〜P7 を貼った [conv:regression-negative-control]
- T19 [nit] 閉じた後のフォーカス先が Map の先頭である点 → D37 に追記 [conv:-]

### T20・T28 壊して落ちる確認（E2E: workspace-groups.spec.ts）

各行は、製品の該当行を 1 つずつ壊して（壊した差分は下に貼る）ビルドし直し、該当のテストを走らせた生の出力（失敗した最初のテストの要点）。確認のたびに `git checkout` で元に戻し、最後に `pnpm build` し直して全 20 件が通ることを確かめた。合否はどれもブラウザの DOM（行の並び・クラス・読み上げ用の文言）かブラウザが送ったフレームで落ちている。

#### ドラッグ：入れ物が違う行の上を「落とせない」にする判定（`Sidebar.vue` の `dropStateFor`）

壊し方: `row.container !== dragged.container` の分岐を無効にする（外と中をまたいでも落とせる）

```diff
-  if (row.container !== dragged.container) return { row, self: false, reason: "同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます" };
+  if (false as boolean) return { row, self: false, reason: "同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます" };
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:846:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5・AC7） (8.7s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:846:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5・AC7） ──────

    Error: expect(locator).toHaveClass(expected) failed

    Locator: locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^delta$/ }) })
    Expected pattern: /sidebar-row-drop-invalid/
    Received string:  "sidebar-row sidebar-row-indent sidebar-row-drop-target"
    Timeout: 5000ms



      883 |     const sentBefore = sentMethods(env.frames, "item.move").length;
      884 |     await dragOver(page, rowOf(page, "beta"), rowOf(page, "delta"));
    > 885 |     await expect(rowOf(page, "delta")).toHaveClass(/sidebar-row-drop-invalid/);
          |                                        ^
      886 |     await expect(rowOf(page, "delta")).not.toHaveClass(/sidebar-row-drop-target/);
      887 |     await page.mouse.up();
      888 |     await expect(
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:885:40

```

#### 畳んだ worktree グループの `+n`（`Sidebar.vue`）

壊し方: `+n` の表示条件 `row.hiddenCount > 0` を `false` にする

```diff
-                <span v-if="i === 0 && !view.sidebarCollapsed && row.hiddenCount > 0" class="sidebar-wt-plus" :aria-label="`隠れている worktree ${row.hiddenCount} 件`">+{{ row.hiddenCount }}</span>
+                <span v-if="i === 0 && !view.sidebarCollapsed && false" class="sidebar-wt-plus" :aria-label="`隠れている worktree ${row.hiddenCount} 件`">+{{ row.hiddenCount }}</span>
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:603:3 › worktree グループ › 畳む：グループと worktree グループ。今いる workspace の行は畳んでも残る（AC6） (22.1s)
  ✘  2 src/specs/workspace-groups.spec.ts:1171:3 › 状態のまとめと +n（追補 01 C・AC21） › グループの見出しは中の状態をまとめて常に出す。畳んだ worktree グループの先頭の行は全体をまとめ、+n を添える (26.7s)
  2 failed

  1) src/specs/workspace-groups.spec.ts:603:3 › worktree グループ › 畳む：グループと worktree グループ。今いる workspace の行は畳んでも残る（AC6）

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Array [
        "[g] work (1)",
    -   "  wt*▸ main-ws +2",
    +   "  wt*▸ main-ws",
        "[u] グループなし (1)",
        "  solo",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:628:11

```

#### 「グループなし」の見出しを本物のグループがあるときだけ出す（`Sidebar.vue` の `row.heading`）

壊し方: `if (row.heading)` を常に真にする（グループが無くても見出しが出る）

```diff
-      if (row.heading) {
+      if (true as boolean) {
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:344:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC1・AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） (21.2s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:344:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC1・AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Array [
    +   "[u] グループなし (3)",
        "alpha",
        "beta",
        "gamma",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:353:11

```

#### worktree グループの読み上げ用の文言（`SidebarKindIcon.vue`）

壊し方: 文言 `worktree グループ` を `WT` にする

```diff
-const TEXT = { group: "グループ", worktreeGroup: "worktree グループ" } as const;
+const TEXT = { group: "グループ", worktreeGroup: "WT" } as const;
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:553:3 › worktree グループ › 種類の印と読み上げ用の文言（AC12）。畳んだサイドバーでは印が名前を持つ (3.9s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:553:3 › worktree グループ › 種類の印と読み上げ用の文言（AC12）。畳んだサイドバーでは印が名前を持つ

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 3
    + Received  + 3

    @@ -3,19 +3,19 @@
          "group",
          "グループ",
        ],
        Array [
          "worktreeGroup",
    -     "worktree グループ",
    +     "WT",
        ],
        Array [
          "worktreeGroup",
    -     "worktree グループ",
    +     "WT",
        ],
        Array [
          "worktreeGroup",
    -     "worktree グループ",
    +     "WT",
        ],
        Array [
          null,
          null,
        ],

      571 |     // 展開：見出しは「グループ」、worktree グループの先頭の行と子は「worktree グループ」を読み上げ用の文字で持つ。「グループなし」・通常の行は印なし。
      572 |     const rows = await rowsOf(page);
    > 573 |     expect(rows.map((r) => [r.kindIcon, r.kindText])).toEqual([
          |                                                       ^
      574 |       ["group", "グループ"],
      575 |       ["worktreeGroup", "worktree グループ"],
      576 |       ["worktreeGroup", "worktree グループ"],
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:573:55

```

#### 本体を閉じるときの「worktree も一緒に閉じる」（`ConfirmDialog.vue`）

壊し方: 対象の本体でも一緒に閉じる対象を空にする

```diff
-  return members.length > 1 && members[0]!.id === target.id ? members.slice(1) : [];
+  return members.length > 1 && members[0]!.id === target.id ? [] : [];
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:679:3 › worktree グループ › 本体を閉じるとき、グループの中でも「worktree も一緒に閉じる」が出て全部閉じる（AC9） (7.9s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:679:3 › worktree グループ › 本体を閉じるとき、グループの中でも「worktree も一緒に閉じる」が出て全部閉じる（AC9）

    Error: expect(locator).toBeVisible() failed

    Locator: locator('.confirm-dialog').getByLabel('束ねた worktree も一緒に閉じる（2 件）')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found



      701 |     // グループの中でも出る。数は代表（worktree）の分。
      702 |     const check = confirm.getByLabel("束ねた worktree も一緒に閉じる（2 件）");
    > 703 |     await expect(check).toBeVisible();
          |                         ^
      704 |     await check.check();
      705 |     await confirm.getByRole("button", { name: "閉じる", exact: true }).click();
      706 |     await expect(confirm).toBeHidden();
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:703:25

```

#### navigate の `z`（折りたたみ。`ActionDispatcher.toggleCollapseOfSelection`）

壊し方: 関数の先頭で何もせず戻る

```diff
+    if (Date.now() > 0) return;
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:1342:3 › キーだけの操作 › navigate の選択・メニュー・折りたたみ・並べ替えがキーだけでできる (21.6s)
  ✘  2 src/specs/workspace-groups.spec.ts:1420:3 › キーだけの操作 › worktree グループの先頭の行で z を押すと畳み、通常の行・同じフォルダの 2 つ目では何も起きない（AC6） (22.0s)
  2 failed

  1) src/specs/workspace-groups.spec.ts:1342:3 › キーだけの操作 › navigate の選択・メニュー・折りたたみ・並べ替えがキーだけでできる ───

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 2

      Array [
    -   "[g▸] g1 (2)",
    +   "[g] g1 (2)",
        "  alpha",
    +   "  beta",
        "[u] グループなし (1)",
        "  gamma",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1380:11

```

#### 「グループなし」の見出しのメニュー項目（`ContextMenu.vue`）

壊し方: 「名前の変更」を余分に出す

```diff
+          { label: "名前の変更", run: () => undefined },
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:1061:3 › 「グループなし」（追補 01 B・AC20） › 畳める・グループと並べ替えられる・名前の変更と削除は無い。外すと末尾へ (4.8s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:1061:3 › 「グループなし」（追補 01 B・AC20） › 畳める・グループと並べ替えられる・名前の変更と削除は無い。外すと末尾へ

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Array [
    +   "名前の変更",
        "上へ移動",
        "下へ移動",
      ]

      1096 |     // メニューは「上へ移動」「下へ移動」だけ（名前の変更・削除は無い）。上へ動かすとグループの前に出る。
      1097 |     await openHeadingMenuByKeys(page, "グループなし");
    > 1098 |     expect(await menuItems(page)).toEqual(["上へ移動", "下へ移動"]);
           |                                   ^
      1099 |     await chooseMenu(page, "上へ移動");
      1100 |     await leaveNavigate(page);
      1101 |     await expectOutline(page, [
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1098:35

```

#### グループの見出しの状態のまとめ（`Sidebar.vue`）

壊し方: グループの見出しの `state` を常に `null`（まとめない）にする

```diff
-      state: aggregateStateOf(allWorkspaces),
+      state: null,
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:1171:3 › 状態のまとめと +n（追補 01 C・AC21） › グループの見出しは中の状態をまとめて常に出す。畳んだ worktree グループの先頭の行は全体をまとめ、+n を添える (1.0m)
  1 failed

  1) src/specs/workspace-groups.spec.ts:1171:3 › 状態のまとめと +n（追補 01 C・AC21） › グループの見出しは中の状態をまとめて常に出す。畳んだ worktree グループの先頭の行は全体をまとめ、+n を添える

    Error: 子の行・グループの見出しに blocked が出る

    子の行・グループの見出しに blocked が出る

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Array [
    -   "blocked",
    +   "none",
        "none",
        "blocked",
        "none",
        "none",
      ]


      1207 |         message: "子の行・グループの見出しに blocked が出る",
      1208 |       })
    > 1209 |       .toEqual(["blocked", "none", "blocked", "none", "none"]);
           |        ^
      1210 |     // 広げているときの worktree グループの先頭の行は、本体の状態のまま（none）。見出しは中の全部（子を含む）をまとめて blocked。
      1211 |     // 「グループなし」の見出しは中（solo）だけなので none。
      1212 |
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1209:8

```

#### 代表でない行で `z` が畳まない（client-core `isRepresentative`）

壊し方: `isRepresentative` を常に真にする

```diff
-  if (typeof key !== "string") return true;
+  if (typeof key !== "string" || Date.now() > 0) return true;
```

```
  ✓  1 src/specs/workspace-groups.spec.ts:999:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › worktree グループには入らず通常の行（worktree の印なし）。代表を閉じると次が worktree グループに入る (2.4s)
  ✘  2 src/specs/workspace-groups.spec.ts:1033:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › 同じフォルダの 2 つ目は、worktree グループの所属に引きずられない（グループへ入れても worktree グループは動かない） (21.6s)
  ✘  3 src/specs/workspace-groups.spec.ts:1420:3 › キーだけの操作 › worktree グループの先頭の行で z を押すと畳み、通常の行・同じフォルダの 2 つ目では何も起きない（AC6） (21.4s)
  2 failed
  1 passed (47.0s)

  1) src/specs/workspace-groups.spec.ts:1033:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › 同じフォルダの 2 つ目は、worktree グループの所属に引きずられない（グループへ入れても worktree グループは動かない）

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Array [
        "[g] g1 (1)",
    -   "  same-2",
    -   "[u] グループなし (1)",
        "  wt* main-ws",
        "    wt same-1",
    +   "[u] グループなし (1)",
    +   "  same-2",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1046:11

```

#### 同じフォルダの 2 つ目は代表にならない（client-core `representativeIds`）

壊し方: 同じ `worktreeKey` を重複として読み飛ばす行を無効にする（2 つ目も代表になる）

```diff
-      if (seen.has(key)) continue;
+      if (Date.now() < 0 && seen.has(key)) continue;
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:999:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › worktree グループには入らず通常の行（worktree の印なし）。代表を閉じると次が worktree グループに入る (21.4s)
  ✘  2 src/specs/workspace-groups.spec.ts:1033:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › 同じフォルダの 2 つ目は、worktree グループの所属に引きずられない（グループへ入れても worktree グループは動かない） (21.2s)
  ✘  3 src/specs/workspace-groups.spec.ts:1420:3 › キーだけの操作 › worktree グループの先頭の行で z を押すと畳み、通常の行・同じフォルダの 2 つ目では何も起きない（AC6） (21.3s)
  3 failed

  1) src/specs/workspace-groups.spec.ts:999:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › worktree グループには入らず通常の行（worktree の印なし）。代表を閉じると次が worktree グループに入る

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Array [
        "wt* main-ws",
        "  wt same-1",
    -   "same-2",
    +   "  wt same-2",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1013:11

```

#### グループの削除で中身は「グループなし」の末尾へ（client-core `deleteGroupFromLayout`）

壊し方: 中身を「グループなし」の先頭側へ入れる

```diff
-    ungrouped: [...layout.ungrouped, ...(layout.groups[groupId] ?? []).filter((r) => !layout.ungrouped.includes(r))],
+    ungrouped: [...(layout.groups[groupId] ?? []).filter((r) => !layout.ungrouped.includes(r)), ...layout.ungrouped],
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:441:3 › グループの作成と出入り › グループを削除すると中身は「グループなし」の末尾へ出る。グループが無くなると見出しは消える（AC10・AC20） (21.9s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:441:3 › グループの作成と出入り › グループを削除すると中身は「グループなし」の末尾へ出る。グループが無くなると見出しは消える（AC10・AC20）

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Array [
        "[g] g2 (1)",
        "  beta",
        "[u] グループなし (2)",
    -   "  gamma",
        "  alpha",
    +   "  gamma",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:463:11

```

#### サーバの再起動で並びを戻す（server `SessionService.persistedLayout`）

壊し方: 保存する `layout`・`repoGroups` を書かない（常に null）

```diff
-    if (!this.model.hasLayout()) return null;
+    if (!this.model.hasLayout() || Date.now() > 0) return null;
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:809:3 › 後から開く・開き直す・再起動 › サーバを再起動しても、同じ並び・同じグループ・同じ折りたたみ（AC18） (3.3s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:809:3 › 後から開く・開き直す・再起動 › サーバを再起動しても、同じ並び・同じグループ・同じ折りたたみ（AC18）

    Error: second が work の前・work は畳んでいる

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Array [
        "[g] second (1)",
        "  other",
    -   "[g▸] work (1)",
    +   "[g] work (1)",
      ]

      826 |     await rowOf(page, "work").getByRole("button", { name: "グループを折りたたむ" }).click();
      827 |     const before = await outline(page);
    > 828 |     expect(before.slice(0, 3), "second が work の前・work は畳んでいる").toEqual([
          |                                                                ^
      829 |       "[g] second (1)",
      830 |       "  other",
      831 |       "[g▸] work (1)",
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:828:64

```

#### 全部閉じて開き直したとき同じグループへ戻る（server `SessionModel` の `repoGroups` の参照）

壊し方: 覚えているグループを無視する

```diff
-    const repoGroup = liveGroup(this.repoGroups.get(newKey));
+    const repoGroup = liveGroup(undefined);
```

```
  ✘  1 src/specs/workspace-groups.spec.ts:775:3 › 後から開く・開き直す・再起動 › 全部閉じて開き直すと、同じグループに戻る（AC8） (22.1s)
  1 failed

  1) src/specs/workspace-groups.spec.ts:775:3 › 後から開く・開き直す・再起動 › 全部閉じて開き直すと、同じグループに戻る（AC8） ─────────

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 3
    + Received  + 3

      Array [
    -   "[g] work (1)",
    -   "  main-ws",
    -   "[u] グループなし (1)",
    +   "[g] work (0)",
    +   "[u] グループなし (2)",
        "  solo",
    +   "  main-ws",
      ]


      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:798:11

```


2 回続けて同じ結果: 壊していない状態で `workspace-groups.spec.ts` を 2 回続けて走らせ、どちらも 20 件通った（1.2 分）。

### T20・T28 壊して落ちる確認（独立点検の指摘への追加。workspace-groups.spec.ts・Sidebar.test.ts）

独立点検の指摘（右クリックの不具合の修正と、壊して落ちる確認が無かった場面）への追加。各項目は、製品の該当 1 か所を壊して `corepack pnpm build` し直し、該当のテストだけを走らせた生の出力（失敗した最初のテストの要点。トレースの案内は省いた）。確認ごとに元へ戻し、最後に `pnpm build` し直した。壊した差分は各項目の先頭（`-` が元、`+` が壊した形）。

#### 右クリックの回帰（web の単体テスト `Sidebar.test.ts`。`Sidebar.vue` の `if (ev.button !== 0) return;` を外す）

```
 RUN  v5.0.1 /workspaces/sodashitsu/packages/web
 ❯ src/components/Sidebar.test.ts (138 tests | 2 failed) 706ms
   ❯ Sidebar — workspace 行の D&D（20260923-workspace-grouping） (29)
     ❯ 左ボタン以外の押下は行のクリックにしない (2)
       × グループの見出しを右クリックしても折りたたみが切り替わらない（左クリックは切り替わる） 15ms
       × 通常の workspace の行を右クリックしても workspace が切り替わらない（左クリックは切り替わる） 18ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 左ボタン以外の押下は行のクリックにしない > グループの見出しを右クリックしても折りたたみが切り替わらない（左クリックは切り替わる）
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 2 times
Received:
  1st vi.fn() call:
    Array [
      "g1",
    ]
  2nd vi.fn() call:
    Array [
      "g1",
    ]
Number of calls: 2
 ❯ src/components/Sidebar.test.ts:1262:40
    1260|       pressRow(head, 2);
    1261|       pressRow(head, 1);
    1262|       expect(toggleGroupCollapsed).not.toHaveBeenCalled();
       |                                        ^
    1263|       pressRow(head, 0);
    1264|       expect(toggleGroupCollapsed).toHaveBeenCalledTimes(1);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 左ボタン以外の押下は行のクリックにしない > 通常の workspace の行を右クリックしても workspace が切り替わらない（左クリックは切り替わる）
AssertionError: expected 'w1' to be null
- Expected:
null
+ Received:
"w1"
 ❯ src/components/Sidebar.test.ts:1275:32
    1273|       const row = wrapper.get(".sidebar-spaces .sidebar-row").element;
    1274|       pressRow(row, 2);
    1275|       expect(view.workspaceId).toBeNull();
       |                                ^
    1276|       expect(conn.requests).toEqual([]);
    1277|       pressRow(row, 0);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed (1)
      Tests  2 failed | 136 passed (138)
   Start at  16:27:56
   Duration  2.01s (transform 47%, tests 37%, import 8%, environment 8%)
undefined
/workspaces/sodashitsu/packages/web:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/Sidebar.test.ts
```

#### 01-rightclick: 右クリックで見出しの折りたたみ・行の workspace が切り替わる（`Sidebar.vue` の `onRowPointerDown` の `ev.button` ガードを外す）

```
--- diff
-   if (ev.button !== 0) return;
+ 
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:528:3 › グループの作成と出入り › 見出し・行を右クリックしてもメニューが開くだけで、折りたたみも今いる workspace も変わらない（AC-I1）
src/specs/workspace-groups.spec.ts:528:3 › グループの作成と出入り › 見出し・行を右クリックしてもメニューが開くだけで、折りたたみも今いる workspace も変わらない（AC-I1）
  1) src/specs/workspace-groups.spec.ts:528:3 › グループの作成と出入り › 見出し・行を右クリックしてもメニューが開くだけで、折りたたみも今いる workspace も変わらない（AC-I1） 
    Test timeout of 30000ms exceeded.
    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^gamma$/ }) })
      269 |
      270 | async function openMenuOn(page: Page, row: Locator): Promise<void> {
    > 271 |   await row.click({ button: "right" });
          |             ^
      272 |   await expect(page.locator(".context-menu")).toBeVisible();
      273 | }
      274 |
        at openMenuOn (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:271:13)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:554:11
  1 failed
    src/specs/workspace-groups.spec.ts:528:3 › グループの作成と出入り › 見出し・行を右クリックしてもメニューが開くだけで、折りたたみも今いる workspace も変わらない（AC-I1） 
```

#### 02c-late-open-members: 後から開いた worktree が worktree グループに束ねられない（`client-core` の `repoMembers` から linked worktree を外す）。なお `SessionModel.transition` の `w:`→`r:` の分岐だけを壊しても落ちない（`r:` の項目が既にあれば、描画の木は代表から導かれるため。`02-late-open` の出力は `1 passed`）

```
--- diff
- const members = workspaces.filter((w) => w.git?.repoKey === repoKey && reps.has(w.id));
+ const members = workspaces.filter((w) => w.git?.repoKey === repoKey && reps.has(w.id) && w.git?.isLinkedWorktree !== true);
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:832:3 › 後から開く・開き直す・再起動 › 後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8）
src/specs/workspace-groups.spec.ts:832:3 › 後から開く・開き直す・再起動 › 後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8）
  1) src/specs/workspace-groups.spec.ts:832:3 › 後から開く・開き直す・再起動 › 後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 1
      Array [
        "[g] work (1)",
    -   "  wt* main-ws",
    -   "    wt late-ws",
    +   "  main-ws",
        "[u] グループなし (1)",
        "  solo",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:847:11
  1 failed
    src/specs/workspace-groups.spec.ts:832:3 › 後から開く・開き直す・再起動 › 後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8） 
```

#### 03-reopen: 全部閉じて開き直したとき、覚えているグループへ戻らず「グループなし」へ入る（`SessionModel.transition`）

```
--- diff
- return exists ? without : addItemToGroup(without, to, repoGroup);
+ return exists ? without : insertItem(without, to, null);
--- output
Running 3 tests using 1 worker
[1/3] src/specs/workspace-groups.spec.ts:832:3 › 後から開く・開き直す・再起動 › 後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8）
src/specs/workspace-groups.spec.ts:832:3 › 後から開く・開き直す・再起動 › 後から worktree を開くと、同じ worktree グループ・同じグループに入る（AC8）
[2/3] src/specs/workspace-groups.spec.ts:863:3 › 後から開く・開き直す・再起動 › 全部閉じて開き直すと、同じグループに戻る（AC10）
src/specs/workspace-groups.spec.ts:863:3 › 後から開く・開き直す・再起動 › 全部閉じて開き直すと、同じグループに戻る（AC10）
  1) src/specs/workspace-groups.spec.ts:863:3 › 後から開く・開き直す・再起動 › 全部閉じて開き直すと、同じグループに戻る（AC10） ────────
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 3
    + Received  + 3
      Array [
    -   "[g] work (1)",
    -   "  main-ws",
    -   "[u] グループなし (1)",
    +   "[g] work (0)",
    +   "[u] グループなし (2)",
        "  solo",
    +   "  main-ws",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:886:11
[3/3] src/specs/workspace-groups.spec.ts:897:3 › 後から開く・開き直す・再起動 › サーバを再起動しても、同じ並び・同じグループ・同じ折りたたみ（AC10）
src/specs/workspace-groups.spec.ts:897:3 › 後から開く・開き直す・再起動 › サーバを再起動しても、同じ並び・同じグループ・同じ折りたたみ（AC10）
  1 failed
    src/specs/workspace-groups.spec.ts:863:3 › 後から開く・開き直す・再起動 › 全部閉じて開き直すと、同じグループに戻る（AC10） ─────────
  2 passed (34.6s)
```

#### 04-other-conn: 別の接続の並びの変更（`sidebar.layout_changed`）をブラウザが反映しない（`StoreAdapter.ts`）

```
--- diff
-         session.layoutChanged(e.data.layout);
+         void e.data.layout;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1397:3 › 別の接続からの操作 › 別の接続（テストのクライアント）の操作に、ブラウザの DOM が追従する
src/specs/workspace-groups.spec.ts:1397:3 › 別の接続からの操作 › 別の接続（テストのクライアント）の操作に、ブラウザの DOM が追従する
  1) src/specs/workspace-groups.spec.ts:1397:3 › 別の接続からの操作 › 別の接続（テストのクライアント）の操作に、ブラウザの DOM が追従する ──
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[g] g1 (1)",
    +   "[g] g1 (0)",
    +   "[u] グループなし (3)",
        "  alpha",
    -   "[u] グループなし (2)",
        "  beta",
        "  gamma",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1409:11
  1 failed
    src/specs/workspace-groups.spec.ts:1397:3 › 別の接続からの操作 › 別の接続（テストのクライアント）の操作に、ブラウザの DOM が追従する ───
```

#### 05-drag-plain: 同じグループの中のドラッグ（通常の行の項目が正しくない。`Sidebar.vue` の `workspaceRow`）

```
--- diff
- item: { kind: "workspace", workspaceId: opts.itemHeadId },
+ item: { kind: "workspace", workspaceId: opts.kind === "workspace" ? "w-none" : opts.itemHeadId },
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:935:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5）
src/specs/workspace-groups.spec.ts:935:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5）
  1) src/specs/workspace-groups.spec.ts:935:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5） ──────────
    Error: expect(locator).toHaveClass(expected) failed
    Locator: locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^alpha$/ }) })
    Expected pattern: /sidebar-row-drop-target/
    Received string:  "sidebar-row sidebar-row-current sidebar-row-indent"
    Timeout: 5000ms
    Call log:
      - Expect "toHaveClass" locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^alpha$/ }) }) with timeout 5000ms
      - waiting for locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^alpha$/ }) })
        14 × locator resolved to <div data-v-a158a173="" aria-current="true" data-workspace-row-key="w2" data-drop-workspace-id="w2" class="sidebar-row sidebar-row-current sidebar-row-indent">…</div>
           - unexpected value "sidebar-row sidebar-row-current sidebar-row-indent"
      957 |     // 同じグループの中：gamma を alpha の前へ。落とせる行には印（drop-target）が付く（離す前の DOM）。
      958 |     await dragOver(page, rowOf(page, "gamma"), rowOf(page, "alpha"));
    > 959 |     await expect(rowOf(page, "alpha")).toHaveClass(/sidebar-row-drop-target/);
          |                                        ^
      960 |     await page.mouse.up();
      961 |     await expectOutline(page, [
      962 |       "[g] g1 (3)",
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:959:40
  1 failed
    src/specs/workspace-groups.spec.ts:935:3 › ドラッグ › グループの中で項目を並べ替える。外と中をまたぐと落とせない（AC5） ───────────
```

#### 06-drag-child: 子の行をつかんでも全体が動く（サーバの `refOfTarget` が workspace を代表の項目へ引かず `w:<id>` にする）

```
--- diff
- return itemRefOf(this.requireWorkspace(target.workspaceId), this.listWorkspaces());
+ return `w:${this.requireWorkspace(target.workspaceId).id}`;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20）
src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20）
  1) src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 1
      Array [
        "[g] g1 (2)",
    +   "  solo",
        "  wt* main-ws",
        "    wt wt-a-ws",
        "    wt wt-b-ws",
    -   "  solo",
        "[u] グループなし (1)",
        "  other",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1045:11
  1 failed
    src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20） 
```

#### 07-drag-group-heading: グループの見出しのドラッグ（見出しの項目が「グループなし」になる）

```
--- diff
- item: { kind: "group", groupId: row.group.id },
+ item: { kind: "ungrouped" },
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1118:3 › ドラッグ › グループの見出しをつかんで、別のグループの上へ落とすとグループが並べ替わる（AC5）
src/specs/workspace-groups.spec.ts:1118:3 › ドラッグ › グループの見出しをつかんで、別のグループの上へ落とすとグループが並べ替わる（AC5）
  1) src/specs/workspace-groups.spec.ts:1118:3 › ドラッグ › グループの見出しをつかんで、別のグループの上へ落とすとグループが並べ替わる（AC5） ─
    Error: expect(locator).toHaveClass(expected) failed
    Locator: locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^g1$/ }) })
    Expected pattern: /sidebar-row-drop-target/
    Received string:  "sidebar-row sidebar-row-group"
    Timeout: 5000ms
    Call log:
      - Expect "toHaveClass" locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^g1$/ }) }) with timeout 5000ms
      - waiting for locator('.sidebar-spaces .sidebar-row[data-workspace-row-key]').filter({ has: locator('.sidebar-label').filter({ hasText: /^g1$/ }) })
        14 × locator resolved to <div data-v-37a3171a="" data-workspace-row-key="group:g1" class="sidebar-row sidebar-row-group">…</div>
           - unexpected value "sidebar-row sidebar-row-group"
      1133 |     ]);
      1134 |     await dragOver(page, rowOf(page, "g2"), rowOf(page, "g1"));
    > 1135 |     await expect(rowOf(page, "g1")).toHaveClass(/sidebar-row-drop-target/);
           |                                     ^
      1136 |     await page.mouse.up();
      1137 |     await expectOutline(page, [
      1138 |       "[g] g2 (1)",
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1135:37
  1 failed
    src/specs/workspace-groups.spec.ts:1118:3 › ドラッグ › グループの見出しをつかんで、別のグループの上へ落とすとグループが並べ替わる（AC5） ──
```

#### 08-drag-ungrouped-heading: 「グループなし」の見出しの並べ替え（見出しの項目が無いグループになる）

```
--- diff
-           item: { kind: "ungrouped" },
+           item: { kind: "group", groupId: "g-none" },
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20）
src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20）
  1) src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[u] グループなし (1)",
    -   "  other",
        "[g] g1 (2)",
        "  wt* main-ws",
        "    wt wt-a-ws",
        "    wt wt-b-ws",
        "  solo",
    +   "[u] グループなし (1)",
    +   "  other",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1059:11
  1 failed
    src/specs/workspace-groups.spec.ts:1018:3 › ドラッグ › worktree グループは子の行をつかんでも全体が動く。まとまり（グループ・グループなし）はまとまりどうしで並べ替える（AC5・AC20） 
```

#### 09-child-menu-remove: 子の行のメニュー「グループから外す」で全体が動かない（サーバの `removeFromGroup` が `w:<id>` を外そうとする）

```
--- diff
- this.layout = removeItemFromGroup(layout, itemRefOf(ws, this.listWorkspaces()));
+ this.layout = removeItemFromGroup(layout, `w:${ws.id}`);
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12）
src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12）
  1) src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 3
    + Received  + 3
      Array [
    -   "[g] work (0)",
    -   "[u] グループなし (2)",
    -   "  solo",
    +   "[g] work (1)",
        "  wt* main-ws",
        "    wt wt-a-ws",
        "    wt wt-b-ws",
    +   "[u] グループなし (1)",
    +   "  solo",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:627:11
  1 failed
    src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12） 
```

#### 10-child-menu-add: 子の行のメニュー「グループへ追加…」で全体が動かない（サーバの `addToGroup` が `w:<id>` を入れようとする）

```
--- diff
- this.layout = addItemToGroup(layout, itemRefOf(ws, this.listWorkspaces()), groupId);
+ this.layout = addItemToGroup(layout, `w:${ws.id}`, groupId);
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12）
src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12）
  1) src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 1
      Array [
        "[g] work (1)",
        "  wt* main-ws",
    -   "    wt wt-a-ws",
        "    wt wt-b-ws",
    +   "    wt wt-a-ws",
        "[u] グループなし (1)",
        "  solo",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:640:11
  1 failed
    src/specs/workspace-groups.spec.ts:591:3 › worktree グループ › グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1・AC2・AC3・AC4・AC12） 
```

#### 11-create: 「新しいグループを作る…」が項目を入れない（サーバの `createGroup`）

```
--- diff
- this.layout = ws ? addItemToGroup(created, itemRefOf(ws, this.listWorkspaces()), id) : created;
+ this.layout = created;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
  1) src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[g] g1 (1)",
    +   "[g] g1 (0)",
    +   "[u] グループなし (3)",
        "  alpha",
    -   "[u] グループなし (2)",
        "  beta",
        "  gamma",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:416:11
  1 failed
    src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
```

#### 12-add: 「グループへ追加…」が何もしない（サーバの `addToGroup`）

```
--- diff
- this.layout = addItemToGroup(layout, itemRefOf(ws, this.listWorkspaces()), groupId);
+ this.layout = layout;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
  1) src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[g] g1 (2)",
    +   "[g] g1 (1)",
        "  alpha",
    +   "[u] グループなし (2)",
        "  beta",
    -   "[u] グループなし (1)",
        "  gamma",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:434:11
  1 failed
    src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
```

#### 13-remove: 「グループから外す」が何もしない（サーバの `removeFromGroup`）

```
--- diff
- this.layout = removeItemFromGroup(layout, itemRefOf(ws, this.listWorkspaces()));
+ this.layout = layout;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
  1) src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 3
    + Received  + 3
      Array [
    -   "[g] g1 (1)",
    +   "[g] g1 (2)",
        "  alpha",
    -   "[u] グループなし (2)",
    +   "  beta",
    +   "[u] グループなし (1)",
        "  gamma",
    -   "  beta",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:451:11
  1 failed
    src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
```

#### 14-move-picker: 「別のグループへ移す…」の選択肢が今のグループを除かない（`ActionDispatcher.openGroupPicker`）

```
--- diff
- const groups = this.groupsInLayoutOrder().filter((g) => g.id !== current);
+ const groups = this.groupsInLayoutOrder();
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20）
  1) src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 0
    + Received  + 1
      Array [
    +   "g1",
        "g2",
      ]
      479 |     await chooseMenu(page, "別のグループへ移す…");
      480 |     await expect(page.locator(".group-picker-dialog-title")).toHaveText("別のグループへ移す");
    > 481 |     expect(await pickGroup(page, "g2")).toEqual(["g2"]);
          |                                         ^
      482 |     await expectOutline(page, [
      483 |       "[g] g1 (0)",
      484 |       "[g] g2 (2)",
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:481:41
  1 failed
    src/specs/workspace-groups.spec.ts:398:3 › グループの作成と出入り › メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る（AC20） 
```

#### 15-child-close-checkbox: 子の行にも「worktree も一緒に閉じる」が出る（`ConfirmDialog.vue` の本体判定を外す）

```
--- diff
- members.length > 1 && members[0]!.id === target.id ? members.slice(1) : [];
+ members.length > 1 ? members.slice(1) : [];
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:808:3 › worktree グループ › 子の行には「worktree も一緒に閉じる」は出ない（閉じるのはその 1 つだけ。AC7）
src/specs/workspace-groups.spec.ts:808:3 › worktree グループ › 子の行には「worktree も一緒に閉じる」は出ない（閉じるのはその 1 つだけ。AC7）
  1) src/specs/workspace-groups.spec.ts:808:3 › worktree グループ › 子の行には「worktree も一緒に閉じる」は出ない（閉じるのはその 1 つだけ。AC7） 
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('.confirm-dialog').locator('.confirm-dialog-linked-worktrees')
    Expected: 0
    Received: 1
    Timeout:  5000ms
    Call log:
      - Expect "toHaveCount" locator('.confirm-dialog').locator('.confirm-dialog-linked-worktrees') with timeout 5000ms
      - waiting for locator('.confirm-dialog').locator('.confirm-dialog-linked-worktrees')
        14 × locator resolved to 1 element
           - unexpected value "1"
      819 |     const confirm = page.locator(".confirm-dialog");
      820 |     await expect(confirm).toBeVisible();
    > 821 |     await expect(confirm.locator(".confirm-dialog-linked-worktrees")).toHaveCount(0);
          |                                                                       ^
      822 |     await confirm.getByRole("button", { name: "閉じる", exact: true }).click();
      823 |     await expectOutline(page, ["wt* main-ws", "  wt wt-b-ws"]);
      824 |   });
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:821:71
  1 failed
    src/specs/workspace-groups.spec.ts:808:3 › worktree グループ › 子の行には「worktree も一緒に閉じる」は出ない（閉じるのはその 1 つだけ。AC7） 
```

#### 16-drag-esc: ドラッグ中の Esc が取り消さない（`Sidebar.vue` の `onEscapeDuringWorkspaceDrag`）

```
--- diff
-   if (ev.key !== "Escape") return;
  cancelWorkspaceDrag();
+   if (ev.key !== "Escape") return;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2）
src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2）
  1) src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2） 
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('.sidebar-row-drop-target')
    Expected: 0
    Received: 1
    Timeout:  5000ms
    Call log:
      - Expect "toHaveCount" locator('.sidebar-row-drop-target') with timeout 5000ms
      - waiting for locator('.sidebar-row-drop-target')
        14 × locator resolved to 1 element
           - unexpected value "1"
      1088 |     await expect(rowOf(page, "alpha")).toHaveClass(/sidebar-row-drop-target/);
      1089 |     await page.keyboard.press("Escape");
    > 1090 |     await expect(page.locator(".sidebar-row-drop-target")).toHaveCount(0);
           |                                                            ^
      1091 |     await page.mouse.up();
      1092 |
      1093 |     // 行の外：落とせる行の上から、サイドバーの外（端末の領域）へ動かして離す → 印が消え、取り消し。
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1090:60
  1 failed
    src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2） ─
```

#### 17-drag-outside: 行の外へ出ても落とし先の印が残る（`Sidebar.vue` の `onRowPointerMove`）

```
--- diff
- if (!state || state.self) view.setWorkspaceDragOver(null);
  else view.setWorkspaceDragOver(state.row.key, state.reason !== null);
+ if (!state || state.self) return;
  view.setWorkspaceDragOver(state.row.key, state.reason !== null);
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2）
src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2）
  1) src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2） 
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('.sidebar-row-drop-target')
    Expected: 0
    Received: 1
    Timeout:  5000ms
    Call log:
      - Expect "toHaveCount" locator('.sidebar-row-drop-target') with timeout 5000ms
      - waiting for locator('.sidebar-row-drop-target')
        14 × locator resolved to 1 element
           - unexpected value "1"
      1098 |       steps: 8,
      1099 |     });
    > 1100 |     await expect(page.locator(".sidebar-row-drop-target")).toHaveCount(0);
           |                                                            ^
      1101 |     await page.mouse.up();
      1102 |
      1103 |     // 取り消しの後に本物のドラッグを 1 つ行う。**この 1 回だけが送られ、並びがこれだけ変わる**ことで、前の 2 回が
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1100:60
  1 failed
    src/specs/workspace-groups.spec.ts:1070:3 › ドラッグ › ドラッグは Esc・行の外で離すと取り消され、何も送らず並びも変わらない（AC-I2） ─
```

#### 18-kbd-reorder-dir: `move_workspace_previous`／`next` の向きが逆（`ActionDispatcher.moveWorkspace`）

```
--- diff
- item.move_by", { item: { kind: "workspace", workspaceId }, direction })
+ item.move_by", { item: { kind: "workspace", workspaceId }, direction: direction === "previous" ? "next" : "previous" })
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5）
src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5）
  1) src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 1
    @@ -1,9 +1,9 @@
      Array [
        "[g] g1 (2)",
    -   "  beta",
        "  alpha",
    +   "  beta",
        "[u] グループなし (2)",
        "  wt* main-ws",
        "    wt wt-a-ws",
        "    wt wt-b-ws",
        "  solo",
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1756:11
  1 failed
    src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5） 
```

#### 19-kbd-reorder-wrap: 並べ替えが端で止まらず回り込む（`client-core` の `moveItemBy`）

```
--- diff
-   const target = direction === "previous" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return { layout, moved: false };
+   const target = ((direction === "previous" ? index - 1 : index + 1) + list.length) % list.length;
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5）
src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5）
  1) src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5） 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 1
    @@ -1,9 +1,9 @@
      Array [
        "[g] g1 (2)",
    -   "  alpha",
        "  beta",
    +   "  alpha",
        "[u] グループなし (2)",
        "  wt* main-ws",
        "    wt wt-a-ws",
        "    wt wt-b-ws",
        "  solo",
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1759:11
  1 failed
    src/specs/workspace-groups.spec.ts:1715:3 › キーだけの操作 › move_workspace_previous／next のキーで workspace の行・worktree グループが動き、端で止まる（AC5） 
```

#### 20-kbd-menu: navigate の `Space` が選んだ行のメニューを開かない（`ActionDispatcher.navigate`）

```
--- diff
- if (this.view.navigateSelection) this.view.requestNavigateMenu();
+ 
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3）
src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3）
  1) src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3） 
    Error: expect(locator).toBeVisible() failed
    Locator: locator('.context-menu')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
    Call log:
      - Expect "toBeVisible" locator('.context-menu') with timeout 5000ms
      - waiting for locator('.context-menu')
      297 |   await navigateTo(page, label);
      298 |   await page.keyboard.press("Space");
    > 299 |   await expect(page.locator(".context-menu")).toBeVisible();
          |                                               ^
      300 | }
      301 |
      302 | /** 開いているメニューの項目を ↓ で選んで Enter（選んでいる項目は DOM のクラスで見る）。 */
        at openMenuByKeys (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:299:47)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1621:5
  1 failed
    src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3） 
```

#### 21-kbd-picker: グループの選択ダイアログが ↓ キーで動かない（`GroupPickerDialog.vue`）

```
--- diff
- if (ev.key === "ArrowDown" || ev.key === "j") {
+ if (ev.key === "j") {
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3）
src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3）
  1) src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3） 
    Error: expect(locator).toHaveText(expected) failed
    Locator:  locator('.group-picker-dialog').locator('.group-picker-dialog-item-selected')
    Expected: "g2"
    Received: "g1"
    Timeout:  5000ms
    Call log:
      - Expect "toHaveText" locator('.group-picker-dialog').locator('.group-picker-dialog-item-selected') with timeout 5000ms
      - waiting for locator('.group-picker-dialog').locator('.group-picker-dialog-item-selected')
        14 × locator resolved to <li role="option" data-v-97b1863d="" aria-selected="true" class="group-picker-dialog-item group-picker-dialog-item-selected">g1</li>
           - unexpected value "g1"
      322 |     await page.keyboard.press("ArrowDown");
      323 |   }
    > 324 |   await expect(selected).toHaveText(groupName);
          |                          ^
      325 |   await page.keyboard.press("Enter");
      326 |   await expect(dialog).toBeHidden();
      327 |   return options;
        at pickGroupByKeys (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:324:26)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1650:12
  1 failed
    src/specs/workspace-groups.spec.ts:1611:3 › キーだけの操作 › グループを作る・入れる・外す・別のグループへ移すが、メニューとダイアログをキーだけで操作してできる。Esc で取り消せる（AC-I2・AC-I3） 
```

#### 22-cd-nongit: git 管理外へ移ると、移る前のグループに残らず「グループなし」へ出る（`SessionModel.transition`）

```
--- diff
- layout = insertAt(layout, own, left.container, left.removed ? left.index : left.index + 1);
+ layout = insertAt(layout, own, null, left.removed ? left.index : left.index + 1);
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1828:3 › 先頭の pane の移動（AC11） › git 管理外へ移ると、移る前のグループに通常の workspace として残る。その後リポジトリへ移っても、グループには残ったまま所属が引き継がれる
src/specs/workspace-groups.spec.ts:1828:3 › 先頭の pane の移動（AC11） › git 管理外へ移ると、移る前のグループに通常の workspace として残る。その後リポジトリへ移っても、グループには残ったまま所属が引き継がれる
  1) src/specs/workspace-groups.spec.ts:1828:3 › 先頭の pane の移動（AC11） › git 管理外へ移ると、移る前のグループに通常の workspace として残る。その後リポジトリへ移っても、グループには残ったまま所属が引き継がれる 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[g] g1 (2)",
    +   "[g] g1 (1)",
        "  a-ws",
    +   "[u] グループなし (1)",
        "  mover",
    -   "[u] グループなし (0)",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1849:11
  1 failed
    src/specs/workspace-groups.spec.ts:1828:3 › 先頭の pane の移動（AC11） › git 管理外へ移ると、移る前のグループに通常の workspace として残る。その後リポジトリへ移っても、グループには残ったまま所属が引き継がれる 
```

#### 23-cd-follow: 別のリポジトリへ移った先の項目に従わない（`SessionModel.transition`）

```
--- diff
-       if (exists) return layout;
      if (repoGroup !== null) return addItemToGroup(layout, to, repoGroup);
+       if (exists) return removeItem(layout, to);
      if (repoGroup !== null) return addItemToGroup(layout, to, repoGroup);
--- output
Running 1 test using 1 worker
[1/1] src/specs/workspace-groups.spec.ts:1800:3 › 先頭の pane の移動（AC11） › pane で別のリポジトリへ cd すると、移った先の項目に従う。リポジトリに所属が無ければグループの外へ出る
src/specs/workspace-groups.spec.ts:1800:3 › 先頭の pane の移動（AC11） › pane で別のリポジトリへ cd すると、移った先の項目に従う。リポジトリに所属が無ければグループの外へ出る
  1) src/specs/workspace-groups.spec.ts:1800:3 › 先頭の pane の移動（AC11） › pane で別のリポジトリへ cd すると、移った先の項目に従う。リポジトリに所属が無ければグループの外へ出る 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[g] g1 (1)",
    +   "[g] g1 (0)",
    +   "[u] グループなし (1)",
        "  wt* a-ws",
        "    wt mover",
    -   "[u] グループなし (0)",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1821:11
  1 failed
    src/specs/workspace-groups.spec.ts:1800:3 › 先頭の pane の移動（AC11） › pane で別のリポジトリへ cd すると、移った先の項目に従う。リポジトリに所属が無ければグループの外へ出る 
```

#### AC11 の 2 つ目（`cd(repoB)` の後が `cd(plain)` の後と同じで常に通っていた観測の組み替え。workspace-groups.spec.ts）

組み替え: 所属の無い別のリポジトリ C に workspace `c-ws` を先に開いておき、mover の最後の `cd` を C へ変えた。`w:<id>`（g1 の通常の行）が C へ移ると `repoGroups[C] = g1` になり C の項目が「グループなし」から g1 へ付いてくるので、`cd` の前後で並びが変わる（前: `g1 (2)`・`グループなし (1)` → 後: `g1 (3)`・`グループなし (0)`）。判定の反映前には通らない。製品の `SessionModel.ts` の `transition`（`w:<id>` → `r:R2`）の `const ownGroup = liveGroup(from.groupId);` を `liveGroup(null as unknown as undefined)`（groupId を引き継がない＝グループの外へ出す）に壊して `corepack pnpm build` し直し、`playwright test -g AC11` を走らせた生の出力（トレースの案内は省いた）。確認後に元へ戻して build し直した。

```
  ✓  1 src/specs/workspace-groups.spec.ts:1800:3 › 先頭の pane の移動（AC11） › pane で別のリポジトリへ cd すると、…(3.0s)
  ✘  2 src/specs/workspace-groups.spec.ts:1828:3 › 先頭の pane の移動（AC11） › git 管理外へ移ると、移る前のグループに通常の workspace として残る。その後リポジトリへ移っても、グループには残ったまま所属が引き継がれる (22.7s)
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
      Array [
    -   "[g] g1 (3)",
    +   "[g] g1 (1)",
        "  a-ws",
    +   "[u] グループなし (2)",
        "  mover",
        "  c-ws",
    -   "[u] グループなし (0)",
      ]
    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate
  1 failed
  1 passed (26.7s)
```
- T20（2 巡目まで）: 1 巡目 8 件（右クリックで見出しが畳まれる製品の不具合・壊して落ちる確認の欠け・反映待ちの欠け・常に通る観測・欠けた場面・AC 番号）を直し、2 巡目 2 件（AC11 の最後の観測が常に通る形・D39 の行番号の補足）も直した。上限の 2 巡で止め、再々点検はしていない [conv:e2e-observe-browser!]
- T21 [should] verification.md の repoKey の制約（フォルダ移動・改名）が未確認の推論の断定 → 「推論（未確認）」に直した [conv:-]
- T21 [should] 実機の手順 (4) が git 管理外（unmanaged）と紛らわしく推測の断定 → 「消えたフォルダ」だけに絞り「想定」とした [conv:-]
- T21 [nit] まとまり方の手順の文が通らない → 代表を閉じると 2 つ目が入る、に直した [conv:-]
- T21 [nit] メニューの出し分けの条件が文書間でそろっていない → tui-parity.md・tui.md にそろえた [conv:-]

### cross 点検の修正 壊して落ちる確認

- 対象: `commitWorkspace` の `settle()`（SessionModel.test.ts と SessionService.test.ts の新しいテスト）と、`takeChanges` が新規 workspace を順の比較に含める変更。壊しを元に戻して差分確認済み。

```
### 壊し1: commitWorkspace の settle() を外す
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — cross 点検: commitWorkspace は平らな順へ並べ直す > a workspace created while the ungrouped unit is above a real group lands in the flat order, and takeChanges reports the order
AssertionError: expected [ 'w1', 'w2' ] to deeply equal [ 'w2', 'w1' ]
- Expected
+ Received
 FAIL  src/session/SessionService.test.ts > SessionService — workspace grouping and ordering > createWorkspace publishes workspace.order_changed when the new workspace lands before the others (「グループなし」 above a group)
AssertionError: expected -1 to be greater than 0
 Test Files  2 failed (2)
      Tests  2 failed | 344 passed (346)
### 壊し2: takeChanges が新規 workspace を順の比較から除く（元の挙動）
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — cross 点検: commitWorkspace は平らな順へ並べ直す > a workspace created while the ungrouped unit is above a real group lands in the flat order, and takeChanges reports the order
AssertionError: expected null to deeply equal [ 'w2', 'w1' ]
- Expected:
+ Received:
 FAIL  src/session/SessionService.test.ts > SessionService — workspace grouping and ordering > createWorkspace publishes workspace.order_changed when the new workspace lands before the others (「グループなし」 above a group)
AssertionError: expected -1 to be greater than 0
 Test Files  2 failed (2)
      Tests  2 failed | 344 passed (346)
```
- cross [should] commitWorkspace が settle() を呼ばず、作成直後に Map の順とレイアウトの順が食い違う → settle() を呼び takeChanges を直した（回帰テスト 3 件・壊して落ちる確認つき） [conv:-]
- cross [nit] 追補 B 以前の古いコメント・旧語が残る → 指定箇所を直した（残りの旧語は指定外のテスト名等。D40） [conv:-]
- cross [nit] web と tui に itemGroupIdOf・groupsInLayoutOrder・itemWorkspaceIds・ドロップ判定が二重に書かれている → 実害が無いので直さず、60 review に委ねる [conv:-]
- cross [nit] 追補前の保存を読んだ直後、worktreeKey の null→文字列で全 workspace に publishSidebarChanges が走る（壊れはしない）→ 直さず、60 review に委ねる [conv:-]

### T29 壊して落ちる確認

- 各壊しは実装の該当行を 1 つ書き換えて走らせ、出力（vitest／playwright の生の出力から、落ちたテスト名・断言・件数の行を抜粋）を貼った。確認後は元に戻した（git diff で確認、build し直し済み）。

#### 壊し: 代表を「先に持った」でなく作った順（id の小さい順）で決める（既存の代表を奪う決め方に戻す）。SessionModel.settleRepresentatives
```
       × an earlier workspace judged later does NOT take over the representative: the one that held the folder first keeps it (T29) 9ms
       × T29: after reordering, another workspace that cds into the folder later (created and placed earlier than the representative) does not take the representative 2ms
       × T29: the representative leaving the folder hands it to the one that held the folder first among the rest 1ms
       × T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order 1ms
     × T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順 12ms
      Tests  5 failed | 219 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > an earlier workspace judged later does NOT take over the representative: the one that held the folder first keeps it (T29)
AssertionError: expected [ 'w1' ] to deeply equal [ 'w2' ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: after reordering, another workspace that cds into the folder later (created and placed earlier than the representative) does not t
AssertionError: expected false to be true // Object.is equality
```

#### 壊し: 保存した旗・既存の旗を無視して持ち始めた順だけで決める（pool = members）
```
       × T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order 9ms
     × T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順 21ms
      Tests  2 failed | 222 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order
AssertionError: expected false to be true // Object.is equality
```

#### 壊し: 代表が居なくなったときの次の代表を持ち始めた順でなく id 順にする
```
       × T29: after reordering, another workspace that cds into the folder later (created and placed earlier than the representative) does not take the representative 14ms
       × T29: the representative leaving the folder hands it to the one that held the folder first among the rest 1ms
     × T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順 11ms
      Tests  3 failed | 221 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: after reordering, another workspace that cds into the folder later (created and placed earlier than the representative) does not t
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: the representative leaving the folder hands it to the one that held the folder first among the rest
AssertionError: expected false to be true // Object.is equality
```

#### 壊し: restoreWorkspace が保存した representative を戻さない
```
       × T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order 8ms
     × T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順 17ms
      Tests  2 failed | 222 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order
AssertionError: expected false to be true // Object.is equality
```

#### 壊し: toSessionFileData が representative を書かない
```
     × T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順 15ms
      Tests  1 failed | 223 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代
AssertionError: expected [ [ 'w2', undefined ], …(1) ] to deeply equal [ [ 'w2', true ], [ 'w1', false ] ]
```

#### 壊し: 旗の無い保存の作った順（w<番号> の並べ）を外す
```
       × T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order 14ms
     × T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代表（保存した representative が作った順に勝つ）。旗の無い保存は作った順 25ms
      Tests  2 failed | 222 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — 保存 → 復元 → 最初の 1 周（実物の git・実物の session.json） > T29: 後から同じフォルダへ来た workspace は代表にならず、再起動をまたいでも同じ代
AssertionError: expected false to be true // Object.is equality
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: a restore keeps the saved representative even if it was created later; a save without the flag falls back to the creation order
AssertionError: expected false to be true // Object.is equality
```

#### 壊し: takeChanges の updated から旗の変化を外す（groupId が変わらない交代が配られない）
```
       × T29: a change of the representative flag is reported as workspace.updated even when the effective groupId does not change 11ms
      Tests  1 failed | 223 passed (224)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.test.ts src/session/SessionModel.clientAgreement.test.ts src/git/GitInfoPoller.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > T29: a change of the representative flag is reported as workspace.updated even when the effective groupId does not change
AssertionError: expected [] to deeply equal [ [ 'w2', true ] ]
```

#### 壊し: client-core の representativeOfKey がサーバの旗を無視して並びの順で決める（画面の単体テストと、サーバと画面の一致テスト）
```
     × T29: サーバが決めた旗（representative）があれば、並びの順に依らずそれに従う（先に並ぶ workspace が代表を奪わない） 7ms
      Tests  1 failed | 47 passed (48)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/workspace/workspaceGrouping.test.ts
     × T29: 「グループなし」を上に並べ替えた後に同じフォルダへ workspace が増えても、サーバが配る代表と画面の代表が一致し、worktree グループは崩れない 6ms
      Tests  1 failed | 6 passed (7)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session/SessionModel.clientAgreement.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/workspace/workspaceGrouping.test.ts > itemRefOf / repoMembers / isRepresentative（追補 01 A） > T29: サーバが決めた旗（representative）があれば、並びの順に依らずそれに従う（先に並ぶ workspace が代表を奪わ�
AssertionError: expected [ true, false ] to deeply equal [ false, true ]
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.clientAgreement.test.ts > サーバと画面は同じ純関数で同じ木になる（T19） > T29: 「グループなし」を上に並べ替えた後に同じフォルダへ workspace が増えても、サーバが配る代表
AssertionError: expected Set{ 'w1', 'w3' } to deeply equal Set{ 'w1', 'w2' }
```

#### 壊し（E2E）: client-core の representativeOfKey が旗を無視して並びの順で決める（build し直して workspace-groups.spec.ts -g T29。製品の元の不具合の再現）
```

Running 1 test using 1 worker

  ✘  1 src/specs/workspace-groups.spec.ts:1191:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › T29: 「グループなし」をグループより上に並べ替えてから worktree の workspace を選んで「＋ 新規」し�


  1) src/specs/workspace-groups.spec.ts:1191:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › T29: 「グループなし」をグループより上に並べ替えてから worktree の workspace を選んで「＋ 新規」して�

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 4
    + Received  + 4

      Array [
    -   "[u] グループなし (1)",
    -   "  second-ws",
    -   "[g] g1 (1)",
    +   "[u] グループなし (0)",
    +   "[g] g1 (2)",
        "  wt* main-ws",
    -   "    wt same-1",
    +   "    wt second-ws",
    +   "  same-1",
      ]

    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate

```

- E2E の元の不具合の再現: 壊すと「＋ 新規」の workspace が worktree グループの子（`wt second-ws`）になり、元の代表 same-1 が通常の行へ降格する。
- T29 [should] 再起動をまたぐと「次の代表」が変わりうる（heldSince がメモリのみ）→ 依頼元の決定（順を持てないなら作った順）の範囲として D42 に制約を明記 [conv:-]
- T29 [nit] flattenWorkspaceIds のコメントが古い → 直した [conv:-]

### T30 壊して落ちる確認

共有の純関数 `dropBefore`（client-core/src/workspace/dropTarget.ts）を壊し、client-core を build し直して各パッケージのテストを流した。確認後は元に戻して build し直し、git diff で戻りを確認した。

```
##### A: 常に落とした項目の前
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/workspace/dropTarget.test.ts
      Tests  3 failed | 4 passed (7)
 FAIL  src/workspace/dropTarget.test.ts > dropBefore（ドラッグの before の決め方） > グループ・「グループなし」の項目も同じ決まり
 FAIL  src/workspace/dropTarget.test.ts > dropBefore（ドラッグの before の決め方） > 下へ動かして落とした項目が最後なら null（末尾）
 FAIL  src/workspace/dropTarget.test.ts > dropBefore（ドラッグの before の決め方） > 下へ動かすなら、落とした項目の次の前
AssertionError: expected { item: { kind: 'ungrouped' }, …(1) } to deeply equal { item: { kind: 'group', …(1) }, …(1) }
AssertionError: expected { …(2) } to be null
AssertionError: expected { …(2) } to deeply equal { …(2) }
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/input
      Tests  8 failed | 86 passed (94)
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落�
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > 項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspac
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」）
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/Sidebar.test.ts
      Tests  8 failed | 144 passed (152)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 子の行を掴むと、worktree グループ（先頭の worksp
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループのヘッダー行をドラッグすると、そのグループの全メンバー id をまとめて動かす（AC9）
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > ドラッグ中にグループの構成が変わっても、開始時点のメンバー集合で移動する
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 下へ動かして最後
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 下へ動かすと、落
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 古いサーバ（layout
##### B: 末尾でも落とした項目の前
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/workspace/dropTarget.test.ts
      Tests  2 failed | 5 passed (7)
 FAIL  src/workspace/dropTarget.test.ts > dropBefore（ドラッグの before の決め方） > グループ・「グループなし」の項目も同じ決まり
 FAIL  src/workspace/dropTarget.test.ts > dropBefore（ドラッグの before の決め方） > 下へ動かして落とした項目が最後なら null（末尾）
AssertionError: expected { item: { kind: 'group', …(1) }, …(1) } to be null
AssertionError: expected { …(2) } to be null
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/input
      Tests  7 failed | 87 passed (94)
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落�
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > layout の無い古いサーバ（workspace.move_to） > 項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspac
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」）
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前
 FAIL  src/input/mouse.sidebarDrag.test.ts > サイドバーのドラッグ（項目単位） > 名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/Sidebar.test.ts
      Tests  5 failed | 147 passed (152)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 子の行を掴むと、worktree グループ（先頭の worksp
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループのヘッダー行をドラッグすると、そのグループの全メンバー id をまとめて動かす（AC9）
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > ドラッグ中にグループの構成が変わっても、開始時点のメンバー集合で移動する
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 下へ動かして最後
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 閾値を超えて動かし別の行の上で離すと moveItemByDrag(自分の項目, 相手の項目, 古いサーバ用の id) を呼ぶ
AssertionError: expected "vi.fn()" to be called with arguments: [ { kind: 'workspace', …(1) }, …(2) ]
```

web の Sidebar.vue で `moveItemByDrag(draggedRow.item, drop.before, …)` を `drop.row.item`（落とした項目の前）へ戻した場合と、A を E2E（ブラウザ・全体 build 後）で流した場合。

```
##### C: web が常に落とした項目の前を送る
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/components/Sidebar.test.ts
      Tests  8 failed | 144 passed (152)
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > worktree グループ（子を掴んでも動くのは worktree グループ全体） > 子の行を掴むと、worktree グループ（先頭の worksp
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > グループのヘッダー行をドラッグすると、そのグループの全メンバー id をまとめて動かす（AC9）
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > ドラッグ中にグループの構成が変わっても、開始時点のメンバー集合で移動する
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 下へ動かして最後
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 下へ動かすと、落
 FAIL  src/components/Sidebar.test.ts > Sidebar — workspace 行の D&D（20260923-workspace-grouping） > 落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null） > 古いサーバ（layout
##### D(E2E): 常に落とした項目の前
  ✘  1 src/specs/workspace-groups.spec.ts:1155:3 › ドラッグ › 下へ・末尾へのドラッグ：グループの中（AC5） (23.0s)
  ✘  2 src/specs/workspace-groups.spec.ts:1209:3 › ドラッグ › 下へ・末尾へのドラッグ：「グループなし」の中（AC5） (22.6s)
  ✘  3 src/specs/workspace-groups.spec.ts:1262:3 › ドラッグ › 下へ・末尾へのドラッグ：一番上のまとまり（グループ・グループなし）どうし（AC5・AC20） (22.3s)
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 1
    Error Context: test-results/workspace-groups-ドラッグ-下へ・末尾へのドラッグ：グループの中（AC5）/error-context.md
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 1
    Error Context: test-results/workspace-groups-ドラッグ-下へ・末尾へのドラッグ：「グループなし」の中（AC5）/error-context.md
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 2
    + Received  + 2
    Error Context: test-results/workspace-groups-ドラッグ-下へ・末-4c198-り（グループ・グループなし）どうし（AC5・AC20）/error-context.md
  3 failed
```
- T30 [nit] D43 の docs の記述が事実と合わない → 直した [conv:-]
- T30 [nit] dropBefore の結果を moveItem に通すテストが無い → 点検が一時テストで全組を確認（off-by-one なし）。恒久テストは足さず review に委ねる [conv:-]
- T30 [nit] 古いサーバでは web と tui の落とす位置が食い違う → D43 に明記済みの意図（経路は変更前と同じ） [conv:-]

### T31 壊して落ちる確認（`parseAbsoluteGitPath` の検査を外して `return lines[0]` だけにした）
```
 ❯ src/git/worktree.test.ts (12 tests | 1 failed) 8ms
     × 知らないオプションの出力・相対パス・行数の違い・空は null 3ms
 ❯ src/git/GitInfoPoller.test.ts (60 tests | 9 failed) 2883ms
       × --git-common-dir の出力が絶対パス 1 行でなければ unknown（知らないオプションがそのまま出る） 6ms
       × --git-dir の出力が絶対パス 1 行でなければ unknown（知らないオプションがそのまま出る） 1ms
       × --git-common-dir の出力が絶対パス 1 行でなければ unknown（相対パス） 1ms
       × --git-dir の出力が絶対パス 1 行でなければ unknown（相対パス） 0ms
       × --git-common-dir の出力が絶対パス 1 行でなければ unknown（行数が多い） 0ms
       × --git-dir の出力が絶対パス 1 行でなければ unknown（行数が多い） 0ms
       × --git-common-dir の出力が絶対パス 1 行でなければ unknown（空） 1ms
       × --git-dir の出力が絶対パス 1 行でなければ unknown（空） 0ms
       × 実物の git: 知らないオプションは出力に混ざって終了コード 0 になる（前提）・その出力は検査で弾かれる 26ms
⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-common-dir の出力が絶対パス 1 行でなければ unknown（知らないオプションがそのまま出る）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir の出力が絶対パス 1 行でなければ unknown（知らないオプションがそのまま出る）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-common-dir の出力が絶対パス 1 行でなければ unknown（相対パス）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir の出力が絶対パス 1 行でなければ unknown（相対パス）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-common-dir の出力が絶対パス 1 行でなければ unknown（行数が多い）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir の出力が絶対パス 1 行でなければ unknown（行数が多い）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-common-dir の出力が絶対パス 1 行でなければ unknown（空）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir の出力が絶対パス 1 行でなければ unknown（空）
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > 実物の git: 知らないオプションは出力に混ざって終了コード 0 になる（前提）・その出力は検査で弾かれる
 FAIL  src/git/worktree.test.ts > parseAbsoluteGitPath > 知らないオプションの出力・相対パス・行数の違い・空は null
 Test Files  2 failed | 1 passed (3)
      Tests  10 failed | 101 passed (111)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/git
```
検査を戻すと src/git は 111 passed。
- T31 [should] Windows で repoKey の文字列の形が変わる（旧 resolve → git の出力そのまま）→ resolve を通して同じ形にそろえた（実測は実機の確認項目） [conv:-]
- T31 [nit] 正常な出力（CRLF・空白・日本語）のテストが無い → 足した [conv:-]
- T31 [nit] repoNameOf が別経路である点が docs に無い → D44 に記録（repoKey には関与しない） [conv:-]


### T32 壊して落ちる確認

`SessionFile.ts` の `repoGroups` の `.catch(undefined)` を外して `vitest run src/persist/SessionFile.test.ts`:

```
     × repoGroups が壊れた形（配列）なら repoGroups だけ捨て、残りは読める 14ms
     × repoGroups が壊れた形（値が文字列でない）なら repoGroups だけ捨て、残りは読める 6ms
     × repoGroups が壊れた形（文字列）なら repoGroups だけ捨て、残りは読める 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/persist/SessionFile.test.ts > FsSessionFile > repoGroups が壊れた形（配列）なら repoGroups だけ捨て、残りは読める
 FAIL  src/persist/SessionFile.test.ts > FsSessionFile > repoGroups が壊れた形（値が文字列でない）なら repoGroups だけ捨て、残りは読める
 FAIL  src/persist/SessionFile.test.ts > FsSessionFile > repoGroups が壊れた形（文字列）なら repoGroups だけ捨て、残りは読める
      Tests  3 failed | 11 passed (14)
```
戻すと 14 passed。`layoutConfirmWiring.test.ts` の陽性の対照は、それ自体が「同じ待ちで確定が起きる」ことの観測（元のテストと対）。

### 直さないもの（review-findings-01）

- `containerOf`・`listOf` がサーバと client-core に二重にある件は、直さない（同じ定義を 2 つのパッケージが持つ。共有の置き場所を作る費用に見合わないと判断。変えるときは両方を同時に直す）。
- T32 [should] orderedWorkspaceIds の撤去で docs/herdr-parity.md:58 に死んだ参照が残る → 現状の画面の木の順（visibleWorkspaceIdsInOrder）に直した [conv:-]
- T32 [nit] D46 の「決定的に落ちる」が 5 回の観測の言い過ぎ → 「この環境で各 5 回」に表現を合わせた [conv:-]

### T33 壊して落ちる確認

壊し方: `sidebarLayout.ts` の `keepRepresentativesFirst` の `positions.length < 2 || flagged.has(key)` から `|| flagged.has(key)` を外し（旗のある worktree でも代表を先に置く入れ替えを復活）、build して流した。確認後に元へ戻し build し直した。

単体（client-core の sidebarLayout.test.ts・server の src/session）:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/workspace/sidebarLayout.test.ts > flattenWorkspaceIds（T33: 旗のある worktree は木の順のまま） > 旗で代表が決まっている worktree は、平らな順を木の順のまま返す（代表を先に置く入れ替えをしない）
AssertionError: expected [ 'wb', 'd', 'm', 'wa', 'e' ] to deeply equal [ 'e', 'd', 'm', 'wa', 'wb' ]
      Tests  1 failed | 24 passed (25)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/workspace/sidebarLayout.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/session/SessionModel.clientAgreement.test.ts > サーバと画面は同じ純関数で同じ木になる（T19） > 操作のたびに、サーバの並び・実効の groupId・配るレイアウトが画面の木と一致する（入れる・外す・並べ替える・グループの削除・代表の交代）
AssertionError: moveItemBy (group): tree order: expected [ 'w5', 'w4', 'w1', 'w2', 'w3', 'w6' ] to deeply equal [ 'w2', 'w4', 'w1', 'w5', 'w3', 'w6' ]
 FAIL  src/session/SessionModel.clientAgreement.test.ts > サーバと画面は同じ純関数で同じ木になる（T19） > T29: 「グループなし」を上に並べ替えた後に同じフォルダへ workspace が増えても、サーバが配る代表と画面の代表が一致し、worktree グループは崩れない
AssertionError: judged: tree order: expected [ 'w3', 'w1', 'w2' ] to deeply equal [ 'w2', 'w1', 'w3' ]
 FAIL  src/session/SessionModel.clientAgreement.test.ts > サーバと画面は同じ純関数で同じ木になる（T19） > T33: linked worktree が 2 つ（M・Wa・Wb）で、2 つ目の Wb を選んで＋新規しても、worktree グループの子の順は変わらず、settle は何度呼んでも同じ（画面とサーバの一致）
AssertionError: judged: flatten: expected [ 'w3', 'w1', 'w4', 'w2' ] to deeply equal [ 'w3', 'w1', 'w2', 'w4' ]
 FAIL  src/session/SessionModel.test.ts > SessionModel — sidebar layout > the representative of a worktree (worktreeKey) > the flat order follows the layout tree as is (T33); the representative does not change even when a non-representative is placed before it
AssertionError: expected 1 to be less than 0
      Tests  4 failed | 530 passed (534)
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/session
```

E2E（`workspace-groups.spec.ts -g T33`。子の順が M>Wb>Wa に変わる）:

```

Running 1 test using 1 worker

  ✘  1 src/specs/workspace-groups.spec.ts:1405:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › T33: linked worktree が 2 つの形で、「グループなし」を上に並べ替えてから 2 つ目の worktree の workspace を選んで「＋ 新規」しても、worktree グループの子の順は変わらず、新しい行は通常の行 (22.8s)


  1) src/specs/workspace-groups.spec.ts:1405:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › T33: linked worktree が 2 つの形で、「グループなし」を上に並べ替えてから 2 つ目の worktree の workspace を選んで「＋ 新規」しても、worktree グループの子の順は変わらず、新しい行は通常の行 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Array [
        "[u] グループなし (1)",
        "  second-ws",
        "[g] g1 (1)",
        "  wt* main-ws",
    -   "    wt wa-ws",
        "    wt wb-ws",
    +   "    wt wa-ws",
      ]

    Call Log:
    - Timeout 20000ms exceeded while waiting on the predicate

      159 |   await expect
      160 |     .poll(() => outline(page), { timeout: SETTLE, ...(message ? { message } : {}) })
    > 161 |     .toEqual(expected);
          |      ^
      162 | }
      163 |
      164 | /** ラベルが完全一致する行（見出しも workspace も `.sidebar-label`）。 */
        at expectOutline (/workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:161:6)
        at /workspaces/sodashitsu/packages/e2e/src/specs/workspace-groups.spec.ts:1436:11

    Error Context: test-results/workspace-groups-同じフォルダの-2-cbb40-ree-グループの子の順は変わらず、新しい行は通常の行/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/workspace-groups-同じフォルダの-2-cbb40-ree-グループの子の順は変わらず、新しい行は通常の行/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/workspace-groups-同じフォルダの-2-cbb40-ree-グループの子の順は変わらず、新しい行は通常の行/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/workspace-groups.spec.ts:1405:3 › 同じフォルダの 2 つ目の workspace（追補 01 A・AC19） › T33: linked worktree が 2 つの形で、「グループなし」を上に並べ替えてから 2 つ目の worktree の workspace を選んで「＋ 新規」しても、worktree グループの子の順は変わらず、新しい行は通常の行 
```
- T33 [nit] 旗の無い経路は本番では通らず D47 の理由づけが不正確 → コメントと D47 に「純関数としての互換」と書き直した [conv:-]
- T33 [nit] 旗あり／旗なしの混在のテストが無い → T35 で足す [conv:-]

### T34 壊して落ちる確認（`parseAbsoluteGitPath` を 1 つずつ壊した。各確認の後に元へ戻した）

```
=== 古い git の分岐を無効化(if (false))
     × 古い git: 1 行目が --path-format=absolute なら、残りの行を cwd から解決する（相対も絶対も。decisions D48） 3ms
       × 古い git（1 行目が --path-format=absolute）: 残りの相対／絶対パスを cwd から解決して git を返す（--git-common-dir・--git-dir の両方。本体） 6ms
       × 古い git: linked worktree（どちらも絶対） 1ms
       × 実物の git: 知らないオプションは出力に混ざって終了コード 0 になる（前提）・古い git と同じ形なので残りを cwd から解決する 26ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > 古い git（1 行目が --path-format=absolute）: 残りの相対／絶対パスを cwd から解決して git を返す（--git-common-dir・--git-dir の両方。本体）
AssertionError: expected { kind: 'unknown' } to deeply equal { kind: 'git', git: { …(6) } }
- Expected
+ Received
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > 古い git: linked worktree（どちらも絶対）
AssertionError: expected { kind: 'unknown' } to deeply equal { kind: 'git', git: { …(6) } }
- Expected
+ Received
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > 実物の git: 知らないオプションは出力に混ざって終了コード 0 になる（前提）・古い git と同じ形なので残りを cwd から解決する
AssertionError: expected { kind: 'unknown' } to match object { kind: 'git', git: { …(2) } }
- Expected
=== resolve(cwd, rest) を resolve(rest) に
     × 古い git: 1 行目が --path-format=absolute なら、残りの行を cwd から解決する（相対も絶対も。decisions D48） 4ms
       × 古い git（1 行目が --path-format=absolute）: 残りの相対／絶対パスを cwd から解決して git を返す（--git-common-dir・--git-dir の両方。本体） 7ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > 古い git（1 行目が --path-format=absolute）: 残りの相対／絶対パスを cwd から解決して git を返す（--git-common-dir・--git-dir の両方。本体）
AssertionError: expected { kind: 'git', git: { …(6) } } to deeply equal { kind: 'git', git: { …(6) } }
- Expected
+ Received
 FAIL  src/git/worktree.test.ts > parseAbsoluteGitPath > 古い git: 1 行目が --path-format=absolute なら、残りの行を cwd から解決する（相対も絶対も。decisions D48）
AssertionError: expected '/workspaces/sodashitsu/packages/serve…' to be '/c/r/.git' // Object.is equality
Expected: "/c/r/.git"
Received: "/workspaces/sodashitsu/packages/server/.git"
      Tests  2 failed | 120 passed (122)
=== 残りの行の -- 検査を外す
     × 壊れた出力は null（別のオプション・行数の違い・相対パスだけ・空） 4ms
       × --git-common-dir の出力が壊れていれば unknown（古い git で残りが別のオプション） 8ms
       × --git-dir の出力が壊れていれば unknown（古い git で残りが別のオプション） 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-common-dir の出力が壊れていれば unknown（古い git で残りが別のオプション）
AssertionError: expected { kind: 'git', git: { …(6) } } to deeply equal { kind: 'unknown' }
- Expected
+ Received
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir の出力が壊れていれば unknown（古い git で残りが別のオプション）
AssertionError: expected { kind: 'git', git: { …(6) } } to deeply equal { kind: 'unknown' }
=== 古い git の行数検査を外す
     × 壊れた出力は null（別のオプション・行数の違い・相対パスだけ・空） 3ms
       × --git-common-dir の出力が壊れていれば unknown（古い git で残りの行が多い） 7ms
       × --git-dir の出力が壊れていれば unknown（古い git で残りの行が多い） 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-common-dir の出力が壊れていれば unknown（古い git で残りの行が多い）
AssertionError: expected { kind: 'git', git: { …(6) } } to deeply equal { kind: 'unknown' }
- Expected
+ Received
 FAIL  src/git/GitInfoPoller.test.ts > DefaultGitInfoPoller — probe の結果と最初の 1 周の合図 > 単体（偽の git） > --git-dir の出力が壊れていれば unknown（古い git で残りの行が多い）
AssertionError: expected { kind: 'git', git: { …(6) } } to deeply equal { kind: 'unknown' }
```

### T34 点検の修正（(c) 古い git の相対パスの linked worktree）壊して落ちる確認

`worktree.ts` の `return resolve(cwd, rest);` を `return rest;`（cwd から解決しない）に壊して `GitInfoPoller.test.ts` を流した生の出力（確認後に元へ戻した）:

```
       × 古い git（1 行目が --path-format=absolute）: 残りの相対／絶対パスを cwd から解決して git を返す（--git-common-dir・--git-dir の両方。本体） 7ms
       × 古い git: linked worktree の相対パス（../ を cwd から解決。--git-common-dir・--git-dir の両方。isLinkedWorktree が true） 1ms
       × 実物の linked worktree + 古い git の再現（出力を相対パスに差し替える）: 本体と同じ repoKey で isLinkedWorktree=true 63ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
- Expected
+ Received
-     "repoKey": "/r/.git",
-     "worktreeKey": "/r/.git",
+     "repoKey": ".git",
+     "worktreeKey": ".git",
- Expected
+ Received
-     "repoKey": "/r/.git",
-     "worktreeKey": "/r/.git/worktrees/w",
+     "repoKey": "../../r/.git",
+     "worktreeKey": "../../r/.git/worktrees/w",
Expected: ".git"
Received: "../soda-gitpoller-plain-8vNaI5/.git"
      Tests  3 failed | 67 passed (70)
```

### T35 (B) 同じ周で届いた判定を作った順で反映する 壊して落ちる確認

(1) `pollNow` の反映を従来の「届いた順（`Promise.all(workspaces.map(pollWorkspace))`）」へ戻した出力（1 つ目の判定を遅らせた向きで落ちる。2 つ目を遅らせた向きは届いた順でも a が先に反映されて通る）。(2) `judged.sort(...)` だけを外した出力（平らな順で b が a の前に居るテストが落ちる）:

```
     × 同じフォルダの 2 つの workspace の判定が同じ周で届く順（b が先）に依らず、作った順の a が代表になる 185ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
      Tests  1 failed | 71 passed (72)
     × 平らな順で b が a より前に居ても（判定が届く順・平らな順に依らず）作った順の a が代表になる 34ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
      Tests  1 failed | 72 passed (73)
```

### T35 (f) 旗のある／無い worktreeKey が混ざった入力 壊して落ちる確認

`keepRepresentativesFirst` の `flagged.has(key)` を外した出力（旗のある key まで入れ替わる）:

```
     × 旗で代表が決まっている worktree は、平らな順を木の順のまま返す（代表を先に置く入れ替えをしない） 5ms
     × 旗のある key（kA）は木の順のまま（代表 wb より非代表 e が前でも入れ替えない）、旗の無い key（kB）だけ代表 p が前へ 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [ 'wb', 'd', 'm', 'wa', 'e' ] to deeply equal [ 'e', 'd', 'm', 'wa', 'wb' ]
- Expected
+ Received
-   "e",
+   "wb",
-   "wb",
+   "e",
AssertionError: expected [ 'wb', 'p', 'm', 'e', 'q' ] to deeply equal [ 'e', 'p', 'm', 'wb', 'q' ]
- Expected
+ Received
-   "e",
+   "wb",
-   "wb",
+   "e",
      Tests  2 failed | 24 passed (26)
```

入れ替えを全部やめた出力（旗の無い key の代表が前へ来ない）:

```
     × AC19: r: の展開は代表だけ。代表でない workspace は w: の位置に出る 5ms
     × AC19: 代表でない workspace を代表の前へ並べても、代表は同じ worktree の workspace の一番前に残る（代表が入れ替わり続けない） 1ms
     × 旗のある key（kA）は木の順のまま（代表 wb より非代表 e が前でも入れ替えない）、旗の無い key（kB）だけ代表 p が前へ 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [ 'q', 'p' ] to deeply equal [ 'p', 'q' ]
- Expected
+ Received
-   "p",
+   "p",
AssertionError: expected [ 'q', 'a', 'p' ] to deeply equal [ 'p', 'a', 'q' ]
- Expected
+ Received
-   "p",
-   "a",
+   "a",
+   "p",
AssertionError: expected [ 'e', 'q', 'm', 'wb', 'p' ] to deeply equal [ 'e', 'p', 'm', 'wb', 'q' ]
- Expected
+ Received
-   "p",
+   "q",
-   "q",
+   "p",
      Tests  3 failed | 23 passed (26)
```
- T35 [should] pollNow が全 workspace の判定を待つ代償（遅い 1 件で全体が遅れる・周が重なる）が decisions に無い → D49 補足に明記（許容） [conv:-]
- T35 [should] 単独の見直し（followMoves）と周の競合の実害が D49 の制約より広い → D49 補足に (a)(b) を明記（許容） [conv:-]
- T35 [nit] 判定が届く順のテストの片向きが元のコードでも通る・保存からの復元を通していない・reject と w10/w9 の観測が無い → 記録のみ（片向きで壊して落ちる確認はある） [conv:regression-negative-control]
