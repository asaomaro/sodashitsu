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
