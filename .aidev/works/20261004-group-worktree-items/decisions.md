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
