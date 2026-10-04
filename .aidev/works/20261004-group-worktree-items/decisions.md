# 判断の記録: 20261004-group-worktree-items

## D1: 利用者が決めた方針（2026-10-04。ask-form と AskUserQuestion の回答）

- worktree グループは herdr 準拠で、中の workspace の出し入れは不可（閉じるのは可）。通常の workspace と worktree グループ丸ごとを「グループ」に登録できる。入れ子は 1 段。
- 所属はリポジトリ単位で覚える。全部閉じて開き直しても同じグループに戻る。新しく開いた worktree は自動で同じ worktree グループ・同じグループに入る。
- 先頭の pane が cd で別のリポジトリへ移ったら、移った先に従う（今の動きのまま）。
- 既存データは本体の所属に合わせる。グループの先頭の行に種類の印を付ける。呼び名は「グループ」「worktree グループ」。
- 端末版も、ブラウザ版と同じところまで含める（worktree グループの折りたたみの入口・グループ全体のドラッグを含む）。
- 次の作業（この work の対象外）: グラフ 1 枚の単位を「サイドバーの一番上のまとまり」にする・workspace を枠で囲む・単位をまたぐ線は端の出入口として見せる・保存は 1 つのまま・タブの階層は作らない・タグは作らない。
- 利用者の使い方: worktree はときどき使う。手動グループは 1 つの仕事のまとまりとして使っている。
- 実装フェーズは、sodactl で別の pane に起動した Claude Code（sonnet）に任せる（利用者の指示）。

## D2: 移行の時点（requirements F13 とのずれ）

F13 は「本体の判定がまだ取れていない間は決めず、取れた時点で決める」。設計では、**起動後の最初の 1 周の確認が終わった時点（または最初の操作の時点）で、取れている判定で確定する**。判定が取れない workspace（消えたフォルダに居る pane 等）が 1 つでも残ると、全体の移行が止まり続けるため（design の独立点検の指摘）。本体の判定が 1 周目で取れなかった場合だけ、F13 と結果が違いうる（その workspace は後からリポジトリの所属に従って加わる）。

## D3: 「判定が付く」ときの所属の決め方

`repoGroups[R]` を先に見る。無く、判定が付いた workspace が利用者の操作でグループ G に入っていれば、R の所属を G にして `r:R` 丸ごと G へ移す。届く順に依らない結果にするため（design の独立点検の指摘。requirements F6 の 3 つ目・AC11 を満たす）。

## D4: 設計の独立点検で直したもの（12 件）

移行待ちの間に保存すると移行が失われる → 仮の状態では `layout` を書かない／移行待ちの間の判定の扱い → 仮の状態は `layoutFromLegacy` で毎回導く／キーボードでグループを動かす・畳む入口が無い → navigate の選択を行に広げ、`navigate_toggle_collapse` を足す／項目の中の順の出所 → Map の順が正／workspace が無くなる 5 経路 → モデルの削除の 1 か所／配信の途中の状態の描き方／古いサーバでの出し入れ・グループの作成／古い画面のグループ全体のドラッグ／HEAD は取れたが共通ディレクトリが取れない判定 → 「取れない」に寄せる／イベント名を `sidebar.layout_changed` に。

## D5: タスクの独立点検で決めたこと

- **仮の状態でも `layout` を配る**（スナップショットとイベント）。載せないと、新しい画面が古いサーバと見なして古い RPC を送り、それが確定のきっかけになって途中でレイアウトが届く。画面は仮か確定かを区別しない。
- **design「エラー処理」の「移行待ちなら移行しない」は D2 と食い違っていたので直した**（判定が取れない workspace を含めて、最初の 1 周の後に確定する）。
- **層の決まりを守る**: `SessionModel` は副作用なし。モデルは「変わったもの（レイアウト・平らな順・実効の `groupId` が変わった workspace）」を返し、`SessionService` の共通の出口 1 つが 3 つのイベントと `persist.touch()` を行う。`workspace.closed` を出す 5 経路はその出口を呼ぶ。
- **途中でビルドを壊さないための名前**: 新しい順の関数は `visibleWorkspaceIdsOfTree` の名前で足し、古い関数を消すタスクで元の名前へ戻す。
- **新しい navigate のキーの定義は、web と端末版に共通の独立したタスクにする**（`Action` の型を広げると、端末版の型検査が落ちるため。server は tui を参照しているのでビルドも止まる）。
- **描画の順とキー操作の順を同じタスクで替える**（前の work で、描画だけ替えてキー操作の順が古いまま残る回帰が review まで残った）。

## D6: 古い画面は知らないイベント `sidebar.layout_changed` を無視する（T1 で `main` の版のコードで確認）

- 経路は 3 つとも、知らない `event` を落とす。
  - `client-core` の `Connection.handleText`: `"event" in msg` なら `pane.size_changed` 以外は無条件で `store.applyEvent(event)` へ渡すだけ（スキーマ検証も例外も無い）。
  - web の `StoreAdapter.applyEventToSession`: `switch (e.event)` に `default` が無く、知らないイベントは何もしない。続く `applyViewRepair` は `repairView` が構造に変化が無ければ null を返すので無害。
  - 端末版の `SessionModel.applyToSession`: `default: return;`（コメントのとおり未使用のイベントを捨てる）。その後の `repair`・`emit` は無害。
- よって新しいサーバが `sidebar.layout_changed` を配っても古い画面は壊れない。止める必要は無く、実装を進めた。
- `ItemTarget` は model.ts の型、zod は `ItemTargetSchema`（`export *` で型と値が同名になるのを避けた）。`SidebarLayoutSchema` は保存・配信用の形で、未知のキーは落とし、参照の中身（`g:`/`r:`/`w:` 以外）は問わない。

## D7: `visibleWorkspaceIdsOfTree` の引数と、畳んだグループの中の見え方（T2）

- 引数は `(tree, collapsedRepos, focusedWorkspaceId)`。design の `collapsedGroups` は渡さない（グループの折りたたみは木の `group.collapsed` に載っているため。worktree グループの折りたたみ `collapsedAutoGroups` だけが画面の設定）。
- 畳んだグループの中は、今いる workspace の行だけ（worktree グループの先頭でも子でも、その行 1 つだけ。AC6）。グループが開いていて worktree グループだけ畳んだときは、先頭と今いる子。
- `topUnitOf` は、2 つ以上の workspace を持つリポジトリだけ `repo`、1 つなら `workspace`（通常の行）を返す。グループの存在は `layout.groups` のキーと `layout.top` の `g:` から判断する（`groups` を引数に取らないため）。
- `sidebarTree` の「レイアウトの一番上に無いグループ」は、一番上の末尾に足す（中身は `layout.groups` の順。先に一番上で見つかった項目は重複させない）。

## D8: レイアウト操作の純関数の形（T3）

- どれも引数を書き換えず新しい `SidebarLayout` を返し、**変わらないときは同じ参照**を返す（サーバは `===` で「変わったか」を見られる）。`moveItem`・`moveItemBy` だけ `{ layout, moved }` を返す。`moved` は「受け付けたか」で、位置が変わらない移動（すぐ後ろの項目の前へ、など）は受け付けて `true`（同じ参照）。受け付けないのは、項目が無い・自分自身の前・`before` が別の入れ物。端での `moveItemBy` は巡回せず `moved: false`。
- 入れ物は `null`（一番上）か `GroupId`。項目の参照（`ItemRef`）で扱い、`ItemTarget`（workspace を指す形）から参照への読み替えは workspace の一覧が要るのでサーバ側（T7・T8）で行う。
- `insertItem`・`addItemToGroup` は、グループの中へ `g:` を入れず、存在しないグループ（`groups` にキーが無い）へも入れない。`removeItem` は空になっても `groups[...]` のキーを残す。
- `flattenWorkspaceIds(layout, workspaces)`: `r:` は `repoMembers` の順、`g:` は中身を展開、実在しない参照は飛ばし重複は先のもの、どの項目にも現れない workspace は `workspaces` の順で末尾。
- `repairLayout(layout, workspaces, groups)`: 参照は `itemRefOf(workspace)` のどれかと一致するときだけ有効（`w:` なのに repoKey を持つ workspace の参照は捨て、判定どおり `r:` を末尾へ足す）。つまり**復元時に `repoKey` が戻っていることが前提**（T9）。グループは `groups`（`WorkspaceGroup[]`）に実在するものだけ。捨てた参照は `dropped` で返す。

## D9: `repoKey` は `git rev-parse --path-format=absolute --git-common-dir` で取る（T4。利用者の決定 A）

- **理由**: 本体の cwd が symlink 経由のとき、`--git-common-dir` は相対の `.git` を返し、cwd に対して解決すると本体は `.../link/.git`、worktree（`.git` ファイルが実体を指す）は `.../real/.git` とずれる。`repoKey` は保存のキーなので、ずれると本体と worktree が別の項目になる。`--path-format=absolute` なら git が実体のパスで返し、link・link/deep/dir・real・worktree・worktree への symlink の全部が `.../real/.git` で一致した（実物の git 2.43.0、結合テストで固定）。
- `isLinkedWorktree` の比較に使う `--git-dir` も同じ形式（`--path-format=absolute`）に揃えた。
- **git 2.31 以上が要る**（`--path-format` の導入）。古い git ではオプションが失敗し、`--git-common-dir` の失敗として「取れない」（`unknown`）になる。判定が付かないだけで、直前の判定は保たれる。
- `WorktreeService.repoNameOf`（名前の取り出し）は今までどおり `resolveCommonDir` を使う（名前しか使わないので symlink の違いは効かない）。

## D10: `repoKey` の未確認ケースを実物の git で確かめた結果（T4）

実物の git 2.43.0。いずれも `--path-format=absolute` 付き。

| ケース | `--abbrev-ref HEAD` | `repoKey`（`--git-common-dir`） | 扱い |
|---|---|---|---|
| symlink 経由の本体（link・link/deep/dir） | 取れる | `.../real/.git`（実体） | 本体・worktree と一致 |
| symlink 経由の worktree（wtlink） | 取れる | `.../real/.git` | 一致。`isLinkedWorktree=true` |
| bare リポジトリ（`bare.git`）とその worktree | 取れる | どちらも `.../bare.git` | 一致。bare 自身は `isLinkedWorktree=false`。worktree だけの項目になる（本体の行は無い。`repoMembers` の「本体が無ければ先頭が暫定の頭」） |
| サブモジュール | 取れる | `<親>/.git/modules/<名前>`（親と別） | 親とは別のリポジトリとして扱う（親の worktree グループには入らない）。意図どおり |
| コミットが 1 つも無いリポジトリ | **失敗**（終了コード 128） | （聞かない） | `unmanaged`（管理外と同じ）。最初のコミットの後の判定で git に変わる |
| 消えたフォルダ | 起動できず reject | （聞かない） | `unknown`（取れない。直前の判定を保つ） |
| git 管理外 | 失敗（128） | （聞かない） | `unmanaged` |

- 本体と worktree で値がずれるケースは、A の採用後は見つからなかった。
- `probe` の結果の決め方: HEAD の終了コードが 0 でなければ `unmanaged`（確定）／reject（時間切れ・起動失敗）・`--git-common-dir` か `--git-dir` の失敗は `unknown`。
- 起動後の最初の 1 周の合図 `onFirstRoundDone` は `DefaultGitInfoPoller` のクラスだけに置いた（`GitInfoPoller` インターフェースに載せると既存の fake が壊れるため）。`start()` が走らせる 1 周が失敗しても出し、`start()` ごとに出る（再開で 2 回以上）。
- T6 まで、`pollWorkspace` は `unmanaged`／`unknown` をどちらも今までどおり `null` として `applyWorkspaceIdentity` へ渡す（SessionService の署名は変えていない）。
- 合図 `onFirstRoundDone` は `stop()` の後（一時停止中）に届きうる。T10 の確定は 1 回だけで冪等なので、ここでは止めない（T10 で扱う）。

## D11: モデルの「変わったもの」は控えの差分で返す（T5。`beginChange` / `takeChanges`）

- 書き換える操作（作る・閉じる 5 経路・グループの出し入れ・並べ替え）は、書き換える**前**に `beginChange()`（前回の `takeChanges` からの最初の 1 回だけ、レイアウト・平らな順・各 workspace の `groupId` を控える）を呼ぶ。`takeChanges()` が控えと今を比べ、`{ updated, layout, order }`（変わったものだけ。何も変わらなければ null）を返して控えを捨てる。`updated` は前後どちらにも居る workspace のうち実効の `groupId` が変わったもの（作った・消したは `workspace.created`・`workspace.closed` が運ぶ）。`order` は前後どちらにも居る workspace だけで比べる。
- 理由: `workspace.closed` を出す 5 経路は `moveToTab`（boolean）・`moveToNewTab`・`RemovalResult` と戻り値の形がばらばらで、全部に「変わったもの」を足すと既存の呼び出しとテストを広く壊す。差分方式なら戻り値を変えずに、`SessionService` の共通の出口 `publishSidebarChanges()`（`workspace.updated` → `sidebar.layout_changed` → `workspace.order_changed` → `persist.touch()`）が 1 か所で配れる。モデルはイベントを出さない（副作用なし）。控えが残っても、次の `takeChanges` までの差分が増えるだけで無害。
- 共通の出口は変化が無くても `persist.touch()` を呼ぶので、出口を呼ぶ経路（作る・`closeWorkspaceOne`・グループ操作・並べ替え）の個別の `persist.touch()` は外した（保存の予約は 1 回のまま）。`closeTab`・`closePane`・`moveToTab`・`moveToNewTab` は workspace が消えた分岐だけ出口を呼び、既存の `persist.touch()` はそのまま。

## D12: 仮の状態の持ち方と T5 のつなぎ（T5）

- `SessionModel.layout: SidebarLayout | null`。**新しく始めたモデルは空のレイアウトを持つ**（確定済み）。`restoreWorkspace`／`restoreGroup` が `null`（仮の状態）にする。T9 が `layout` の復元（`null` に戻さない）を足す。
- 仮の状態: `getLayout()` は読むたびに `layoutFromLegacy` で導く。仮の間に workspace を作っても `w:` は足さない（導く結果に入る）。`settle`（実効の `groupId` の計算と Map の並べ直し）は何もしない（`groupId`・Map の順がそのまま正）。
- 確定: `confirmLayout()`（公開。`layout` が `null` のときだけ働く。T10 の確定のきっかけがこれを呼ぶ）。書き換える操作（`createGroup`・`deleteGroup`・`addToGroup`・`removeFromGroup`）は先に同じ確定をしてから当てる（design の「確定のきっかけ (b)」の入口。サービス層の「どの RPC が確定か」の判定は T10）。確定は `layoutFromLegacy` の結果をレイアウトにし、グループの中の `r:<repoKey>` を `repoGroups` に書く。
- **`moveWorkspace`／`moveWorkspacesTo`（T8 で `item.move_by`／`item.move` に委ねる）は T5 ではつなぎ**: 今までどおり Map を並べ替えてから、レイアウトを今の平らな順から `layoutFromLegacy` で導き直す（`settle` は通さない）。平らな順が先に動く今の作りと、新しい「レイアウトが正」の作りが食い違わないようにするだけで、T8 で置き換わる。これにより `SessionModel.test.ts:948-1025`（巡回する・1 件だけ動く等）は T5 では変わらず通る。
- 判定が付いたのに（T6 より前なので）レイアウトがまだ `w:<id>` の workspace に当たる操作のため、`layoutRefOf` を置いた: レイアウトに `itemRefOf(ws)` があればそれ、無く `w:<id>` があればそれ。`addToGroup` は `w:<id>` を外して項目の参照で入れる。T6 が判定の反映で `w:` を `r:` に置き換えれば使われなくなる（残してよい防御）。

## D13: 実効の `groupId` の計算（T5）

- `settle()`（レイアウトを持つとき）が全 workspace に実効の `groupId` を保つ: `git.repoKey` があれば `repoGroups.get(repoKey) ?? null`、無ければ workspace 自身の値（存在しないグループなら null）。項目の所属の書き込みは `setItemGroup`（リポジトリなら `repoGroups`、そうでなければ `groupId`）。`deleteGroup` は `repoGroups` のそのグループ行きを消し、`groupId` は計算で null に戻る。
- `createGroup(label, target?)` は T7 の `group.create` の `workspaceId` のモデル側（位置は design の表のとおり）。RPC のハンドラはまだ `workspaceId` を渡さない（T7）。
- 既存テストの調整（T8 で意味が変わる範囲ではない）: `SessionService.test.ts`・`WsGateway.integration.test.ts` のイベント列に `sidebar.layout_changed` を足した。`SessionModel.test.ts` の `linkedWorktreeGroupMembers`「手動グループに入った workspace を除く」は、項目丸ごとグループへ入る新しい決まりで期待が `[]` に変わった（この関数は T19 で消える）。

## D14: 判定の反映（T6）

- **入口**: `SessionModel.updateWorkspaceGit(id, result: GitJudgement)`（`GitJudgement` = `git`／`unmanaged`／`unknown`。`ProbeResult` はその別名）。`SessionService.applyWorkspaceIdentity` と `updateWorkspaceGit` は `applyGitJudgement` の 1 つに通す。`unknown` は何もしない（`git` も保つ）。`unmanaged` は `git = null`。
- **出口**: 項目の判定（`repoKey`・`isLinkedWorktree`。`gitIdentityChanged`）が変わったときだけ、モデルが `beginChange` し、サービスが `publishSidebarChanges`（`workspace.updated`〔`groupId` の変化と重ねて 1 回〕→ `sidebar.layout_changed` → `workspace.order_changed` → `persist.touch()`）で配る。ブランチ・件数だけの変化は今までどおり `workspace.updated` だけで保存の予約はしない。`applyWorkspaceIdentity` の名前の変更の `persist.touch()` は、判定の出口を通るときはそちらに任せ、予約を 1 回にした。
- **`repoKey` が null の `git`**（テストなど）は `w:<id>` のまま（`itemRefOf` と同じ）。`repoKey` が同じで `isLinkedWorktree` だけ変わるときは、レイアウトは変えず `settle` が Map を並べ直し `workspace.order_changed` を出す。
- 表の (2) で `r:R` がすでに workspace と**同じグループ G の中**にあるときは、位置を変えず `w:<id>` を外すだけ（設計は「G の末尾へ移す」。同じ入れ物のときの動きを決めていなかったので、並びを乱さない側にした）。
- 「判定が変わる（R1 → R2）」の R1 は、他に R1 の workspace が居なくなったときだけ `r:R1` を外す（`repoGroups[R1]` は残す）。R2 の置き場所が決まらないときは、元の項目の一番上のまとまり（グループの中ならその `g:`、一番上なら `r:R1` が居た位置）の直後。
- 「管理外と確定」の `groupId` は、置いた入れ物のグループ（一番上なら null）を明示で書く。
- **仮の状態（`layout` が `null`）**: `git` だけ入れる（レイアウト・`repoGroups` には触れない）。導いたレイアウトが変わるので `beginChange` は通し、`sidebar.layout_changed` は配る。
- **`layoutRefOf` の撤去**: D12 の暫定の分岐（`w:<id>` のまま判定が付いた workspace への対応）は、判定が付く時点で `w:` を `r:` に置き換えるようになったので不要になり、消した（`createGroup`・`addToGroup`・`removeFromGroup` は `itemRefOf` を使う）。レイアウトに `w:` が残ったまま `repoKey` を持つ状態は、T9 の復元の `repairLayout` が直す。
- 既存テストの調整: `SessionModel.test.ts` の `repoModel` から、判定の反映が無かった頃の確定の回り道（`restoreGroup` → `confirmLayout` → `deleteGroup`）を外した。`updateWorkspaceGit`／`applyWorkspaceIdentity` を呼ぶテストは 3 つの結果の形に直した。`SessionService.test.ts` の「repoKey だけ変わる」は、判定が付くのでレイアウトのイベントも出る期待にした。
