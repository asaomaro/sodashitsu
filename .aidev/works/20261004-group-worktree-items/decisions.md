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

## D15: グループと一括クローズの入口（T7）

- モデルの出し入れ・作成は T5 で項目単位になっているので、T7 はハンドラの結線（`group.create` が `workspaceId` を渡す）と一括クローズの対象だけを替えた。`group.add_member`／`remove_member` のハンドラは変更なし（モデルが `itemRefOf` で項目丸ごとに動かす）。
- 一括クローズの対象は新しいモデルのメソッド `SessionModel.repoCloseTargets(id)`（`repoMembers` の先頭が `id` のときだけ、残り全部。先頭でない・1 つだけ・判定なしは `[]`）。所属は見ない。`linkedWorktreeGroupMembers` は呼び出し元が無くなったが、T19（古い関数の撤去）まで残す（既存のテストがある）。
- 先頭でない子に `closeLinkedWorktrees: true` を付けても、その 1 つだけが閉じる（以前と同じ）。

## D16: 並べ替えの入口（T8）

- モデルの `moveItem(item, before)`・`moveItemBy(item, direction)` が `ItemTarget`（workspace → `itemRefOf`、group → `g:<id>`。実在しなければ NotFoundError）を参照へ読み替え、T3 の純関数に渡す。戻りは「受け付けたか」の boolean（位置が変わらなくても受け付ければ true）。受け付けたときだけ、仮の状態を確定（`confirmedLayout`）してレイアウトを当て `settle`。受け付けない移動は確定もしない（何も変えず、サービスは何も配らない）。
- `moveWorkspace`＝`moveItemBy`（端で巡回しない。以前の「巡回する」は逆になった）。`moveWorkspacesTo` は design の (a)(b)(c) の読み替え（`planLegacyMove`）。戻りは boolean（以前の `Workspace[] | null` をやめた。呼び出し元はサービスだけ）。`syncLayoutFromOrder`（T5 のつなぎ）は消した。
- (a) の「落とし先」は、入れ物の項目のうち先頭の workspace が `beforeWorkspaceId` のもの（リポジトリは `repoMembers` の先頭、グループは中の先頭の項目の先頭）。複数の項目は、レイアウトでの今の相対順のまま、落とし先の前へ。落とし先が動かす項目自身なら (c)（以前の「null」と同じ）。
- 設計の曖昧な点: ID の集まりが**グループの全メンバー**で `beforeWorkspaceId` が null のとき、(a)（グループの中で全項目を末尾へ。実質無変化）ではなく (b)（グループを一番上の末尾へ）に読む。古い画面は必ず具体的な落とし先を送るので影響はなく、外部の呼び出し元向けの決め。
- `item.move`・`item.move_by` のハンドラは `surface/methods/item.ts`。結果は `{moved}`。

## D17: 保存と復元（T9）

- **保存の形**: `SessionFileData.layout?`・`repoGroups?`、`SessionFileWorkspace.repoKey?`・`isLinkedWorktree?`（すべて optional・版は 1 のまま）。`layout` のスキーマは protocol の `SidebarLayoutSchema`（参照の中身は問わない）。壊れた形（`top` が配列でない等）は「壊れたファイル」として扱う。
- **`repoKey` の書き方**: モデルは「管理外と確定」と「まだ判定が付いていない」を区別せず、どちらも `git: null`。保存は `ws.git?.repoKey ?? null`（`git` が無ければ `null`）、`isLinkedWorktree` は `ws.git?.isLinkedWorktree ?? false` で、常に書く。読み分け「項目が無い＝未確定」は**古い版の保存**にだけ現れる。復元は `null` でも無くても `git: null` で、並びに違いは出ない（判定前も管理外も `w:<id>`）。
- **復元**: 全 workspace・グループを入れた後（pane の起動の前）に `SessionService.restoreLayout` → `SessionModel.restoreLayout(layout, repoGroups)`。`repairLayout` を通して確定した状態にし、`repoGroups` は実在するグループ行きだけ残し、`settle` で実効の `groupId` と Map の順を合わせる。捨てた参照は `warn`（`dropped`）に出す。`layout` が無い保存は何もせず仮の状態のまま（`restoreWorkspace`／`restoreGroup` が `layout = null` にする既存の動き）。`repoGroups` だけ有って `layout` が無い保存は `repoGroups` を読まない（仮の状態は `repoGroups` を空で始める決まり）。
- **書き出し**: `SessionService.persistedLayout()`（仮の状態なら null）。`toSessionFileData`（結合テストのため `export` した）は null のとき `layout`・`repoGroups` のキーごと省く。仮の状態の間も `repoKey`・`isLinkedWorktree` は書く（起動直後から束ねるため）。
- **確かめたこと（実物の git・実物の `FsSessionFile`）**: 保存 → 復元の直後に停止前と同じ `layout`・Map の順・実効の `groupId`、`git` は `{branch: null, ahead: 0, behind: 0, repoKey, isLinkedWorktree}`。最初の 1 周でブランチが入り並びは不変。フォルダが消えて「取れない」の workspace は復元した判定・所属のまま。
- T10 への申し送り: 確定の合図は `SessionModel.confirmLayout()`（`layout` が `null` のときだけ働く）。確定後の保存は `persistedLayout()` が値を返すので `layout`・`repoGroups` が書かれる。

## D18: 移行の確定（T10）

- **確定の合図**: `SessionService.confirmLayout()`（仮の状態でなければ何もしない。確定したら共通の出口 `publishSidebarChanges` で配り、保存を予約する）。`composeServer.ts` が `gitPoller.onFirstRoundDone` に結ぶ（`start()` の前）。合図は `start()` ごとに来るが、確定済みなら何もしないので 1 回だけ働く。確定で導いたレイアウトは変わらないので `sidebar.layout_changed` は出ず、所属が変わる workspace（別のグループの worktree 等）の `workspace.updated` と保存の予約だけが出る。
- **一時停止中の合図は捨てる**: D10 の「合図は stop の後にも届きうる」への対処。引き継ぎの一時停止（`pausePollers` → `flushSession` → execve）の間に確定すると、保存を流した後に書き換えて予約が残る。`DefaultGitInfoPoller.isRunning()`（`timer` が有るか）を足し、動いていないときの合図は確定しない。再開の `start()` がまた 1 周して合図を出し、execve で置き換わった場合は新しい版が仮の状態から同じ導き方をやり直す（`layout` を書いていないので移行は失われない）。
- **確定のきっかけ (b) はモデルの書き換え操作の入口で既に実現している（T5・T8）**: `createGroup`・`deleteGroup`・`addToGroup`・`removeFromGroup`・`moveItem`・`moveItemBy`・`moveWorkspace`・`moveWorkspacesTo` が、**受け付けて書き換えるとき**に先に `confirmedLayout()` で確定してから当て、サービスの共通の出口が配る。`group.rename`・`group.toggle_collapsed` は通らない（確定しない）。`item.*`・`workspace.move`・`workspace.move_to` の受け付けない移動は確定しない（D16 のとおり。確定しても何も変わらず、保存と配信が無駄に走るだけで、利用者に見える違いは無い。design の「(b) それより前に利用者が操作したとき」の「操作」は、状態を変える操作と読めるので design と食い違わないと判断した）。存在しない ID を渡す呼び出し（`not_found`）も、検証が確定より先なので確定しない。
- 結果の固定: 本体の判定だけが 1 周目で取れなかった場合（D2）は、取れた worktree の所属（`repoGroups[K]`）で確定し、本体は後から判定が付いたとき（表の「判定が付く」。`repoGroups` を先に見る）に同じグループの `r:K` へ加わる。`SessionService.test.ts`「移行の確定」で固定した。

## D19: 折りたたみのキー `navigate_toggle_collapse`（既定 `z`）の追加（T11）

- `Action` の `navigate` の `op` に `toggleCollapse` を足し、`NAVIGATE_KEYS` に `navigate_toggle_collapse`（既定 `z`・8 つ目）を足した。web の `ActionDispatcher.navigate`・端末版の `TuiDispatcher.navigate` には**何もしない受け口**だけ置いた（動きは T15・T17）。設定の「キー」（web は `NAVIGATE_KEYS` 直参照、端末版 `keySection.ts` も同様）は無改修で出る。キー一覧（HelpDialog）は web・端末版とも「移動」群の `navigate_open_menu` の次に 1 行足した。
- **重ならないことの確認（実装でも）**: ① `NAVIGATE_KEYS` の既定（`up`・`down`・`h`・`j`・`k`・`l`・`space`）と `z` は別、② `NAVIGATE_RESERVED_CHORDS`（`esc`・`enter`・`tab`・`shift+tab`・`left`・`right`・`ctrl+shift+v`・`1`〜`9`）に `z` は無い、③ `NavigateMode.ts` の固定 case は `Enter`・`Escape`・修飾なしの `ArrowLeft`/`ArrowRight` だけ、④ `prefix+z`（`bindings.ts` の拡大表示）は prefix モードの別の表で、navigate は prefix の状態機械の外なので衝突しない。①②は `navigateKeys.test.ts` に「既定が重ならず予約にも当たらない」として固定し、`navigateKeymap.test.ts` で `ownerOf("z")`・`actionFor("z")` も固定した。
- 既存テストの期待を 7 → 8（`navigateKeys`・`navigateKeymap`・`KeySettings` の「.keys-details」64 → 65）に直し、web の HelpDialog の「移動」群に `z` の行を足した（pane 左の行の添字は 4 → 5）。

## D20: ブラウザ版の表示と順（T12）

- **レイアウトの持ち方**: `session` ストアに `layout`（`SessionSnapshot.layout`・`sidebar.layout_changed`。無ければ null）、`effectiveLayout`（`layout ?? layoutFromLegacy(workspaces, groups)` の computed）、`hasServerLayout` を足した。`clear()`（マシンの切り替え）でも null に戻す。D5 のとおり画面は仮か確定かを区別しない。
- **描画とキー操作を同じ関数に通す**: `store/sidebarTree.ts` の `currentSidebarTree`／`currentVisibleWorkspaceIds`（`sidebarTree`／`visibleWorkspaceIdsOfTree` を session・view から呼ぶ）。`Sidebar.vue` と `ActionDispatcher` の workspace の切り替え（`workspaceDelta`）・番号（`workspaceIndex`）・navigate の上下が使う。pane のドロップ先は行の DOM の当たり判定で順を使わないので変更なし。`ActionDispatcher` は古い `visibleWorkspaceIdsInOrder` を呼ばなくなった（関数は T19 まで残る）。
- **行の組み立て**: `SpaceRow` に `kind`（group／worktreeHead／worktreeChild／workspace）・`depth`（0〜2）・`parentGroupId` を足した。字下げは `sidebar-row-indent`（深さ 1 以上。既存のクラス）と `sidebar-row-depth-2`（深さ 2）。畳んだグループの中は今いる workspace の行だけ（先頭でも子でも。`visibleWorkspaceIdsOfTree` と同じ決まりで、テストで描画の順と一致を固定した）。畳んだサイドバーでは字下げ 2 を 1 と同じにし、行は折り返す（折りたたみ・種類・状態の 3 つの印が 3em に収まらないため）。
- **種類の印**: `SidebarKindIcon.vue`。`StateIcon.vue` と同じ作り（1em の箱・`currentColor`・印自身は `StateIcon` の流儀に合わせて飾りか名前つき）。展開時は SVG を `aria-hidden` にして視覚的に隠した文言（「グループ」「worktree グループ」）を添え、畳んだサイドバー（`compact`）では文言を出さず、アイコンが `role="img"`・`aria-label`・`title` を持つ。行の並びの設定（`row.lines`）で描く展開した workspace 行でも出るよう、種類の印は行の 1 行目の先頭に置いた（`line === null` の分岐の中ではない）。折りたたみのボタンの読み上げ名は「グループを…」「worktree グループを…」に分けた。
- **D&D（古い `workspace.move_to`）は次のタスク（T14）まで暫定のまま**: ハイライトの正規化は「worktree グループの子 → 先頭の行」「グループの中の通常の行 → グループの見出し行」（D16 の (a)(b) で動く）。グループの中の並べ替えのドラッグは T14 で `item.move` に替える。
- 既存テスト・golden の調整: `Sidebar.defaultLayout` の golden（展開・畳んだ）に種類の印と折りたたみの読み上げ名の変化を反映した。「手動が優先」を前提にした Sidebar のテストは `layout` の無い入力で `layoutFromLegacy` を通り、期待の変更なしで通った（グループに入っていない worktree が 1 つの項目になる点は同じ並び）。
- `protocol/src/model.ts` の `WorkspaceGroup` のコメント（「ブラウザ側」）を現状に直した（worktree グループの折りたたみは共有の設定 `collapsedAutoGroups`）。

## D21: ブラウザ版のメニューと出し入れ（T13）

- **所属は項目で見る**: メニューの「所属あり／なし」は `store/sidebarTree.ts` の `itemGroupIdOf`（`effectiveLayout` の `groups` の中に `itemRefOf(workspace)` があるか）で決める。子の行でも本体の所属で答える。古いサーバでも `layoutFromLegacy` が本体の所属で導くので同じ関数で足りる。
- **「別のグループへ移す…」は、今のグループ以外に移し先があるときだけ出す**（design は所属ありの 3 項目としか書いていない。移し先が無いのに開いても選べず「まだグループがありません」と出るだけなので）。
  - **design「画面」の所属ありの 3 項目からの差**: design は所属ありを「別のグループへ移す…」「グループから外す」「新しいグループを作る…」の 3 項目としているが、所属ありで今のグループ以外にグループが無いときは「別のグループへ移す…」を出さず 2 項目になる。design 本文は変えない（この判断を D21 に残す）。ピッカーの選択肢も今のグループを除く。ダイアログの文脈 `addToGroup` に `moving?: true` を足し、見出しを「別のグループへ移す」に変える。選択肢の並びは `effectiveLayout.top` の `g:` の順（レイアウトに無いグループは末尾）。
- **メニューの順**: 所属なし →「グループへ追加…」「新しいグループを作る…」、所属あり →「別のグループへ移す…」「グループから外す」「新しいグループを作る…」（design のとおり。以前は「新しいグループを作る…」が先だった）。worktree の 2 項目の後ろに置く点は変えない。
- **古いサーバ**（`session.hasServerLayout` が false）: 出し入れは項目の workspace 全部（`repoMembers` の順）に順に送り、1 件でも失敗したら止める。グループの作成は 2 段のまま（2 段目も全部）。「上へ／下へ移動」は出さない。`layout` を持つサーバは `group.create` に `workspaceId` を添えて 1 回、出し入れも 1 回。
- **グループの「上へ／下へ移動」**: `ActionDispatcher.moveGroupBy` が `item.move_by` を送る。名前順（`view.workspaceSort === "name"`）のときは送らず「名前順では並べ替えできません」と知らせる（メニュー自体は出す）。端での `moved: false` は黙って何もしない。
- **`ConfirmDialog` の件数**: `repoMembers` で数える（対象が `repoMembers` の先頭のときだけ、残り全部。グループへ入っているかは見ない。サーバの `repoCloseTargets` と同じ）。`linkedWorktreeChildrenOf` は web からは使わなくなった（端末版 `tui/src/modes/dialogs.ts` はまだ使う。T19 で撤去）。

## D22: ブラウザ版のドラッグを項目単位の `item.move` にした（T14）

- **名前順のときの今のドラッグの動き（変える前に確かめた事実）**: 名前順（`workspaceSort === "name"`）でもドラッグは止められず、`workspace.move_to` を送っていた（Sidebar.vue に並び順の分岐が無い）。サーバはレイアウトの順を変えるが、一番上の描画は名前で決まるので**送るが見た目が変わらない**。実物の Sidebar を名前順で mount して確かめた：2 行（"b"=w1・"a"=w2）で w1 を w2 の上へ落とすと `moveWorkspacesByDrag(["w2"], "w1")`（古い名前。今の `moveItemByDrag`）が呼ばれ、サーバが順を入れ替えた後（Map の順を変えた）も描画は `["a","b"]` のまま。グループの中は、古い画面が行を「グループの見出し」に寄せていたので（D20）中の並べ替え自体ができなかった。design の「今が『送るが見た目が変わらない』なら、この決まりに変える」に従い、名前順の一番上は受け付けず、離したときに「名前順では並べ替えできません」と知らせる。
- **行ごとの項目と入れ物**: `SpaceRow` に `item`（`ItemTarget`。子の行は親の worktree グループ＝先頭の workspace、グループの見出しは `group`）と `container`（一番上は null、グループの中はそのグループの id）を持たせた。子の行の `dragIds` は worktree グループ全体にした（古いサーバの `workspace.move_to` の (a) の「項目のちょうど全部」に合わせるため）。旧 `groupHeadRowKeyFor`（メンバー行を見出しへ寄せる）と `dropAnchorForRowKey` は廃止。
- **落とせる条件**（`dropStateFor`）: ① 自分の項目の上（掴んだグループの中の行を含む）は何も起きない（印なし・離しても送らず知らせない）。② 入れ物が違う行の上は落とせない（印＝破線 `sidebar-row-drop-invalid`＋`not-allowed` カーソル。離すと送らず「同じグループの中、または一番上の項目の間でだけ並べ替えできます」）。③ 名前順で掴んだ項目が一番上なら、同じ入れ物の上でも落とせない（印あり・離すと「名前順では並べ替えできません」）。④ 行の外で離す・`Esc`・ダイアログが開く、は今までどおり取り消し（送らず知らせない）。`view.workspaceDrag` に `overInvalid` を足した。
- **落とし先は「その項目の前」だけ**（末尾へ落とす入口は今までもなく、変えていない。`before` は常に項目）。位置が変わらない落とし先（すぐ後ろの項目）はサーバが受け付けて何も変わらない（D8）。
- **送り分け**: `ActionDispatcher.moveItemByDrag(item, before, legacy)`（旧 `moveWorkspacesByDrag`）。`session.hasServerLayout` なら `item.move`（失敗は「移動できませんでした」）、無ければ `workspace.move_to`（掴んだ項目の workspace 全部と、落とし先の項目の先頭の workspace）。古いサーバで落とし先の workspace が無いとき（メンバーのいない空のグループの上）は、null が「末尾」の意味になってしまうので何も送らない。
- 端末版の `moveWorkspacesByDrag`（`TuiDispatcher`・`mouse.ts`）は T18 まで触らない。
- **古いサーバで落とし先・動かす対象が無い場合（T14 点検の指摘）**: メンバーのいない空のグループは古いサーバでは `workspace.move_to` の落とし先にならない。**落とし先にしない**方を選んだ：`dropStateFor` が null を返し、印（`sidebar-row-drop-target` も `-invalid` も）を出さず、離しても送らず知らせない（印が出るのに何も起きない状態をなくした）。同じ空のグループを**掴む**ことも古いサーバではできない（`dragIds` が空で `workspaceIds: []` を送りうるため、閾値を超えてもドラッグを始めない）。`moveItemByDrag` にも保険として、古いサーバで落とし先が null または `workspaceIds` が空なら何も送らない guard を置いた。`layout` を持つサーバは空のグループも `item.move` で動かせるので変えない。

## D23: ブラウザ版のキーボード（T15）

- **選択のキー**: navigate の選択（`view.navigateSelection`）は文字列のまま、workspace なら id、グループの見出しなら `group:<id>`（サイドバーの行のキー `row.key` と同じ形。workspace の id は `group:` で始まらないので混ざらない）。変換は client-core の `navigateKeyOfGroup`・`groupIdOfNavigateKey`・`navigateKeyOfRow`。選べる行の順は `navigableRowsOfTree`（`visibleWorkspaceIdsOfTree` に、グループの見出しを中の行の前へ差し込んだもの。畳んだ・空のグループの見出しも含む）。端末版（T17）も同じ関数を使える。
- **`navigate_open_menu`**: `Sidebar.vue` が選択のキーで分け、見出しならその行の位置でグループのメニュー、workspace なら今までどおり。`ActionDispatcher` 側の要求（`requestNavigateMenu`）は変えない。
- **`navigate_toggle_collapse`**: 見出しなら `group.toggle_collapsed`（サーバ）、workspace の行は、その workspace が `repoMembers` で 2 つ以上のリポジトリに属すとき（先頭でも子でも）`view.toggleAutoGroupCollapsed(repoKey)`（共有の設定）。通常の行は何もしない。
- **設計に無い決め**: 見出しを選んでいるときの `Enter`（activate）は、選択をやめるだけで何も送らない（見出しは「移る先」ではない。畳むのは `navigate_toggle_collapse` とクリック）。
- **`move_workspace_previous`／`next`**: 対象は今いる workspace（navigate の選択ではない。今までと同じ）。`layout` を持つサーバには `item.move_by`、無いサーバには `workspace.move`。名前順で今いる workspace の項目が一番上（グループに入っていない）なら送らず「名前順では並べ替えできません」と知らせる（古いサーバにも同じ。グループの中は送る）。
- **「上へ／下へ移動」の後の選択**: 選択は ID（キー）で持ち、メニューの操作では消さないので、動かした見出しに選択が残る（テストで固定）。
- **選択が消える経路（T15 点検の指摘）**: メニューを閉じる（`ContextMenu.vue` の `close`・実行の `activate`）と `moveGroupBy` は `navigateSelection` を触らない。選択を消すのは `navigate_cancel`/`activate`（`ActionDispatcher`）とマシン切り替え（`view.resetForMachineSwitch`）だけだと実物で確かめた。「上へ移動」の後も見出しの選択が残るテストは、実際のメニュー経路（見出しのメニュー→「上へ移動」）で通し、`close`／実行に選択を消す行を仮に入れると落ちることを確かめた（review.md）。
- **消されたグループの選択**: 別の画面でグループが消されても選択が `group:<id>` のまま残りうる。`navigate_open_menu`（`Sidebar.vue`）と `navigate_toggle_collapse`（`toggleCollapseOfSelection`）は `session.groups` に実在するかを確かめ、無ければ何も開かず・送らず、選択を外す。

## D24: 端末版の種類の印は `≡`（グループ）・`ψ`（worktree グループ）（T16）

- **端末版の既存の方針（読んで確かめた）**: ① 記号は 1 桁（状態の記号 `×◐✓○·`・折りたたみ `▸▾`・`+`・`«`・`↑↓` はすべて幅 1。幅は `render/width.ts` の unicode11 の規則で測り、枠・pane の中と同じ）。② 絵文字の属性を持たない字形だけを使う（`client-core/agent/stateIndicator.ts` の説明どおり、`color` を受け継ぐ。絵文字は幅 2 になり色も受け継がない）。③ 色に頼らず、形で見分ける（状態は記号＋色。記号表示を切ると `●` になる設定 `statusSymbols` はあるが、種類の印は色を使わないので対象外）。④ 字形の確認は外側の端末のフォント次第（`docs/tui-parity.md` H23b）。
- **決めた記号**: グループの見出し `≡`（U+2261）、worktree グループの先頭の行 `ψ`（U+03C8。枝分かれの形）。どれも幅 1・絵文字ではない・状態の記号や `▸▾` と形が重ならない。`render/chrome/sidebar.ts` の `KIND_GLYPH` に唯一の置き場を置いた（web の `SidebarKindIcon` の「フォルダ／枝分かれ」に対応）。
- **位置**: 折りたたみの記号の次（「▸ ≡ グループ名」「▸ ψ main …」）。先頭の行は「▸ ψ 」の 4 桁の後ろに今までの行の部品（状態の印・名前）が続く。複数行の行の並びでは 2 行目を 1 + 6 桁から始める（通常の行は 1 + 2）。通常の行・子の行には付けない（web と同じ）。
- **読み上げ用の文言は端末版に無い**（画面を端末に描くだけで、スクリーンリーダー向けの別の経路を持たない）。AC12 の「読み上げ用の文言」はブラウザ版だけの要件として扱う。

## D25: 端末版の表示と順（T16）

- **モデル**: `SessionModel.layout`（`SessionSnapshot.layout`・`sidebar.layout_changed`。無ければ null。`reset()` で null）、`effectiveLayout()`（無ければ `layoutFromLegacy`。仮か確定かは区別しない）、`hasServerLayout`（T17・T18 の古いサーバの分岐用）。
- **描画とキー操作を同じ関数に通す**: `model/sidebarTree.ts` の `currentSidebarTree`／`currentVisibleWorkspaceIds`（web の `store/sidebarTree.ts` と同じ役）。`sidebar.ts` と `TuiDispatcher` の workspace の切り替え・番号・navigate の上下（`visibleWorkspaceIds`）が使う。`TuiDispatcher` は古い `visibleWorkspaceIdsInOrder` を呼ばなくなった（T19 まで関数は残る）。
- **`autoGroup` の当たり判定**: マシンの見出し（`machine`）と同じく 1 つの当たりに `toggleX` を持たせた。`{ kind: "autoGroup", repoKey, workspaceId, toggleX }`。`x <= toggleX`（先頭の行の ▸/▾ の桁）なら `toggleAutoGroupCollapsed(repoKey)`、ほかの桁は workspace の当たりとして働く（クリックで移る・ドラッグの開始・右クリックのメニュー・ドラッグの落とし先・pane のドロップ先・navigate の `reveal`・`openRequestedNavigateMenu` を `workspace` と同じ扱いにした）。
- **畳んだ入れ物の描き方**: web と同じ決まり（D20）。畳んだグループの中は今いる workspace の行だけ（先頭でも子でも、その種類の行として）。畳んだ worktree グループは先頭と今いる子だけ。
- **ドラッグは T18 まで暫定**: 先頭の行から掴んだドラッグ・落とし先は今まで通りその workspace 1 つの `workspace.move_to`（`moveWorkspacesByDrag`）。項目単位への置き換えは T18。

## D26: 型の追加（T22）と、下流の暫定の適応（T23 以降で直す）

- **protocol**: `SidebarLayout` に `top: string[]`（`"u"` を含む）と `ungrouped: ItemRef[]`（必須）、`ItemTarget` に `{ kind: "ungrouped" }`（`ItemTargetSchema` も）、`SidebarLayoutSchema` に `ungrouped`（必須）、共有の設定 `SharedPrefs.ungroupedCollapsed?: boolean`（`collapsedAutoGroups` の隣。`DEVICE_LOCAL_PREF_KEYS` には入れない＝共有のまま）、`GitInfo.worktreeKey`。
- **`GitInfo.worktreeKey` は optional（`worktreeKey?: string | null`）にした**: 追補 A の「古いサーバには無い（全部メンバー）」を型で表すため。サーバは T24 から常に `string | null` を入れる。必須にすると古いサーバ前提の画面側テストの `GitInfo` を全部直すことになる。
- **保存の layout に `ungrouped` が必須になった**: 追補どおり途中の形の移行は要らないので、`ungrouped` の無い `layout` を持つ保存は読めない（`SidebarLayoutSchema` で弾かれる）。配布前の形なので許容。
- **暫定（T23・T24 で直す）**: client-core の `sidebarLayout.ts`・`workspaceGrouping.ts` の `layoutFromLegacy` と、server の `SessionModel` は、`ungrouped` を持ち回す（`layoutFromLegacy`・`repairLayout` は `[]`）だけで、まだ旧構造（`top` に項目が直接並ぶ・`"u"` は入らない）のまま動く。`SessionModel.refOfTarget` は `{ kind: "ungrouped" }` を `"u"` に読み替えるだけで、`"u"` が `top` に無いので並べ替えは `moved:false` になる。web `Sidebar.vue` の `sameItem` は `ungrouped` の分岐だけ足した。既存の単体テストは `ungrouped: []` を足して通した（意味の書き直しは T23〜）。

- D26 補足（T22 の点検）: `ungrouped` の無い旧形の `layout` を持つ session.json は、`SessionFileDataSchema` が全体を壊れたファイルとして扱う（layout だけ捨てるのではない）。この work の変更は未配布なので許容する。T24 で保存を扱うときに、`layout` だけ `.catch(undefined)` にして仮の状態から始める形にするかを決める。

## D27: 純関数の追補 01 対応（T23）と、T24/T25 以降で直す暫定

- **代表**: `isRepresentative(ws, workspaces)`・`representativeIds(workspaces)` を足した。同じ `git.worktreeKey`（文字列）の workspace のうち `workspaces` の順で最初のものが代表。`worktreeKey` が無い（古いサーバ）・`null` の workspace は全部代表（今までどおり同じ `repoKey` を全部メンバーにする）。`itemRefOf(ws, workspaces)`・`repoMembers(workspaces, repoKey)` は代表だけを見る。`resolveRef`（レイアウトの参照の読み替え）も同じ決まりで、代表が閉じて次が代表になると、レイアウトに残る `w:<id>` は `r:<repoKey>` に読み替わり、先に見つかった方だけが残る（重複は読み飛ばす）。
- **代表が入れ替わり続けない工夫**（`flattenWorkspaceIds`）: 平らな順は Map の順そのものが「代表の決め手」になるため、代表でない workspace（`w:<id>`）を同じ worktree の代表より前へ並べ替えると、次の平らな順で代表が入れ替わり、`r:`↔`w:` の参照が変わり続ける。そこで平らな順を作るとき、同じ `worktreeKey` の workspace が占める位置のうち一番前に代表（入力の順で決める）を置き、残りは今の相対順のままにした。サーバ（T24）は `flattenWorkspaceIds` の結果を Map の順にするので、この決まりに乗る。
- **`sidebarTree` の戻り値**: 一番上は `TopRow = { kind: "group"; group; items } | UngroupedRow`（`UngroupedRow = { kind: "ungrouped"; items; heading; collapsed }`）。「グループなし」は常に 1 つ戻す。`heading` は本物のグループ（`groups` の件数）が 1 つ以上あるとき、`collapsed` は見出しがあって `ungroupedCollapsed`（5 つ目の省略可能な引数。共有の設定 `ungroupedCollapsed` を渡す）が true のとき。`TopRow` に項目の行（`workspace`・`worktreeGroup`）が直接並ぶ形は無くなった。
- **まとまりの解決**（`placeItems`）: `top` の順（実在しないグループ・重複・`top` の中の項目は読み飛ばす）。`top` に無いグループは「グループなし」の直前、`"u"` が `top` に無ければ末尾に足す（`repairLayout` も同じ）。どこにも無い workspace は「グループなし」の末尾（開いた順）。
- **名前順**（追補に決まりが無かったので決めた。T25 の画面で違和感があれば直す）: 「グループなし」の中の項目を名前で並べ、グループどうしをグループの名前で並べる（「グループなし」は `top` での位置のまま）。グループの中・worktree グループの中はレイアウトの順。
- **`NavigateRow`** に `{ kind: "ungrouped" }` を足した（見出しを出すときだけ）。選択のキーは `ungrouped:`（`navigateKeyOfUngrouped`・`isUngroupedNavigateKey`）。workspace の id・`group:<id>` と混ざらない。`hiddenWorktreeCount(item, focusedWorkspaceId)` を足した（畳んだ worktree グループの `+n`。今いる子は見えているので数えない）。
- **`sidebarLayout.ts`**: 入れ物は `GroupId | null`（`null` は「グループなし」。以前の「一番上」ではない）。`insertItem(layout, ref, null)` は「グループなし」の末尾（新しい workspace の置き場）。`removeItemFromGroup` は「グループなし」の末尾へ、`deleteGroupFromLayout` は中身を「グループなし」の末尾へ（`top` の `g:` と `groups` のキーを消す）。`insertGroup(layout, groupId)` を足した（`top` の `"u"` の直前。`"u"` が無ければ末尾）。`moveItem`／`moveItemBy` は、まとまり（`g:`・`"u"`）なら `top` の中、項目なら同じ入れ物の中。項目とまとまりの取り違え（項目を `g:` の前へ・まとまりを項目の前へ）は `moved: false`。`insertItem`／`addItemToGroup` はまとまりを受け付けない。
- **`layoutFromLegacy`**: 追補どおり（グループは先頭のメンバーの平らな順、空のグループはその後ろ、`"u"` は末尾、グループ外は平らな順で `ungrouped`）。代表でない workspace は `w:<id>` で自分の `groupId` に従う。
- **下流の暫定の適応（T24/T25/T26/T27 で直す）**:
  - server `SessionModel`（T24）: `itemRefOf` に `this.listWorkspaces()` を渡しただけ。旧構造（`top` に項目が直接並ぶ・`containerOf`/`listOf` のローカル関数が `layout.top` を見る・`createGroup` が `top` へ `g:` を置く・代表の交代・`worktreeKey` を持たない）のままなので、server の単体テスト 77 件（`SessionModel.test.ts` 46・`SessionService.test.ts` 19・`surface/methods/index.test.ts` 6・`GitInfoPoller.test.ts` 6）は T24 まで落ちる（T22 の時点では通っていた。レイアウトの形が変わったため）。`removeFromLayout` は閉じた workspace が一覧に無い状態で `itemRefOf` を呼ぶので、代表だった `r:` の項目の外し方が正しくない（T24 で代表の交代と一緒に直す）。
  - web `Sidebar.vue`（T25）・tui `render/chrome/sidebar.ts`（T27）: 「グループなし」の `items` を、今までの一番上の行として depth 0 で描く（見出し・畳み・状態のまとめは無い）。web `store/sidebarTree.ts` の `currentNavigableRows` は、見出しをまだ描かないので `ungrouped` の行を選べる行から外す（T26）。`itemGroupIdOf` は `itemRefOf(ws, 全 workspace)` に直しただけ。
  - 下流のテストは、落ちたものだけ新しい構造の入力に直した（web: `StoreAdapter.test`・`Sidebar.test` の layout が変わる 1 件・`ActionDispatcher.test` の古いサーバの 1 件・`Sidebar.defaultLayout` の golden 2 枚〔古いサーバの既定の描画が「グループが先・グループなしが後」の順に変わった。見出しは T25 で足す〕、tui: `SessionModel.test`・`TuiDispatcher.test`・`sidebar.test`）。落ちなかった旧形のレイアウト（`top` に `w:`／`r:` を直接並べる入力）のテストは、「どこにも無い workspace は `ungrouped` の末尾へ」で偶然通っているだけなので、T25〜T27 で新しい入力へ書き直す。

## D28: 旧形の `layout` を持つ保存は `layout` だけ捨てる（T24。D26 補足の宿題）

- `SessionFileDataSchema` の `layout` を `SidebarLayoutSchema.optional().catch(undefined)` にした。`ungrouped` の無い（追補 01 より前の途中の形）・壊れた形の `layout` は、保存全体を「壊れたファイル」にせず `layout` だけ捨て、`layout` の無い保存と同じ**仮の状態**（workspace の `groupId`・`repoKey` から `layoutFromLegacy` で導く）から始める。`repoGroups` は `layout` と対で使うので、`layout` が無ければ復元は読まない（D17 のとおり）。
- 理由: 壊れた扱いにすると、バックアップへ退避してフレッシュ起動になり、**全部の workspace・タブ・pane の復元が失われる**。並びの情報だけ失うほうが穏当。この work の変更は未配布なので移行の必要は無いが、途中の形で動かしたことのある開発者の環境を壊さないために入れた。`SessionFile.test.ts` に 3 つの形（`ungrouped` 無し・`top` が配列でない・object でない）で固定した。

## D29: 判定の反映と代表の交代を「項目の参照が変わった workspace ごとの遷移」にまとめた（T24）

- 判定が付く・変わる・管理外・workspace が消える・代表の交代は、すべて `SessionModel.reflectRefs(before, primary)` に通す。変える前に全 workspace の `{ref, repoKey, groupId}`（`refSnapshot`）を控え、変えた後に `itemRefOf(ws, 全 workspace)` と比べる。
  1. 消えた workspace: `w:<id>` は外す。`r:<repoKey>` は、変えた後に同じ参照を持つ workspace（代表）が誰も居ないときだけ外す（`repoGroups` は残す）。
  2. 参照が変わった workspace を 1 つずつ `transition` で処理する（判定が変わった workspace を先に）。
- `transition` の置き場（追補 01 B の読み替え）:
  - `r:R1` → `w:<id>`（管理外と確定・代表でなくなった）: 同じ入れ物の `r:R1` の直後（R1 の代表が他に残らなければ同じ場所）。`groupId` はその入れ物のグループ。
  - `r:R1` → `r:R2`（判定が変わる）: `r:R2` があれば加わる／無く `repoGroups[R2]` があればそのグループの末尾／どちらも無ければ**「グループなし」の、元の項目の直後**（元がグループの中なら「グループなし」の末尾）。design の「グループの外の、元の項目の一番上のまとまりの直後」は、「グループなし」が 1 つのまとまりになったので読み替えた。
  - `w:<id>` → `r:R2`（判定が付く・代表になる）: design の表のとおり `repoGroups[R2]` を先に見る。**代表の交代**（`w:<id>` の workspace が同じ `repoKey` のまま代表になる）で `r:R2` が既にあれば、`repoGroups` が無くても、**リポジトリの項目の位置・所属に従って `w:<id>` を外すだけ**（追補 01 A「リポジトリの所属に従う」。その workspace が自分でグループに入れていても、項目をそのグループへ動かさない）。`r:R2` が無い（代表が唯一の workspace だった）ときは今までの「判定が付く」と同じ（覚えているグループの末尾／自分のグループを `repoGroups` に覚える／同じ場所で置き換え）。
- 代表が閉じても、同じ worktree の次の workspace が代表になる限り `r:<repoKey>` は位置を保つ（外して付け直さない）。
- 代表を決める「平らな順」は Map の順で、`settle()` が `flattenWorkspaceIds`（同じ worktree の workspace が占める位置のうち一番前に代表を置く。T23・D27）で並べ直すので、レイアウトの操作で代表が入れ替わり続けない。
- 判定の変化（`gitIdentityChanged`）と `sameGit` に `worktreeKey` を含めた。含めないと、`repoKey`・`isLinkedWorktree` が同じで `worktreeKey` だけが変わる（二つの linked worktree 間の移動）とき、代表の交代がレイアウトに反映されない。

## D30: 所属の書き込み・実効の `groupId`・復元の整合（T24）

- 所属は**参照の種類**で書く: 代表の `r:<repoKey>` は `repoGroups`、`w:<id>`（管理外・代表でない workspace）は workspace の `groupId`（`setItemGroup`・`recomputeGroupIds` は `representativeIds` を使う）。同じフォルダの 2 つ目をグループへ入れても worktree グループは動かない。
- 復元（`SessionModel.restoreLayout`）で、レイアウトの入れ物と所属の記録の食い違いを直す: `r:` は `repoGroups` が正（レイアウトに無くて `repairLayout` が足した項目も、覚えているグループの末尾へ入れる）。`repoGroups` に無いのにグループの中にあれば、その入れ物を覚える。`w:<id>` はレイアウトの入れ物が正で `groupId` を合わせる。`repairLayout`（client-core）は所属の記録を見ないので、復元側で直した。
- 新しく始めたモデルのレイアウトは `{ top: ["u"], groups: {}, ungrouped: [] }`（「グループなし」は `top` に必ず 1 つ）。新しいグループ（`createGroup`）は `insertGroup` で「グループなし」の直前、`target` の項目は `addItemToGroup`（元の入れ物から外して末尾へ）。

## D31: 古い `workspace.move_to` の読み替え（追補 B (a)(b)(c)）の実装（T24）

- (a) 同じまとまり（グループの中か「グループなし」）の中の項目のちょうど全部で、落とし先が同じまとまりの項目の先頭の workspace（または null）。
- (b) グループの実効のメンバーのちょうど全部で、落とし先が**別のまとまりの先頭の workspace**（`top` のグループ `g:<id>` か「グループなし」`"u"`。まとまりの先頭の workspace は、その中の最初の項目の先頭）または null → そのグループを `top` の中で動かす。null は D16 と同じく (a)（実質無変化）ではなく (b) に読み、`top` の末尾（「グループなし」の後ろ）へ動かす。
- (c) それ以外（一部だけ・まとまりをまたぐ項目・落とし先が動かす対象自身）は何も変えない。「グループなし」そのものは古い画面から動かせない（グループの実効のメンバーではないため）。
- 意味が変わった既存のテストは新しい決まりで書き直した（`SessionModel.test.ts` の sidebar layout・item moves、`SessionService.test.ts`、`surface/methods/index.test.ts`、`GitInfoPoller.test.ts`、`SessionFile.test.ts`）。`worktreeKey` を持たない判定（古いサーバ・テストの `GitInfo`）は、今までどおり同じ `repoKey` を全部メンバーにするので、`worktreeKey` を指定したテストだけが代表の決まりを見る。

## D32: ブラウザ版の B3 の描画（T25）

- **「グループなし」の見出し**は `sidebarTree` の `heading`（本物のグループが 1 つ以上）に従い、**中が空でも出す**（数は 0）。追補の「本物のグループがあるときだけ出す」を文字どおりに読んだ。全部の項目がグループに入っていても、見出しは動かせる・畳めるまとまりとして残る（気になれば、空のときだけ隠す形へ直せる。1 か所）。畳み状態は共有の設定 `ungroupedCollapsed`（`view.ungroupedCollapsed`・`toggleUngroupedCollapsed`・`prefsApply` で当てる。端末ごとの設定ではないので `PrefsSync` は変更なし）。見出しの行のキーは `ungrouped:`（navigate の選択キーと同じ）。右クリックのメニューは開かない（T26 で上へ／下へ移動を足す）。
- **状態のまとめ**: `Sidebar.vue` の `aggregateStateOf(workspaces)`（既存の `displayStateFor` で pane ごとの状態を出して `aggregate`）。`rowStateFor(ws, rollup)` の `rollup` に畳んだ worktree グループの全 workspace を渡すと、先頭の行の状態が全体のまとめになる（`state_text` トークンも同じ状態で解決）。グループの見出し・「グループなし」の見出しは中の全 workspace（worktree グループの子を含む）をまとめる。畳んだ worktree グループの `+n` は `hiddenWorktreeCount`（今いる子は見えているので数えない。状態のまとめには含める）。
- **見出しの並び**: 折りたたみの印・状態・フォルダの印・名前・横線・数（B3 のモックどおり）。worktree グループの行は、行の並びの設定のトークン（`state_icon`・`workspace`）が状態と名前を決めるので、種類の印（枝分かれ）が状態の前に来る（モックの「状態・印」の順とは逆）。設定で並びを変えても崩れないことを優先した。
- **ブランチ名**: worktree グループの先頭・子の行に、1 行目の右（`.sidebar-wt-branch`。薄く・省略記号・名前より 3 倍縮む）。出さない条件は「`settings.spacesLayout` の 1 行目に `git`／`branch` がある」（解決済みの行ではなく設定で見る。`git` トークンはずれているときしか解決されないので、解決後の行で見ると、設定にあるのに重ねてしまう）。通常の行・代表でない workspace には出さない。
- **木の線**は CSS の疑似要素（子の行の `::before` 縦線・`::after` 枝）。位置は先頭の折りたたみの印の中心（先頭の字下げ 0 なら 1.3em、1 なら 2.5em）。最後の子（`treeLast`）で縦線が止まる。畳んだサイドバー（3em）では描かない。実物の Chromium（playwright）で、本体・worktree 2 つ・畳んだ worktree グループ・畳んだグループ・「グループなし」を並べて見た目を確かめた。
- **入れ物（`SpaceRow.container`）の意味を替えた**（T26 の土台）: `null`＝まとまりの列（グループの見出し・「グループなし」の見出し）、`"u"`＝「グループなし」の中の項目、グループの id＝そのグループの中の項目。これで「項目は同じまとまりの中だけ・まとまりはまとまりどうし」が `dropStateFor` の既存の比較（`row.container !== dragged.container`）で成り立つ。名前順で受け付けないのは、`null` と `"u"`（グループの中はレイアウトの順で並べ替えられる）。自分の項目の上の判定に、掴んだ「グループなし」の見出しの上の「グループなし」の中の行を足した。落とせないときの知らせは「同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます」に直した。古いサーバでは「グループなし」の見出しは掴めない（`workspace.move_to` では動かせない）。ドラッグの結線の残り（メニュー・navigate・`move_workspace_*`）は T26。
- 既存のテスト・golden の直し: 本物のグループがあるテストは末尾の「グループなし」の見出しを期待に足し、ドラッグのテストは「グループなし」の項目・見出しを落とし先にする形に書き直した（`Sidebar.test.ts`）。golden（`__golden__/sidebar-default-*.html`）は意図した描画の変更（見出し・種類の印・ブランチ名・木の線のクラス）を取り直した。

## D33: ブラウザ版の「グループなし」の操作（T26）

- **メニュー**: 対象 `{ kind: "ungrouped" }`（`MenuTarget`）。項目は「上へ移動」「下へ移動」だけ（名前の変更・削除は出さない）。`layout` の無い古いサーバでは出す項目が無いので、`Sidebar.vue` は**メニューを開かない**（右クリックも navigate のメニューも。空のメニューは矢印キーの剰余が 0 で壊れるため）。`ActionDispatcher.moveUngroupedBy` が `item.move_by` を送り、名前順なら送らず「名前順では並べ替えできません」と知らせる（グループと同じ。D27 で名前順ではグループどうしを名前で並べ「グループなし」は `top` の位置のまま、と決めたので、名前順の一番上の並べ替えは「グループなし」も受け付けない）。
- **項目の出入り**（確認のみ・変更なし）: 「グループなし」の項目は `itemGroupIdOf` が null なので「グループへ追加…」（グループがあるとき。選択肢は `top` の順の全グループ。`moving` は付かない）と「新しいグループを作る…」。「グループから外す」「別のグループへ移す…」は所属ありのときだけ。「グループから外す」は `group.remove_member`（サーバが「グループなし」の末尾へ入れる。T24）。
- **navigate**: `currentNavigableRows` の暫定フィルタを外し、「グループなし」（キー `ungrouped:`）の見出しを選べる（畳んだ中の項目は飛ばし、見出し自体には届く）。`navigate_toggle_collapse` は共有の設定 `ungroupedCollapsed`（`view.toggleUngroupedCollapsed`。サーバへ何も送らない）。見出しが出ていない（グループが 1 つも無くなった）のに選択が残っていたら、畳まず・メニューも開かず選択を外す（消されたグループと同じ扱い）。`Enter`（activate）は選択をやめるだけ。
- **ドラッグ**（T25 の土台を確認）: 入れ物の意味（`null`＝まとまりの列、`"u"`、グループ id）での `dropStateFor` と、古いサーバで「グループなし」の見出しを掴めない扱いは T25 のまま。T25 のテストが項目・まとまりの並べ替え・別のまとまりへの落とし先拒否・名前順・自分の項目の上を既に固定しているので、コードは変えていない。
- **`move_workspace_previous`／`next`**: コードは変えていない（D23）。「グループなし」の中の項目は `itemGroupIdOf === null` なので名前順では拒否、並び順が開いた順なら `item.move_by` を送る（テストを足した）。`layout` の無いサーバは今までの `workspace.move`。
- 既存テストの書き直し: T15 の navigate の順（`group:g2` の次に `ungrouped:` が入る）、T25 の「見出しの右クリックは何も開かない」（T26 で開くのが正）。

- D33 補足（T26 の点検）: 古いサーバ（layout なし）でも「グループなし」の見出しは navigate で選べる。`navigate_open_menu` を押してもメニューは開かず、選択は残る（空メニューを開かないため。利用者には無反応に見える）。許容する。

## D34: 端末版の表示を追補 01 の T4 の見た目にした（T27 のうち T16 の部分）

- **種類の印（D24 の `≡`・`ψ`）をやめた**: 追補の見た目（T4）はグループの見出しにフォルダの印を付けず（名前・線・数だけ）、worktree グループは `⎇`（worktree の印）と木の線 `├`／`└` で区別する。`ψ`・`≡` は T4 に無く、`KIND_GLYPH` ごと撤去した。代わりに `WORKTREE_GLYPH = "⎇"`・`TREE_GLYPH`（`render/chrome/sidebar.ts`）。D24 の「幅 1・絵文字でない」の方針は `⎇` にも当てはまる。
- **`⎇`（U+2387）の幅**: unicode11 の規則（`render/width.ts` の `stringWidth`）で幅 1 であることを単体テストで固定した（`sidebar.test.ts`）。この環境では崩れなかったので記号は替えていない。外側の端末のフォントで崩れる環境が出たら、`WORKTREE_GLYPH` 1 か所を別の記号（例 `Y`・`ψ`）に替える（D24 の ④のとおり字形の確認は端末次第。`docs/tui-parity.md` H23b）。
- **行の形**（mock の `tuiRows`）: グループ・「グループなし」の見出しは `▾ ◐ 名前 ───── 数`（`▾` の桁 = サイドバーの左端 +1、名前・線・数は薄い色、数は右端。数は項目の数で worktree グループは 1 つ）。見出しの状態は中の全 workspace（worktree グループの子を含む）の状態のうち優先度の高いもの（`model.workspaceState` を `aggregate` へ。広げていても畳んでいても出す）。中の項目は 2 桁の字下げ。**通常の行は折りたたみの桁（2 桁）を空け**（mock の `  ◐ 名前`）、先頭の行の `▾` と状態の記号の桁をそろえる——このため従来の端末版の通常の行は 2 桁右へずれた（`mouse.r2.test.ts` の桁を直した）。worktree グループは `▾ ◐ ⎇ 名前`（先頭）・`├ ◐ ⎇ 名前`／`└ ◐ ⎇ 名前`（子）。`⎇` は行の並びの `state_icon` の部品の次（無ければ頭の次）。2 行目以降は名前の桁から（worktree の行は 6、通常の行は 4）。
- **ブランチ名**: worktree グループの先頭・子の行の 1 行目の右端（`Line.right`。左の名前を先に残し、右は残りの半分まで）。行の並びの設定の 1 行目に `git`／`branch` があれば重ねない（web の `line1HasBranch` と同じ。D32）。通常の行・代表でない workspace には出さない。
- **畳んだ worktree グループ**: `▸ ◐ ⎇ 名前 +n`。状態は本体と worktree 全部のまとめ、`+n` は `hiddenWorktreeCount`（今いる子は見えているので数えない）。広げているときは本体の状態だけ。畳んだまとまり（グループ・「グループなし」）の中は今いる workspace の行だけ（種類の行のまま。畳んだグループの中の子なら `└`／`├` は子の並びの本当の位置で決める）。
- **「グループなし」**: `sidebarTree` の `heading` が真のときだけ見出しを描く（D32 と同じく中が空でも出す）。見出しが無いときは項目を字下げなしで並べる。畳みは共有の設定 `ungroupedCollapsed`（`PrefsModel.ungroupedCollapsed`・`currentSidebarTree` が `sidebarTree` の引数へ渡す。キー操作の順 `currentVisibleWorkspaceIds` も同じ木を通る）。
- **当たりの種類（target）**: `autoGroup`（先頭の行。`toggleX` = 字下げ込みの `▾` の桁。D25 のまま）に加え、`group` に `toggleX`、新しく `ungrouped { toggleX }`（見出しの `▾` の桁 = サイドバーの左端 +1）を足した。マシンの見出しと同じ作り。**クリックの動作は T18**: 今は `group` は従来どおり見出しのどこを押しても畳み・広げ、`ungrouped` も同じく `toggleUngroupedCollapsed`（共有の設定を反転して保存）に結んだだけ（見出しが反応しないのを避ける最小限）。右クリックのメニュー・navigate・ドラッグは T17・T18。
- **`visibleWorkspaceIdsOfTree` の確認**: `currentVisibleWorkspaceIds`（切り替え・番号・navigate の上下）は D25 の時点で `visibleWorkspaceIdsOfTree` を通っている。今回は `ungroupedCollapsed` を足し、描画と同じ順になることを `sidebar.test.ts` で固定した。
- **名前順**は client-core の `sidebarTree`（D27 の決め）のまま端末版が描く。

- D34 補足（T16 の点検）: 木の線の最後（`└`）は web（T25）と同じく「見えている子の最後」で決める（畳んで今いる子だけのときも `└`）。別のマシンの行（`machineSection`）と「未接続」の行は折りたたみの桁（lead）を持たないので、ローカルの行と状態の記号の桁が揃わない。マシンの行は変えない範囲（追補 01・見本の範囲外）なので許容する。

## D35: 端末版のメニューとキー（T27 のうち T17）

- **web の T13・T15・T26 と同じ決まりを写した**: メニューの項目と並び（所属なし＝「グループへ追加…」「新しいグループを作る…」、所属あり＝「別のグループへ移す…」〔今のグループ以外が無ければ出さない。D21〕「グループから外す」「新しいグループを作る…」。見出し＝名前の変更・上へ移動・下へ移動・グループを削除、「グループなし」の見出し＝上へ移動・下へ移動だけ）。所属は `model/sidebarTree.ts` の `itemGroupIdOf`（web の同名の関数と同じ。子の行でも本体の所属で答える）。選択肢の並びは `effectiveLayout().top` の `g:` の順。`DialogContext` の `addToGroup` に `moving?: true` を足し、一覧の題を「別のグループへ移す」にした。
- **古いサーバ（`hasServerLayout` が false）**: 出し入れ・作成は項目の workspace 全部（`repoMembers` の順）へ順に送り 1 件失敗したら止める。グループの「上へ／下へ移動」は出さない。**「グループなし」の見出しは出す項目が無いので、メニューを開かない**（右クリックも navigate の Space も。web の D33 と同じ。navigate の Space は無反応に見える）。
- **選択のキー**: workspace は id、グループの見出しは `group:<id>`、「グループなし」は `ungrouped:`（client-core の `navigateKeyOfRow` など）。別のマシンの行は `machine:<マシン>:<id>`（`remoteKey`）で前置きが違うので衝突しない（テストで `parseRemoteKey` が見出しのキーを拾わないことを固定）。`TuiDispatcher.navigateIds` は、今のマシンの分に `currentNavigableRows`（`model/sidebarTree.ts`）の行を使い、別のマシンの行は今までどおり。
- **`navigate_open_menu`**: `TuiDispatcher` は web と同じく要求を立てるだけ（別のマシンの行には立てない）。開く先は `TuiApp.openRequestedNavigateMenu` が選択のキーで分け、見出しならその行の位置（当たり判定 `group`／`ungrouped`）にグループのメニュー・「グループなし」のメニューを開く。消えたグループ・出ていない「グループなし」の選択は、何も開かず選択を外す（web の T15 と同じ）。
- **`navigate_toggle_collapse`**: グループ＝`group.toggle_collapsed`、「グループなし」＝共有の設定 `ungroupedCollapsed`（`toggleUngroupedCollapsed`。サーバへは送らない）、worktree グループの先頭・子＝`collapsedAutoGroups`（`repoMembers` が 2 つ以上のとき）。通常の行・別のマシンの行は何もしない。`Enter`（activate）は見出しでは選択をやめるだけ。
- **選択の表示**: サイドバーの見出しの行も `navigated`（アクセントの色）で強調し、見出しを選んだときの区画のスクロール（reveal）はその見出しの行まで動かす（選択のキーを `group`／`ungrouped` の当たり判定に合わせる）。
- **名前順**: 一番上（グループ・「グループなし」・グループに入っていない項目）の `item.move_by` は送らず「名前順では並べ替えできません」と知らせる（`move_workspace_*` はグループの中なら送る。古いサーバにも同じ）。
- **一括クローズの件数**（確認ダイアログ）: `repoMembers`（代表だけ）で数え、対象が先頭（本体）のときだけ残り全部。グループへ入っているかは見ない（サーバの `repoCloseTargets` と同じ。web の `ConfirmDialog.vue` と同じ）。`linkedWorktreeChildrenOf` は端末版からも使わなくなった（T19 で撤去）。
- **代表の行だけが worktree グループを畳む（独立点検の指摘で直した）**: `navigate_toggle_collapse` は、選んでいる workspace が client-core の `isRepresentative` のときだけ worktree グループを畳む。代表でない通常の行（同じフォルダの 2 つ目。追補 A で worktree の印が付かない）では何もしない。web の `toggleCollapseOfSelection` と端末版の両方に入れた。
- **この T17 で触れていないもの**: 見出しのクリック・ドラッグ（T18）。

## D36: 端末版のマウス（T27 のうち T18）

- **掴み・落とし先の情報を行ごとに持たせた**: `SidebarHit.drag`（`SidebarDragInfo`。web の `SpaceRow` の `item`・`container`・`dragIds`・`dropAnchorId` に当たる）。項目の行（通常の行・worktree グループの先頭・子）とグループ・「グループなし」の見出しに付く。子の行は親の worktree グループ（先頭の workspace の項目）。入れ物の意味は web の D32 と同じ（`null`＝まとまりの列、`"u"`、グループの id）。`index`（同じ入れ物の中の番号）と `next`（次の項目）を木から作って持たせるので、畳んで見えない項目やスクロールで外れた行があっても落とし先が決まる（今までの `dropWorkspace` は見えている行の並びから決めていた）。
- **落とし先の決まり**（`input/sidebarDrag.ts` の `planDrop`。web の `dropStateFor` と同じ条件）: 行の外・古いサーバで落とし先の workspace が無い行・自分の項目の上（掴んだグループの中・「グループなし」の中の行を含む）は何もせず知らせない。入れ物が違うと送らず「同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます」。名前順で一番上（まとまりの列・「グループなし」の中）は「名前順では並べ替えできません」（グループの中は送る）。
- **web との違い（意図）**: web は落とし先を「その項目の前」だけにしている（D22）が、端末版は今までの動きを残し、**下へ動かすなら落とした項目の次の前、上へなら落とした項目の前**（末尾は `before: null`）にした。`item.move` は `before: null` を末尾として受け付ける（D16）ので、ドラッグで入れ物の末尾へ動かせる。古いサーバの `workspace.move_to` も null＝末尾（項目なら (a)、グループなら (b) の一番上の末尾）で意味が合う。ただし落とし先の「次の項目」が空のグループ（workspace が無い）のときは null が末尾の意味になってしまうので送らない。
- **見出しのドラッグ**: 見出しの名前・線の上で押すと掴み、動かさずに離すと畳み・広げ（今までは押した時点で畳んでいた）。左の「▸/▾」（`x <= toggleX`）は押した時点で畳み・広げでドラッグの掴みにしない（先頭の行の `autoGroup` と同じ）。古いサーバで掴めない行（空のグループ・「グループなし」の見出し）は動かしても「動いた」にならず、離すとクリック扱い（web と同じ）。
- **取り消し**: Esc（`TuiApp` の key の入口で、動かしている最中だけ奪う）、行の外・別の区画で離す。ドロップ先の強調（印）は端末版には今までもなく、足していない（落とせないときは離したときの知らせ）。
- **`moveWorkspacesByDrag` を `dropSidebarItem(source, target)` に置き換えた**（`layout` のあるサーバは `item.move`、無ければ `workspace.move_to`。失敗は「移動できませんでした」）。

## D37: 古い関数の撤去と一致のテスト（T19）

- **撤去**: client-core の `autoGroupsOf`・`manualGroupsOf`・`linkedWorktreeChildrenOf`・`groupedWorkspaceRows`・古い `visibleWorkspaceIdsInOrder`・行の型 `WorkspaceRow`・`groupBy` と、それらの単体テスト、サーバの `SessionModel.linkedWorktreeGroupMembers`（と `describe("linkedWorktreeGroupMembers")`）。web・tui・server・e2e・docs を grep し、残る呼び出しが無いことを確かめた（`visibleGroupMembers` は新しい木からも使うので残す）。`visibleWorkspaceIdsOfTree` は元の名前 `visibleWorkspaceIdsInOrder` に戻した（web `store/sidebarTree.ts`・tui `model/sidebarTree.ts`・client-core のコメントとテスト）。
- **確かめた事実（平らな順と木の順）**: `flattenWorkspaceIds` は、同じ worktree の代表が入れ替わり続けないよう、代表でない workspace（同じフォルダの 2 つ目）が代表より前に並ぶとき代表を先に置く（D27）。このとき Map の順（サーバの平らな順）と、画面の木を辿った順は食い違いうる（集合は同じ。画面は木の順で描き・操作するので影響はない）。一致のテストは、`flattenWorkspaceIds(layout, workspaces)` ＝ Map の順を常に、木の順 ＝ Map の順を「代表でないものが代表より前に並ばないとき」に確かめる。
- **一致のテスト**: `SessionModel.clientAgreement.test.ts`（スナップショットの `layout`・並び・実効の `groupId` を画面の `sidebarTree` に通す。仮の状態〔`layoutFromLegacy` と同じ〕・配信の途中〔`workspace.created`／`workspace.closed` が `layout` より先に届いた状態〕・「グループなし」の見出し・代表の交代を含む）。
- **2 つの接続の統合テスト**: `WsGateway.integration.test.ts`（実物の ws・HTTP。`TestServer` に `session` を足した）。操作する接続 A・見ている接続 B・新しくつないだ接続 C の木が、操作ごとに同じ（イベントだけで状態を組み立てる `Screen` が `StoreAdapter` の役）。判定は poller の代わりに `session.updateWorkspaceGit` で入れた。
- **閉じた後のフォーカス先**: `closeWorkspace` の後に移るフォーカス先は Map の先頭で、画面の一番上の workspace とは限らない（画面の木の順と Map の順は代表の交代で食い違いうるため）。実害は無いと判断した（どの workspace に移っても操作は変わらない）。

## D38: E2E（T20・T28 の E2E の部分）で確かめた事実と決め

- **spec**: `packages/e2e/src/specs/workspace-groups.spec.ts`（26 件を `test.describe` 10 個に分けた（独立点検の指摘で 20 件から増やした）。グループの作成と出入り／worktree グループ／後から開く・開き直す・再起動／ドラッグ／同じフォルダの 2 つ目〔AC19〕／「グループなし」〔AC20〕／状態のまとめと `+n`〔AC21〕／別の接続／キーだけ／pane の移動〔AC11〕）。合否はブラウザの DOM（行のキー `data-workspace-row-key`・クラス・`aria-expanded`/`aria-label`・`data-kind`・`data-state`・読み上げ用の文言）と、CDP で見たブラウザが送った／受けたフレームだけ。テスト自身のクライアントは前提作りと「別の接続の操作」にだけ使い、その後は DOM が変わるのを待つ。固定時間の待ちは無し。
- **Sidebar.vue に観測用の印は足していない**。行の種類は、キー（`group:`・`ungrouped:`）・折りたたみのボタンの有無・`sidebar-row-tree` で DOM から決められる（`data-row-kind` を足す案は golden が全部変わるのでやめた）。
- **worktree は spec が自分で `git worktree add`（リポジトリの隣の一時ディレクトリ）で作る**。`worktree.create`（サーバの既定の作成先は利用者の `~/.sodashitsu/worktrees`）は使わない。git の判定は `workspace.create` 直後に走る（`pollWorkspaceNow`）ので、5 秒周期を待たずに worktree グループになる（DOM を `expect.poll` で待つ）。最初から居る workspace（このリポジトリの中を cwd とする）は並びに混ざるので、作り終えてから閉じる。
- **直した不具合（右クリックで見出しの折りたたみが切り替わる）**: `Sidebar.vue` の `onRowPointerDown` が `ev.button` を見ず、右クリックの `pointerup` が行のクリック扱いになっていた（グループの見出し・「グループなし」は折りたたみが切り替わり、通常の workspace の行は `focusWorkspace` が呼ばれた。main から同じ）。先頭で `ev.button !== 0` なら戻すように直した（独立点検の指摘。web の単体テスト `Sidebar.test.ts` に回帰テスト、E2E に「見出し・行を右クリックしてもメニューが開くだけ」）。見出しのメニューは E2E でも右クリックで開く（前の版の「キーで開く」回避はやめた）。
- **同じフォルダの 2 つ目（AC19）**: 代表を閉じると次が worktree グループの子になること、2 つ目をグループへ入れても worktree グループが動かないことを DOM で固定した。
- **壊して落ちる確認**は review.md の「T20・T28 壊して落ちる確認」に 13 件（web 8・client-core 3・server 2）。`isRepresentative` だけを壊しても `representativeIds`（並びの代表）は別の関数で、AC19 の最初のテストは落ちない（`z` のテストだけ落ちる）。並びの代表は `representativeIds` を壊して確かめた。

## D39: E2E の追加（独立点検の指摘への対応）で確かめた事実と決め

- **既定のキー割り当ての無い操作**（`move_workspace_previous`／`next`）は、ブラウザの設定 `soda.prefs.v1`（`keys.bindings`）を開く前に `page.addInitScript` で入れて割り当てる（`boot(page, appServer, { prefs })`。key-bindings.spec.ts と同じ形式）。spec では `prefix+u`／`prefix+i`。端で止まることは「端で押す → 反対のキーを押す → 並びが元どおり」の順序で確かめる（端で回り込む実装だと並びが変わる）。ブラウザは端でも `item.move_by` を送る（止めるのはサーバ）ので、送った件数も数える。
- **ドラッグの取り消し（Esc・行の外）**は、取り消しの後に本物のドラッグを 1 つ行い、`item.move` が 1 件だけであることと並びで確かめる（何も待たずに「送っていない」を数えると、送る前でも通る）。落とせない行の上で離す場面は、同じ理由の知らせが出るのを待ってから数える。
- **AC11（pane の `cd`）**は、テストのクライアントの `sendInput` で pane に `cd` を打ち、DOM の並びが変わるのを待つ（固定待ち無し。実測は数秒以内）。確かめた決まり: (1) 所属のあるリポジトリ A の worktree へ → A の worktree グループの子として同じグループに入る。(2) A の worktree グループの子が所属の無いリポジトリ B へ → 「グループなし」へ出る。(3) A の worktree の子が git 管理外へ → 移る前のグループに通常の行で残る。(4) そのグループに入った通常の行が所属の無いリポジトリ B へ移っても、グループには残り、その所属が B の所属になる（design の遷移表 `w:<id>` → `r:R`（2））。`w:<id>` からの判定は design.md の 130 行（(2) groupId を repoGroups に引き継ぐ）、`r:` から `r:` の判定は 131 行（所属が無ければグループの外）。requirements の AC11「所属が無ければグループの外へ出る」は (2)（グループの項目がリポジトリの項目だったとき）の決まりで、(4) のようにその workspace 自身がグループに入っている場合は残る。
- **AC19 の「＋ 新規」**は、UI のボタンを押す形に替えた（worktree の行を選んで押す。新しい workspace は選んでいる pane のフォルダで開く）。名前は自動で付くので 3 行目の名前を読む。
- **AC 番号**は requirements.md に合わせた（外と中をまたぐ＝AC5、一緒に閉じる＝AC7、開き直す・再起動＝AC10 など。tasks.md は触っていない）。常に通る `receivedEvents().toContain("sidebar.layout_changed")` は、並びを変えるのが自分の操作の場面では外し、別の接続の場面では「ブラウザは並びを変える要求を 1 つも送っていない（DOM が追従したのは別の接続の操作による）」と組にして残した。

## D40: cross 点検の修正（commitWorkspace の settle・順の通知・古い記述）

- **`commitWorkspace` で `settle()`**: `layout` があれば、項目を入れた後に実効の `groupId` と Map の順を平らな順へ合わせる（「グループなし」が本物のグループより上にあるとき、新しい workspace は末尾ではなく途中に入る）。
- **`takeChanges` の順の比較**: 新しい workspace を除いて比べると、途中へ入っても `workspace.order_changed` が出なかった。比べる側を「前の順（消えたものを除く）＋新しく作ったものを末尾に足した順」（`workspace.created` を受けた古い画面が置く場所）にして、いまの順と違えば配る。末尾に入った通常の作成では出ない。`SessionService.createWorkspace` の出口は `workspace.created` の後に `publishSidebarChanges` を通るので、変更は要らなかった（テストで順序を固定）。
- **`orderedWorkspaceIds`**: 本番コードの呼び出し元は無い（grep: web の `ActionDispatcher.test.ts` のコメントと client-core の単体テストだけ）。client-core の公開の関数でもあるので削除せず、コメントだけを実態に直した。**（D45 で撤去に改めた）**
- 旧語「worktree 自動グループ」は、指定のコメント（`ConfirmDialog.vue`・`MouseBridge.ts`・`SessionService.ts`・`messages.ts`・`ActionDispatcher.ts`）を「worktree グループ」に直した。テスト名・prefs・`TuiDispatcher.ts`・`view.ts` などの残りは触っていない。

## D41: origin/main（PR #79・#80）の取り込みでの衝突の解決

- 衝突は `mouse.ts`・tui `sidebar.ts`・`Sidebar.vue`（import だけ）・`KeySettings.test.ts`・golden 2 つ。両方の変更を残した。tui は main の `subagents` の当たり（`⤷n`）・`badge`・`showSubagentsOf` と、このブランチの `ungrouped`・`autoGroup`・`drag`・`right`・`rule`・`subIndent` を併存させた（右クリックのメニューは `agent` と `subagents` を同じ pane のメニューへ）。
- キーの表のテストの期待値は 65 から **66** に直した。根拠: このブランチ側は 57+navigate 8（navigate_toggle_collapse を含む）で 65、main 側は 58+navigate 7（show_subagents を含む）で 65。どちらも 1 つずつ足しているので、両方を取り込むと 66（実際の `.keys-details` の数をテストで確かめた）。
- golden は手で解決せず、解決後のコードで `vitest -u` して取り直した（グループ・「グループなし」・worktree グループの行と、main のエージェントの行の `data-agent-pane` が両方入る）。

## D42: 代表は「その worktreeKey を最初に持った workspace」で、サーバが決めて配る・保存する（T29。review-findings-01 の 1・追補 A の補足）

- **不具合**: 「グループなし」をグループより上に並べ替えた状態で、worktree の workspace（W1）を選んで「＋ 新規」（W2）すると、判定前の W2 が平らな順で W1 より前に入る。D27 の代表の決め方（`workspaces` の順で最初）だと、判定が届いたとき W2 が代表になり W1 が通常の行へ降格した（利用者が挙げた不具合が残る経路）。画面（client-core の純関数）が Map の順から代表を導いていたのが原因。
- **決め方（依頼元の決定）**: 代表は「その `worktreeKey` を最初に持った workspace」。**既に代表が居る `worktreeKey` では奪わない**。平らな順・並べ替えは影響しない。代表が閉じる・別のフォルダへ移ると、残りのうち最初にその `worktreeKey` を持ったものが次の代表。
- **サーバが決めて配る**: `Workspace.representative?: boolean`（protocol。`worktreeKey` が文字列の workspace にだけ付く optional。古いサーバには無い）。`SessionModel.settleRepresentatives()` が判定の反映（`updateWorkspaceGit`）・workspace を閉じる・復元の後に旗を決め直す。旗が立っているもの（代表）を優先し、立っているものが無い `worktreeKey`（交代・復元で旗が無い）は「最初に持ち始めた」ものを選ぶ。「持ち始めた順」はメモリの `heldSince`（`worktreeKey` を持ち始めたとき＝作る・判定が付く・別のフォルダへ移るときに連番を振る）。旗が変わった workspace は `takeChanges` の `updated` に入り、共通の出口が `workspace.updated` を配る（`groupId` が変わらなくても）。
- **保存と復元**: `session.json` の workspace に optional の `representative`（`worktreeKey` が文字列のときだけ書く。版は 1 のまま・D26）。復元は保存した旗を尊重し（作った順に勝つ）、旗の無い古い保存は `w<番号>` の小さい順（作った順）で決める（`SessionService.restore` が `restoreWorkspace` の後に `settleRepresentatives` を呼ぶ）。
- **画面**: `isRepresentative`／`representativeIds`（`itemRefOf`・`repoMembers`・`resolveRef`・`flattenWorkspaceIds` はこれを通る）は、旗が立っている workspace を代表にする。旗が 1 つも立っていない（古いサーバ・配信の途中で旗の更新が揃っていない）ときは、今までどおり `workspaces` の順で最初のもの。サーバも同じ純関数を通るので、サーバ（`itemRefOf`・`repoMembers`・`repoCloseTargets`・`recomputeGroupIds`・`flattenWorkspaceIds`）と画面は同じ代表を使う。旗は `settleRepresentatives` が `reflectRefs` の前に更新するので、D29 の遷移（`r:`↔`w:`）は更新後の旗で動く。
- **`flattenWorkspaceIds` の「代表を先に置く」（D27）は残した**: 旗があれば代表は並びに依らないので入れ替わり続ける問題は無くなったが、同じ worktree の代表を前に置く並びのほうが木と Map の順が揃う（D37 の一致のテストが前提にしている）。
- **既存のテストの書き直し**: `SessionModel.test.ts` の「平らな順で前に居る workspace が後から同じフォルダと判定されると代表を奪う」を、「奪わない（先に持った workspace が代表のまま）」に書き直した。E2E の AC11 の 1 つ（`git 管理外へ移ると…`）は、移った先が既に別の workspace が居る同じフォルダで、旧い決まりの「奪う」に依っていたので、移った先を「D の本体のフォルダ（D の linked worktree の workspace が居る別のフォルダ）」に替えて、同じ意図（所属が引き継がれる）を確かめる形にした。
- **確かめた事実**: 持ち始めた順が無いと「代表が居ない `worktreeKey`」を作った順で決めるしかなく、後から cd してきた早く作った workspace が代表を取る（`ignoreseq` の壊しで落ちる）。単に旗だけでは、復元・交代の後が決まらない。

- D42 補足（T29 の点検）: 「持ち始めた順」（`heldSince`）はメモリだけで保存しない。再起動後は、旗が付いている workspace が代表で、代表が閉じたあとの次の代表は `w<番号>` の小さい順で決まる（依頼元の決定の「順を持てないなら作った順」）。再起動の前後で、代表が閉じたときの「次の代表」が変わりうる制約を許容する（代表そのものは旗の保存で変わらない）。

## D43: ブラウザ版のドラッグの落とす位置を端末版の決まりに揃えた（T30。review-findings-01 の 2。D22・D36 の「web との違い」を解消）

- **決まり**: 上へ動かすなら落とした項目の前、下へ動かすなら落とした項目の次の前（最後なら `before: null`＝入れ物の末尾）。自分自身の上は受け付けない。以前の web は常に「落とした項目の前」で、すぐ下の項目へ落とすと印が出るのに並びが変わらず、末尾へ動かせなかった。
- **共有の純関数**: `client-core/src/workspace/dropTarget.ts`（`dropBefore`・`nextAnchorOf`・`sameItemTarget`・型 `DropAnchor`／`DropSlot`）。web の `Sidebar.vue`（`dropStateFor`。行ごとに `dropIndex`・`dropNext` を持たせ、`item.move` の `before` を返す）と端末版の `planDrop` の両方が使う。入れ物の次の項目は、畳んで見えない項目も数える（木の `items`／`units` から作る）。`ActionDispatcher.moveItemByDrag` の `before` は `ItemTarget | null`。
- **古いサーバ（`workspace.move_to`）は変えない（D22）**: web が渡す落とし先は今までどおり落とした項目の先頭の workspace（`legacy.beforeWorkspaceId`）。端末版は D36 のまま（落とし先が「次の項目」）。両者の違いは古いサーバだけに残る。
- docs（`docs/tui-parity.md` H04w）の「Web 版との違い」から落とす位置の差を外した。`docs/verification.md` のドラッグの行に「下へは落とした項目の次の前」を足した。`docs/tui.md` に該当の記述は無かった。

## D44: `git rev-parse` の出力を検査し、絶対パス 1 行でなければ `unknown`（T31。review-findings-01 の 3。D9・D10 の補足）

- **確かめた事実**: git 2.43.0 で `git rev-parse --bogus-option --git-common-dir` は `--bogus-option\n.git` を出力して**終了コード 0**。知らないオプションはエラーにならずそのまま出る。git 2.31 未満の `--path-format=absolute` も同じ動きになり、終了コードだけでは壊れた値が `repoKey`・`worktreeKey` になる。
- **決まり**: `worktree.ts` の `parseAbsoluteGitPath` が出力を検査する（1 行・`--` で始まらない・絶対パス）。`GitInfoPoller.probe` は `--git-common-dir`・`--git-dir` の両方でこれを通し、null なら `unknown`（直前の判定を保つ）。`resolveCommonDir` を使うのは `WorktreeService.repoNameOf` だけになった（そちらは `--path-format` を付けない）。
- docs（`docs/verification.md`）の「古い git ではオプションが失敗する」を、この動きに合わせて直した。

- D44 補足（T31 の点検）: `parseAbsoluteGitPath` は検査の後に `resolve` を通して返す。git for Windows が出す `C:/x/.git` を、以前の `resolveCommonDir`（`path.resolve`）と同じ `C:\x\.git` にそろえ、共有の設定 `collapsedAutoGroups` に入っている `repoKey` を孤児にしないため（Linux では絶対パスの正規化のみで値は変わらない）。Windows ネイティブでの実測は未実施（実機の確認項目）。`WorktreeService.repoNameOf` は `--path-format` を付けず表示名だけを得る別経路で、`repoKey` には関与しない。

## D45: nit の整理（T32。review-findings-01 の 4〜7）

- **`layoutConfirmWiring.test.ts`**: 固定 20ms の待ちで「合図が来ない」を見ているので、同じ待ちで止めずに `start()` した場合は確定が起きる陽性の対照を足した（待ちが短すぎて「起きない」が見えているのではないことの確認）。
- **`repoGroups` の形の不一致**: `SessionFileDataSchema` の `repoGroups` に `.catch(undefined)` を付け、`layout` と同じく捨てるだけにした（保存全体は壊れた扱いにしない）。テスト 3 件（配列・値が文字列でない・文字列）。`.catch` を外すと 3 件とも落ちる（review.md に記録）。
- **保存の `repoKey` のコメント**: 実装は判定前でも `null` を書く（`composeServer.ts` の `toSessionFileData`）。コメントを実装に合わせた（`null`＝管理外または判定前／項目が無い＝以前の版の保存）。実装は変えていない。
- **`orderedWorkspaceIds` の撤去**: `workspaceOrder.ts` とそのテストを削除し、`client-core/src/index.ts` の export を外した。呼び出しが無いことは `git grep`（web・tui・server・client-core・e2e・docs）で確かめた。残るのはコメントの言及（`ActionDispatcher.test.ts`・`workspaceGrouping.ts`・`paneDragZone.ts`）で、実態に直した。過去の work（`.aidev/works/2026092*`）の記録は当時の事実なので触らない。D40 の「残した」は撤去に改めた。

## D46: `workspace-tab-pane.spec.ts:305`（D99）の落ちは main でも同じ（この環境で各 5 回の観測）（T32。review-findings-01 の確かめること）

- **方法**: `corepack pnpm build` の後に `workspace-tab-pane.spec.ts` を 5 回。このブランチ: 5 回とも「1 failed / 9 passed」（305 の 1 件）。main（`origin/main` c3f1fae を別の作業ディレクトリ `git worktree add /tmp/sodamain` で install・build して同じ回数）: 5 回とも同じ 305 の 1 件だけ失敗（「1 failed / 9 passed」）。差は無い。
- **原因の見立て**: 失敗の出力では、打った文字は新しい pane に届いて `echo` も実行されている（出力に `soda-e2e-aftersplit-…` の結果行がある）。落ちているのは、この環境の bash（readline）が入力の途中で行を再描画し、`echo soda-e2e-af \rtersplit-…` のように期待の文字列が連続しなくなるため、`waitForOutput` の連続一致が取れないこと。この環境（WSL の bash の prompt・端末幅）に依る。このブランチの変更による退行ではない。
- **対応**: 退行ではないので直さない。事実だけ残す（この環境で main でも 5 回中 5 回落ちた件。別件として扱う）。作業ディレクトリは `git worktree remove` で片付けた。
