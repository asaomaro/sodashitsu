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
