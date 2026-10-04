# 調査: workspace のグループ化の現状（20261004-group-worktree-items）

調査は委譲（読み取りだけ）。対象は `main` の 619f782 時点（その後 #77 が入ったが、グループ関連のファイルは変わっていない）。パスはリポジトリの根からの相対。過去の決定は `.aidev/works/20260923-workspace-grouping/`（design.md:17-64、decisions.md D1・D2・D5・D7/D10・D11・D12・D13）。**この work は design.md:17-23・:33-38・:60-64（自動は永続化しない・手動が優先・Map の順をそのまま使う）の決定を覆す。**

## 事実

### F1 データモデルと保存
- 型（`packages/protocol/src/model.ts`）: `GitInfo.repoKey: string | null`（:21）・`GitInfo.isLinkedWorktree`（:28）・`Workspace.groupId: GroupId | null`（:39）・`Workspace.git: GitInfo | null`（:41）・`WorkspaceGroup { id, label, collapsed }`（:200-205。種類・位置・メンバー一覧は無い）・`SessionSnapshot.groups`（:214）。
- サーバ（`packages/server/src/session/SessionModel.ts`）: `groups` Map（:95）、採番 `nextIdCounters.g`（:96）、`createGroup`（:392）・`renameGroup`（:399）・`toggleGroupCollapsed`（:410）・`deleteGroup`（:419。メンバーの groupId を null に）・`addToGroup`（:427）・`removeFromGroup`（:437）は **workspace 1 件の groupId を書き換えるだけ**（repoKey も並びも見ない）。`linkedWorktreeGroupMembers`（:459-480）は `autoGroupsOf` の書き写し（`groupId !== null` なら `[]`）。`moveWorkspace`（:487）・`moveWorkspacesTo`（:507）・`reorderWorkspaces`（:525）。`buildSnapshot`（:909）・`restoreWorkspace`（:932。`groupId: data.groupId ?? null`、`git: null`）・`restoreGroup`（:985）。新規は `reserveWorkspace` が `groupId: null, git: null`（:215-216）。
- `SessionService`（`packages/server/src/session/SessionService.ts`）: `createGroup`（:522）〜`removeFromGroup`（:561）がイベント発行と `persist.touch()`。`sameGit`（:1477-1481）は repoKey・isLinkedWorktree も比べる。
- `session.json`（`packages/server/src/persist/SessionFile.ts`）: `schema: 1` 固定（:54。検証は `z.literal(1)` :126）。`groups`（:59。`.default([])` :130）、workspace の `groupId?`（:42・:106）、`nextId.g`（`.default(1)` :123）。**git（repoKey・isLinkedWorktree）は保存しない。** 書き出しは `packages/server/src/composeServer.ts` の `toSessionFileData`。スキーマは `z.object`（strict でも passthrough でもない）で、知らない項目は読むときに落ちる。
- 復元（`SessionService.restore` :1245-）: groups → workspace の順。groupId が実在するグループを指すかは検証していない。**復元直後は全 workspace が `git: null`**（最初の確認まで worktree グループは出ない）。

### F2 リポジトリの判定（repoKey）がいつ・どう決まるか
- `packages/server/src/git/GitInfoPoller.ts`: 5 秒周期（:8）、`start()` 時に 1 周（:56）。`workspace.create` の直後に `pollWorkspaceNow` を待たずに呼ぶ（`packages/server/src/surface/methods/workspace.ts:21`）。応答の workspace は `git: null` で、後から `workspace.updated` が届く。
- 調べる場所は開いた cwd ではなく `identityCwdOf`（`SessionService.ts:350-356`）＝**最初の tab の先頭 pane の今の cwd**（`GitInfoPoller.ts:92`）。pane が cd すると `followMoves`（:82）が見直す。**repoKey は workspace の存続中に変わりうる。** 開いた場所（`ws.cwd`）は変わらない。
- 反映は `applyWorkspaceIdentity`（`SessionService.ts:378-392`）と `updateWorkspaceGit`（:1126）。`persist.touch()` は名前が変わったときだけ。
- probe（`GitInfoPoller.ts:98-131`）: `rev-parse --abbrev-ref HEAD` が失敗すると `git: null`（:101。git 管理外・コミットが 1 つも無い場合を含むとコメントにある）。repoKey は `resolveCommonDir(cwd, --git-common-dir)`（:118-120。`path.resolve` だけで realpath しない。`packages/server/src/git/worktree.ts:80-82`）。isLinkedWorktree は「`--git-dir` を解決した値が repoKey と違う」（:124）。時間切れ・例外は `null`（:128）。
- 本体が開かれていない: 候補に本体が無く、ほかにも本体が実在しなければ、候補の先頭が暫定の親（`workspaceGrouping.ts:44-48`、`SessionModel.ts:467-477`）。**未確認**: bare・コミットの無いリポジトリ・サブモジュール・symlink を通った cwd での実際の値（テストは本体・管理外・linked の 3 件だけ。`GitInfoPoller.test.ts:108-`）。

### F3 RPC とイベント
- `group.*` 6 つ: スキーマ `packages/protocol/src/messages.ts:193-217`（登録表 :814-819）、ハンドラ `packages/server/src/surface/methods/group.ts:14-60`。`group.create {label}`→`{group}`、`group.rename`、`group.delete`、`group.toggle_collapsed`、`group.add_member {groupId, workspaceId}`、`group.remove_member {workspaceId}`。
- イベント（`packages/protocol/src/events.ts`）: `group.created`／`updated`／`deleted`（:41-55）。所属の変化は `workspace.updated`（`deleteGroup` はメンバーごとに 1 通）。並びは `workspace.order_changed {workspaceIds}`（:36-39）。
- 並べ替え: `workspace.move {workspaceId, direction}`（`messages.ts:182`）は**平らな順で隣と入れ替える**（巡回あり・グループを見ない。`SessionModel.ts:487-498`）。`workspace.move_to {workspaceIds[≥1], beforeWorkspaceId|null}`（:187-190）は渡した順のまま anchor の前へまとめて入れる（null は末尾。anchor が移動対象に含まれる・結果が同じなら何も配らない。`SessionModel.ts:507-521`）。ハンドラ `workspace.ts:67-82`。
- 一括クローズ: `workspace.close {workspaceId, closeLinkedWorktrees?}`（`messages.ts:173`）。`SessionService.closeWorkspace`（:463-467）は `[id, ...linkedWorktreeGroupMembers(id)]`。**効くのは「groupId null の自動グループの親」のときだけ。**

### F4 並びの計算（純関数）と使用箇所
- サーバの順序は `workspaces` Map の反復順だけ。**グループの位置という値は無い。**
- `packages/client-core/src/workspace/workspaceGrouping.ts`: `autoGroupsOf`（:38-53。`groupId === null` で repoKey を持つものを束ね、2 件以上だけ）、`manualGroupsOf`（:60-66。空のグループも返す）、`linkedWorktreeChildrenOf`（:79）、`groupedWorkspaceRows`（:92-125。行は standalone／manualGroup／autoGroup。手動グループの位置は**先頭メンバーの平らな順**、空は末尾。`name` 順はトップレベルだけ）、`visibleGroupMembers`（:133）、`visibleWorkspaceIdsInOrder`（:147-167）。
- 使用箇所（web）: `packages/web/src/components/Sidebar.vue:110, :135, :142`、`packages/web/src/actions/ActionDispatcher.ts:1010, :1082, :1091`、`packages/web/src/components/ConfirmDialog.vue:79`。ストア `packages/web/src/store/session.ts:19, :40, :76-89`、`StoreAdapter.ts:131-136`。`GroupPickerDialog.vue:22` は `session.groups` をそのまま並べる。`ContextMenu.vue:89` は `ws.groupId` だけを見る。
- 使用箇所（tui）: `packages/tui/src/render/chrome/sidebar.ts:133, :161, :165`、`packages/tui/src/actions/TuiDispatcher.ts:921`、`packages/tui/src/modes/dialogs.ts:234`、モデル `packages/tui/src/model/SessionModel.ts:53, :122, :167-172`。

### F5 同じ判定の二重持ち
- 「どの workspace が worktree グループか」は、サーバ（`SessionModel.ts:459-480`）と画面（`workspaceGrouping.ts:38-53`）に同じ判定が別々にある。過去に 2 度食い違った経緯がコメントに残る。規則を変えるなら両方と、`ConfirmDialog` の件数表示が対象。

### F6 ブラウザ版の操作
- D&D（`Sidebar.vue`）: 行の型 `SpaceRow`（:59-93。indent は 1 段、groupKind は 1 つ）。グループの頭の `dragIds` は全メンバー、メンバー行は自分 1 件。手動の見出しは `key = group:<id>`・`workspace: null`・`dropAnchorId` は先頭メンバー（空なら落とし先にならない。:117-133）。自動は親の行が頭を兼ねる（:140-143）。落とし先は `groupHeadRowKeyFor`（:327-333）で頭に寄せ、「その行の前へ入れる」だけ（:363-369）。**D&D でグループへ入れる・出す機能は無い。**しきい値 6px（:287）、Esc で取り消し（:290）。
- メニュー: workspace 行は `workspace` メニュー、手動の見出しは `group` メニュー（`Sidebar.vue:227-231`）。`ContextMenu.vue:89-106`: 「新しいグループを作る…」は常に、groupId があれば「グループから外す」、無くてグループがあれば「グループへ追加…」。`:108-112`: 名前の変更・削除。**worktree の親・子の行にも同じ項目が出る。**`ActionDispatcher.ts:549-627`: `confirmCreateGroup` は `group.create` の後に `group.add_member`。
- キーボード: `move_workspace_previous`／`move_workspace_next`（`packages/client-core/src/keys/bindings.ts:206-219`。既定キーなし）→ `workspace.move`（`ActionDispatcher.ts:1167-1173`）。平らな入れ替えで、見た目が変わらないことがある（decisions D13。未解決）。
- 折りたたみ: 手動はサーバ（`group.toggle_collapsed`）。自動は `collapsedAutoGroups`（repoKey の配列。`packages/web/src/store/view.ts:190-191, :622-627`）で、**今は共有の設定**（`DEVICE_LOCAL_PREF_KEYS` に含まれない。`messages.ts:607, :622`。`Sidebar.vue:254` と `model.ts:203` の「ブラウザ側」という記述は古い）。
- 並び順のトグル: `Sidebar.vue:461`、`view.ts:654`、設定キー `workspaceSort`（`"opened" | "name"`）。**未確認**: `name` 順のときのドラッグの結果。
- 畳んだサイドバー: 見出しは ▸/▾ だけでラベルが出ない（`Sidebar.vue:489, :512`）。モバイル（`packages/web/src/mobile/PanePicker.vue:32`・`GotoPicker.vue:67`）は平らな一覧でグループを使わない。

### F7 端末版
- 描画 `packages/tui/src/render/chrome/sidebar.ts:155-167`。手動の見出しは `▸/▾ + 名前`（hit は `group`）。**自動グループの親は普通の workspace 行で ▸/▾ を描かない。**`SidebarTarget` に `autoGroup`（:26）と処理（`packages/tui/src/input/mouse.ts:296`）はあるが、**その hit を作る箇所が無い**（折りたたみの入口が無い）。
- 右クリック `mouse.ts:281-285`、メニュー `packages/tui/src/modes/ContextMenu.ts:81-110`（web と同じ項目）。ドラッグは workspace 1 件だけ（`mouse.ts:716-729`。頭への寄せ・全体のドラッグは無い）。グループ操作 `TuiDispatcher.ts:514-589`、一括クローズ `:622-636`・`dialogs.ts:230-235`。
- `docs/tui-parity.md:129`（W04）・`:88`（H37b）・`:35`（H04w）は「対応」と書いている（実態と違う）。

### F8 sodactl
- グループ関連のコマンドは無い（`packages/cli/src` に無い）。`workspace close` は `closeLinkedWorktrees` を渡さない（`packages/cli/src/commands/workspace.ts:36`）。skill・`docs/sodactl.md` にグループの記述は無い。`group.*` は RPC として公開されており、外部の呼び出し元の有無は確かめていない。

### F9 別のマシン
- 選んでいるマシンだけがグループ付きの行、ほかは名前と状態の印だけ（`docs/machines.md:60`、`packages/web/src/components/MachineRows.vue:22-31`）。ほかのマシンのグループ表示は backlog（`:132`）。

### F10 テストと文書
- 単体: `packages/server/src/session/SessionModel.test.ts:890-1102`、`SessionService.test.ts:796-978, :1149, :1198`、`packages/server/src/persist/SessionFile.test.ts:69, :83`、`packages/server/src/surface/methods/index.test.ts:399-468`、`packages/server/src/git/GitInfoPoller.test.ts:108-126`、`packages/protocol/src/messages.test.ts:68-109`、`packages/client-core/src/workspace/workspaceGrouping.test.ts`、`packages/web/src/components/Sidebar.test.ts:715-1036`、`packages/web/src/actions/ActionDispatcher.test.ts:1576-1727`、`ContextMenu.test.ts:177-255`、`ConfirmDialog.test.ts:126-168`、`GroupPickerDialog.test.ts`、`packages/tui/src/actions/TuiDispatcher.test.ts:869-938`、`packages/tui/src/modes/overlays.test.ts`、`packages/tui/src/model/SessionModel.test.ts`。
- E2E: **グループと workspace の並べ替えのテストは無い**（worktree の作成と一覧だけ。`packages/e2e/src/specs/workspace-tab-pane.spec.ts:501, :541`）。
- 文書: `docs/herdr-parity.md:30`（H04）・`:73`（H37b）、`docs/verification.md` に**グループの手順は無い**（:1317 の折りたたみボタンの話だけ）、`docs/tui.md:133`。

### F11 互換
- 古い `session.json`: `groups`／`groupId`／`nextId.g` が無くても読める（`SessionFile.ts:106, :123, :130`。テスト :83）。`schema` を 2 に上げると**古い版は壊れたファイルとして退避しフレッシュ起動する**。これまでは optional の追加で版を据え置いている。新しい項目は古い版が読むときに落とし、次の保存で消える。
- 古い画面: `autoGroupsOf` が `groupId === null` だけを束ねるので、linked worktree に groupId が付くと手動グループの中に平らに並ぶ（崩れない）。古いメニューは worktree 1 件に `group.add_member`／`remove_member` を送る。`workspace.move_to` は任意の ID 列を受ける。
- `collapsedAutoGroups` は repoKey（絶対パス）がキーの共有設定で、そのまま使える。

## 実装アンカー（変える場所）

- A1 並びの計算と項目の決まり: `packages/client-core/src/workspace/workspaceGrouping.ts`（全体）とそのテスト。
- A2 サーバの所属の持ち方: `SessionModel.ts:392-480`（グループの操作・`linkedWorktreeGroupMembers`）、`SessionService.ts:378-392`（`applyWorkspaceIdentity`）・`:1126`（`updateWorkspaceGit`）・`:463-467`（`closeWorkspace`）・`:522-561`・`:1245-`（`restore`）。
- A3 保存: `packages/server/src/persist/SessionFile.ts:42-130`、`packages/server/src/composeServer.ts` の `toSessionFileData`。
- A4 並べ替え: `SessionModel.ts:487-525`、`packages/server/src/surface/methods/workspace.ts:67-82`、`messages.ts:182-190`。
- A5 グループの RPC: `packages/server/src/surface/methods/group.ts:14-60`、`messages.ts:193-217`。
- A6 ブラウザ版: `Sidebar.vue:59-146, :227-231, :254-260, :327-372, :473-512`、`ContextMenu.vue:89-112`、`ActionDispatcher.ts:549-627, :1010-1091, :1167-1173`、`ConfirmDialog.vue:79`、`GroupPickerDialog.vue:22`。
- A7 端末版: `packages/tui/src/render/chrome/sidebar.ts:26, :133-167`、`packages/tui/src/input/mouse.ts:281-296, :716-729`、`packages/tui/src/modes/ContextMenu.ts:81-110`、`TuiDispatcher.ts:514-589, :622-636, :921`、`dialogs.ts:230-235`。
- A8 文書: `docs/herdr-parity.md:30, :73`、`docs/tui-parity.md:35, :88, :129`、`docs/tui.md:133`、`docs/machines.md:60, :132`、`docs/verification.md`（節の新設）。
- A9 E2E: `packages/e2e/src/specs/`（新規）。手本は `workspace-tab-pane.spec.ts:501, :541`（worktree の作成）。

## 実装時の注意

- N1 リポジトリの判定は「今いる場所」の値で、変わる・一時的に null になる（F2）。所属の決め直しは `applyWorkspaceIdentity` の経路で起きる。null になったときに所属を消さない。
- N2 起動直後は `git: null`（F1）。保存した所属で並べ、移行は最初の確認の後にしかできない。
- N3 サーバはグループの位置を持たない（F4）。項目単位にするなら、平らな順の中で worktree グループをどう扱うかを決める。
- N4 判定の二重持ち（F5）を 1 つにする（サーバが client-core の純関数を使えるか——server は `@sodashitsu/client-core` に依存している）。
- N5 端末版は折りたたみの入口とグループ全体のドラッグが実質新設（F7）。
- N6 回帰の網は単体だけ（F10）。E2E を足す。
