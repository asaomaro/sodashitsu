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
