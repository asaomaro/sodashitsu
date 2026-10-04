# タスク: グループのメンバーを「項目」（workspace か worktree グループ丸ごと）にする

## 実装方針

design.md のとおり、下から積む。型（T1）→ 純関数（T2・T3）→ サーバ（判定 T4 → モデル T5・T6 → RPC T7・T8 → 保存 T9 → 移行 T10）→ キーの定義（T11）→ ブラウザ版（T12〜T15）→ 端末版（T16〜T18）→ 古い関数の撤去（T19）→ E2E（T20）→ 文書（T21）。

**全タスク共通**
- **何が正か**: 決まりの本文は design.md の表と節（「レイアウトが変わる場面」「移行」「並びと名前順」「画面」「古いサーバ・古い画面」）。このチェックリストの「表の行」「(a)(b)(c)」はそこを指す。requirements F13 とのずれは `decisions.md` D2・D3、タスクの切り方の理由は D5。
- **用語**: 項目（グループ／リポジトリ／管理外の workspace）、入れ物（一番上か、グループの中）、参照（`g:<groupId>`・`r:<repoKey>`・`w:<workspaceId>`）、実効の `groupId`（サーバが計算して全 workspace に載せる所属）、仮の状態と確定（`layout` の無い保存から始めた移行の 2 つの状態）。
- **途中でビルドを壊さない**: T2 は新しい純関数を**今の関数の隣に足す**（今の `autoGroupsOf`・`groupedWorkspaceRows`・`visibleWorkspaceIdsInOrder` 等は T19 まで残す）。パッケージ間の import は `dist` 経由なので、`protocol`・`client-core` を変えたら `pnpm build` してから下流の型検査・テストを流す。server は tui を参照するので、tui の型エラーは server のビルドと E2E を止める。
- **層の決まり**: `SessionModel` は副作用なし（イベントと `persist.touch()` は `SessionService`）。`exactOptionalPropertyTypes` が有効なので、省略時はキーごと省く。zod の `.default` は推論型を必須にする（`messages.ts:170-174` のコメント）。
- **行番号はずれうる**（`research.md` の行番号は #77 より前の時点）。シンボル名で探す。
- 各タスクの完了で `pnpm build`・`pnpm typecheck` と該当パッケージのテストが通ること。回帰テストを足したら、実装の該当行を一時的に壊して落ちることを確かめ、**落ちたときの生の出力**を `review.md`（無ければ作る）の「タスク点検ログ」に貼る（条項 `regression-negative-control`）。意味が変わる既存のテスト（端で巡回する・workspace 1 件だけ動く等）は、消さずに新しい決まりで書き直す。E2E は条項 `e2e-observe-browser` に従う。
- 設計と違う判断・確かめた事実は `decisions.md` に足す（D の番号の続き）。Node は 24。

## チェックリスト

- [x] T1: プロトコル——`ItemRef`・`SidebarLayout`・`ItemTarget` の型、`SessionSnapshot.layout?`、イベント `sidebar.layout_changed`、RPC `item.move`・`item.move_by`（結果 `{moved}`）、`group.create` の省略可能な `workspaceId`。スキーマの単体テスト（あり・なし・不正な形・未知の項目を持つ旧形が通る）。**古い画面が知らないイベントを無視することを、`main` の版のコードで確かめる**（`git show main:packages/web/src/store/StoreAdapter.ts`・`main:packages/tui/src/model/SessionModel.ts`・`main:packages/client-core/src/net/Connection.ts` のイベントの分岐）。無視しないなら止まって知らせる
      対象: `packages/protocol/src/model.ts:39, :200-214`、`packages/protocol/src/events.ts:36-55`、`packages/protocol/src/messages.ts`（`WorkspaceMoveParams`・`WorkspaceMoveToParams`・`Group*Params`・`METHOD_SCHEMAS` の登録表・結果型の表）、`packages/protocol/src/messages.test.ts:93-135`（グループと並べ替えのテスト）
      依存: なし
      AC: AC14
- [x] T2: 純関数（木）——`itemRefOf`・`repoMembers`（本体が先頭・残りは開いた順・本体が無ければ先頭が暫定の頭）・`sidebarTree`（配信の途中の状態の決まり: レイアウトに無い workspace は一番上の末尾／実在しない参照は読み飛ばす／判定とレイアウトの食い違いは今の判定で項目を決める。名前順は一番上だけ）・**`visibleWorkspaceIdsOfTree`**（新しい名前で足す。今の `visibleWorkspaceIdsInOrder` は残す。畳んだグループ・畳んだ worktree グループの中は今いる workspace だけ）・`topUnitOf`・`layoutFromLegacy`（同じ `repoKey` は 1 つの項目、所属は本体の `groupId`、本体が無ければ最初に開いたもの。グループの位置は先頭のメンバーの平らな順、空は末尾）。単体テスト（AC の場面ごと）と、判定を壊して落ちる確認
      対象: `packages/client-core/src/workspace/workspaceGrouping.ts`（今の行の型・`autoGroupsOf`・`groupedWorkspaceRows`・`visibleGroupMembers`・`visibleWorkspaceIdsInOrder`）、`packages/client-core/src/workspace/workspaceGrouping.test.ts`、`packages/client-core/src/index.ts`（`export *` の並び）
      依存: T1
      AC: AC1, AC4, AC6, AC13, AC17
- [x] T3: 純関数（レイアウトの操作）——`sidebarLayout.ts`（新規）: `insertItem`・`removeItem`・`moveItem`（同じ入れ物の中だけ。入れ物が違う・自分自身・グループをグループの中へは動かさない）・`moveItemBy`（端で止まる）・`addItemToGroup`（末尾へ）・`removeItemFromGroup`（一番上の、そのグループの直後へ）・`deleteGroupFromLayout`（中身をグループのあった位置へ順に出す）・`flattenWorkspaceIds`・`repairLayout`（実在しない参照を捨てる・無い workspace を末尾へ・重複を除く。捨てた参照を返す）。単体テストと壊して落ちる確認
      対象: `packages/client-core/src/workspace/sidebarLayout.ts`（新規）、`packages/client-core/src/workspace/sidebarLayout.test.ts`（新規）、`packages/client-core/src/index.ts`
      依存: T1, T2
      AC: AC5, AC10, AC13
- [x] T4: サーバの判定——`GitInfoPoller.probe` の結果を 3 つ（git／管理外と確定／取れない）にする。HEAD は取れたが `--git-common-dir` が失敗した場合は「取れない」。起動後の最初の 1 周が終わった合図（T10 が使う。`start()` は引き継ぎの一時停止からの再開でも呼ばれるので、**合図は 2 回以上来うる**）。単体テスト（3 つの結果・1 周目の合図）。**実物の git の結合テスト**: 管理外／消えたフォルダ（取れない）／linked worktree。あわせて、`repoKey` の未確認（symlink を通った場所・bare・サブモジュール・コミットの無いリポジトリ）を実物で確かめ、結果を `decisions.md` に残す（保存のキーにするため。本体と worktree で値がずれる場合は止まって知らせる）
      対象: `packages/server/src/git/GitInfoPoller.ts`（`start`・`pollNow`・`followMoves`・`probe`）、`packages/server/src/infra/GitRunner.ts:21-45`（時間切れ・起動の失敗は reject、終了コードが 0 でないときは resolve）、`packages/server/src/git/worktree.ts:80-82`（`resolveCommonDir`）、`packages/server/src/composeServer.ts:475-482, :698`（`start()` の呼び出し）、`packages/server/src/git/GitInfoPoller.test.ts:108-126`（実物の git の手本）
      依存: なし
      AC: AC9
- [x] T5: サーバのモデル（状態と不変条件）——`SessionModel` に `layout`・`repoGroups` と、**「レイアウトを持たない（仮の状態）」を表せる形**（T10 が使う。この時点では常に「持つ」でよい）。workspace を作る（`w:<id>` を一番上の末尾へ）／workspace が無くなる（モデルの削除の 1 か所。空の項目を外す）／グループの作成・削除・出し入れの**モデル側**（レイアウトと `repoGroups`・`groupId` を合わせて書く。対象は項目丸ごと）／レイアウトか項目の中身が変わるたびに Map を平らな順へ並べ直す／実効の `groupId` を全 workspace に保つ／スナップショットに `layout`。モデルは副作用なしで「変わったもの」を返し、`SessionService` に**共通の出口**（`workspace.updated`・`sidebar.layout_changed`・`workspace.order_changed` を配り `persist.touch()`）を 1 つ作る。`workspace.closed` を出す 5 経路がその出口を呼ぶ。単体テスト（5 経路のどれでもレイアウトから外れイベントが出る・グループの作成／削除／出し入れ）と壊して落ちる確認
      対象: `packages/server/src/session/SessionModel.ts`（`groups`・`createGroup`〜`removeFromGroup`・`reorderWorkspaces`・workspace の削除〔:573 付近〕・`buildSnapshot`・`reserveWorkspace`）、`packages/server/src/session/SessionService.ts`（`createGroup`〜`removeFromGroup`、`workspace.closed` を出す `closeWorkspaceOne`・`closeTab`・`closePane`・`moveToTab`・`moveToNewTab`）、`packages/server/src/session/SessionModel.test.ts:890-1102`、`SessionService.test.ts:796-978`
      依存: T2, T3
      AC: AC3, AC4, AC10, AC15
- [x] T6: サーバのモデル（判定の反映）——design「レイアウトが変わる場面」の表の、判定が付く（**`repoGroups` を先に見る**・引き継ぎ・届く順に依らない）／判定が変わる／管理外と確定／取れない（何も変えない）／項目の中の順が変わる。判定の入口（`applyWorkspaceIdentity` と `updateWorkspaceGit`）を同じモデルの 1 つの入口に通す（署名が `GitInfo | null` から 3 つの結果に変わる）。`repoKey`・`isLinkedWorktree` が変わったら `persist.touch()`。単体テスト（表の行ごと。2 つの workspace に同時に判定が付く順序の両方）。**実物の git の結合テスト**: worktree を実際に作り、2 つ目が同じ項目・同じグループに入る（AC8）／pane の場所を別のリポジトリへ・管理外へ変えて `pollNow` し、レイアウトと所属が design のとおりになる（AC11）。壊して落ちる確認
      対象: `packages/server/src/session/SessionService.ts`（`identityCwdOf`・`applyWorkspaceIdentity`・`updateWorkspaceGit`・`sameGit`〔:1474-1482〕）、`packages/server/src/session/SessionModel.ts`、`packages/server/src/git/GitInfoPoller.ts`、`packages/server/src/git/GitInfoPoller.test.ts:108-126`
      依存: T4, T5
      AC: AC1, AC8, AC9, AC11
- [x] T7: サーバの RPC（グループと一括クローズ）——`group.create`（`workspaceId` があればその項目を新しいグループへ。位置は design の決まり）・`group.delete`・`group.add_member`／`remove_member`（項目丸ごと）の入口、`workspace.close` の一括クローズ（グループに入っていても `repoMembers` で全部）。単体テストと壊して落ちる確認
      対象: `packages/server/src/surface/methods/group.ts:14-60`、`packages/server/src/surface/methods/workspace.ts`（`workspace.close`）、`packages/server/src/session/SessionService.ts`（`closeWorkspace`）、`packages/server/src/surface/methods/index.test.ts:399-468`
      依存: T5
      AC: AC2, AC3, AC7, AC10
- [x] T8: サーバの RPC（並べ替え）——新しい `item.move`／`item.move_by`（結果 `{moved}`。実在しない ID は `not_found`）のハンドラと登録。`workspace.move` は項目の `item.move_by` として扱う。`workspace.move_to` の読み替え (a)(b)(c)。`moveWorkspace`／`moveWorkspacesTo` はレイアウトの操作へ委ねる薄い入口にする。**意味が変わる既存のテストを新しい決まりで書き直す**（`SessionModel.test.ts:948-1025`〔:955 の「端で巡回する」は逆になる〕・`SessionService.test.ts:809-927`）。単体テスト（古い要求の (a)(b)(c)・受け付けない移動は `{moved: false}`／何も配らない）と壊して落ちる確認
      対象: `packages/server/src/surface/methods/item.ts`（新規）、`packages/server/src/surface/methods/index.ts:29-49`（`registerXxxMethods` を足す）、`packages/server/src/surface/methods/workspace.ts:67-82`、`packages/server/src/session/SessionModel.ts`（`moveWorkspace`・`moveWorkspacesTo`）、`packages/server/src/session/SessionModel.test.ts:948-1025`、`SessionService.test.ts:809-927`
      依存: T5
      AC: AC2, AC5, AC14
- [x] T9: 保存と復元——`session.json` に optional の `layout`・`repoGroups`・workspace の `repoKey`／`isLinkedWorktree`（版は 1 のまま。`repoKey` の読み分け: 無い＝未確定／`null`＝管理外／文字列）。復元で `git` を戻す（`branch: null`・件数 0）。復元時の `repairLayout`（捨てた参照をログに出す）。単体テスト（保存→復元で同じ並び／起動直後に停止前と同じ束ね／壊れた参照でも起動する／古い版が読める形〔新しい項目を落としても読める〕）。**実物の git の結合テスト**: 保存 → 復元 → 最初の 1 周で判定が戻り、並びが変わらない（AC9）。壊して落ちる確認
      対象: `packages/server/src/persist/SessionFile.ts:42, :54, :59, :106, :123, :126, :130`、`packages/server/src/composeServer.ts:853-890`（`toSessionFileData`）、`packages/server/src/session/SessionModel.ts`（`restoreWorkspace`・`restoreGroup`）、`packages/server/src/session/SessionService.ts`（`restore`）、`packages/server/src/persist/SessionFile.test.ts:69, :83`
      依存: T6, T7, T8
      AC: AC9, AC10, AC14
- [x] T10: 移行——`layout` の無い保存は**仮の状態**で始める（`layoutFromLegacy` で毎回導く・`layout` と `repoGroups` を保存に書かない・スナップショットとイベントには導いた `layout` を載せる）。**確定は 1 回だけ**: 最初の 1 周の確認が終わったとき（合図が 2 回以上来ても 1 回）か、それより前の最初の操作（`group.*`〔`toggle_collapsed`・`rename` を除く〕・`item.*`・`workspace.move`・`workspace.move_to`）。単体テスト: 古い保存の形〔別々のグループ・本体だけがグループ・worktree だけがグループ・本体が開かれていない・単独の workspace・**本体の判定だけが 1 周目で取れない**（D2 の結果を固定する）〕／確定の前に止めても次の起動で同じ結果／確定の後は移行しない。壊して落ちる確認
      対象: `packages/server/src/session/SessionService.ts`（`restore`）、`packages/server/src/session/SessionModel.ts`、`packages/server/src/composeServer.ts:853-890`、`packages/server/src/git/GitInfoPoller.ts`（1 周目の合図）
      依存: T9
      AC: AC13
- [x] T11: キーの定義（web・端末版の共通）——`Action` の `navigate` の `op` に折りたたみの切り替えを足し、`NAVIGATE_KEYS` に `navigate_toggle_collapse`（既定 `z`。既存の 7 つの既定・予約済みの chord と重ならないことは点検で確認済み。実装でも確かめる）を足す。web と端末版の dispatcher に**何もしない受け口**を置き（型検査を通すため。動きは T15・T17）、設定の「キー」の一覧・キー一覧（HelpDialog）に出す。既存のテストの期待（キーの数）を直す
      対象: `packages/client-core/src/keys/actions.ts:76`、`packages/client-core/src/keys/navigateKeys.ts:28-71, :99-116`、`packages/client-core/src/keys/navigateKeys.test.ts:7-8, :19`、`packages/web/src/components/KeySettings.test.ts:77, :1111`（場所は grep で確かめる）、`packages/tui/src/settings/keySection.ts:355`、`packages/tui/src/actions/TuiDispatcher.ts:178-180, :1011-1014`、`packages/web/src/actions/ActionDispatcher.ts:1003-1040`、web と tui の HelpDialog
      依存: なし
      AC: AC-I3
- [x] T12: ブラウザ版の表示と順——ストアに `layout`（スナップショットと `sidebar.layout_changed`。`layout` が無いサーバでは `layoutFromLegacy`）。`Sidebar.vue` を `sidebarTree` で 3 段に描く（グループの見出し／worktree グループの先頭／子／通常の行。字下げ 0〜2）。種類の印（SVG のアイコン＋読み上げ用の文言「グループ」「worktree グループ」。畳んだサイドバーではアイコンだけ）。文言を「グループ」「worktree グループ」に。折りたたみ（グループはサーバ・worktree グループは `collapsedAutoGroups`。グループを畳むと中の worktree グループも隠れ、今いる workspace の行だけ残る）。**同じタスクで、workspace の切り替え・番号での切り替え・navigate の上下・pane のドロップ先の順を `visibleWorkspaceIdsOfTree` に替える**（描画とキー操作の順をずらさない）。`Sidebar.vue` と `model.ts:203` の古いコメント（「ブラウザ側」）を直す。既存の Sidebar のテストは `layout` の無い入力なので `layoutFromLegacy` を通る——「手動が優先」を前提にした期待を新しい決まりで書き直す。単体テスト
      対象: `packages/web/src/store/session.ts`・`StoreAdapter.ts:118-202`、`packages/web/src/components/Sidebar.vue`（行の型 `SpaceRow`・`spaces` の組み立て・折りたたみ・描画・スタイル）、`packages/web/src/store/view.ts`（`collapsedAutoGroups`）、`packages/web/src/actions/ActionDispatcher.ts:1010, :1082, :1091`、`packages/web/src/components/Sidebar.test.ts:715-1036`
      依存: T5, T10
      AC: AC1, AC4, AC6, AC12, AC15, AC-I1, AC-I5
- [x] T13: ブラウザ版のメニュー——所属なし:「グループへ追加…」「新しいグループを作る…」／所属あり:「別のグループへ移す…」「グループから外す」「新しいグループを作る…」／見出し:「名前の変更」「上へ移動」「下へ移動」「グループを削除」。worktree の子の行でも同じ項目で全体に働く。選択肢の並びはレイアウトの順。`ConfirmDialog` の件数は `repoMembers`。`layout` の無いサーバでは今までの RPC（出し入れは項目の workspace 全部に順に送る・グループの作成は 2 段・「上へ／下へ移動」は出さない）。名前順のとき「上へ／下へ移動」は受け付けず知らせる。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/ContextMenu.vue:89-112`、`GroupPickerDialog.vue:22`、`ConfirmDialog.vue:79`、`packages/web/src/actions/ActionDispatcher.ts:549-627`、`packages/web/src/components/Sidebar.vue:227-231`（メニューの入口）、`ContextMenu.test.ts:177-255`、`ConfirmDialog.test.ts:126-168`、`GroupPickerDialog.test.ts`、`ActionDispatcher.test.ts:1576-1727`
      依存: T7, T8, T12
      AC: AC2, AC3, AC7, AC-I2, AC-I4
- [x] T14: ブラウザ版のドラッグ——どの行を掴んでも項目が動く（子を掴めばその worktree グループ）。落とせるのは同じ入れ物の項目の間だけ。それ以外の上では落とせない印を出し、離しても何も送らず知らせる。`Esc`・行の外で取り消し。`item.move` を送る（`layout` の無いサーバでは `workspace.move_to`）。**名前順のときのドラッグの今の動きを先に確かめ**、一番上の並べ替えは受け付けず「名前順では並べ替えできません」と知らせる（グループの中は並べ替えられる）。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/Sidebar.vue:285-372`（D&D）、`packages/web/src/actions/ActionDispatcher.ts:1180-1182`（`moveWorkspacesByDrag`）、`packages/web/src/store/view.ts`（`workspaceDrag`）、`packages/web/src/components/Sidebar.test.ts`
      依存: T8, T12
      AC: AC2, AC5, AC-I2, AC-I5
- [x] T15: ブラウザ版のキーボード——navigate の選択を「行」に広げる（グループの見出しも上下で選べる。畳んだグループ・空のグループにも届く。見出しのキーの形は `group:<id>` 等にし、workspace の ID と混ざらないようにする）。`navigate_open_menu` は見出しを選んでいればグループのメニュー。`navigate_toggle_collapse` の動き（見出しならグループ、worktree グループの先頭ならその worktree グループ、子なら親の worktree グループ）。`move_workspace_previous`／`next` は項目の `item.move_by`（`layout` の無いサーバでは `workspace.move`。名前順のとき一番上は受け付けず知らせる）。「上へ／下へ移動」の後も見出しに選択が残る。単体テスト
      対象: `packages/web/src/store/view.ts:347, :545-547`（`navigateSelection`）、`packages/web/src/components/Sidebar.vue:241-252`（メニューを開く watch。今は workspace 固定）・`:466-490`（`sidebar-row-selected` の条件）、`packages/web/src/actions/ActionDispatcher.ts:1003-1040, :1167-1173`、`packages/client-core/src/keys/bindings.ts:206-219`
      依存: T11, T13
      AC: AC5, AC6, AC-I3, AC-I4, AC-I5
- [x] T16: 端末版の表示と順——モデルに `layout`（スナップショットとイベント。無いサーバでは `layoutFromLegacy`）。サイドバーを `sidebarTree` で 3 段に描く。種類の印（1 桁の記号。既存の `▸/▾` と並べる。色に頼らない。記号は端末版の既存の方針に合わせて決め、`decisions.md` に残す）。worktree グループの先頭の行に `▸/▾` を描き、当たり判定（`autoGroup`）を作る（先頭の行は、workspace の当たりと折りたたみの当たりの両方が要る。手本はマシンの見出しの `▸/▾` の当たり判定 `sidebar.ts:347`）。**同じタスクで、workspace の切り替え・番号・navigate の順を `visibleWorkspaceIdsOfTree` に替える**。単体テスト
      対象: `packages/tui/src/model/SessionModel.ts`（スナップショット・イベントの分岐 `:229-231`・`workspacesReordered`）、`packages/tui/src/render/chrome/sidebar.ts:26, :133-167, :347`、`packages/tui/src/input/mouse.ts:281-296`、`packages/tui/src/actions/TuiDispatcher.ts:920-928`、`packages/tui/src/model/SessionModel.test.ts`
      依存: T5, T10
      AC: AC1, AC6, AC12, AC15, AC16, AC-I5
- [x] T17: 端末版のメニューとキー——メニューを T13 と同じ項目に（worktree の子の行でも全体に働く。見出しのメニューに「上へ移動」「下へ移動」）。選択肢の並びはレイアウトの順。一括クローズの件数は `repoMembers`。navigate の選択を行に広げ（見出しのキーは、別のマシンの行のキー `remoteKey` と衝突しない形）、`navigate_open_menu` が見出しのメニューを開く（今は workspace の行固定）。`navigate_toggle_collapse` の動き。`move_workspace_previous`／`next` は項目の `item.move_by`。名前順のとき一番上の並べ替えは受け付けず知らせる。`layout` の無いサーバでの扱いは T13・T15 と同じ。単体テストと壊して落ちる確認
      対象: `packages/tui/src/modes/ContextMenu.ts:81-110`、`packages/tui/src/app/TuiApp.ts:1053, :1309-1321`、`packages/tui/src/actions/TuiDispatcher.ts:514-589, :622-636, :961-971, :1011-1047`、`packages/tui/src/model/UiState.ts:102-103, :165`、`packages/tui/src/modes/dialogs.ts:230-235`、`packages/tui/src/actions/TuiDispatcher.test.ts:869-938`、`packages/tui/src/modes/overlays.test.ts`
      依存: T7, T8, T11, T16
      AC: AC2, AC5, AC7, AC15, AC16, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T18: 端末版のマウス——worktree グループの `▸/▾` のクリックで折りたたみ。ドラッグを項目単位に（グループの見出しのドラッグの開始を新設・worktree グループ全体・落とせるのは同じ入れ物の中だけ。落とせないときは知らせる）。`item.move` を送る（`layout` の無いサーバでは `workspace.move_to`）。名前順の決まりは T14 と同じ。単体テストと壊して落ちる確認
      対象: `packages/tui/src/input/mouse.ts:292-296, :716-729`、`packages/tui/src/render/chrome/sidebar.ts:148`、`packages/tui/src/actions/TuiDispatcher.ts`（`moveWorkspacesByDrag`）
      依存: T17
      AC: AC5, AC16, AC-I2
- [x] T19: 古い関数の撤去と一致のテスト——`workspaceGrouping.ts` の古い関数（`autoGroupsOf`・`manualGroupsOf`・`groupedWorkspaceRows`・`linkedWorktreeChildrenOf`・古い `visibleWorkspaceIdsInOrder` と古い行の型）と、サーバの `linkedWorktreeGroupMembers`（とそのテスト `SessionModel.test.ts:1027-1110`）を消す（呼び出しが残っていないことを確かめる）。`visibleWorkspaceIdsOfTree` を元の名前 `visibleWorkspaceIdsInOrder` に戻す。**サーバと画面が同じ純関数を使い、同じ入力で同じ結果になるテスト**（配信の途中の状態を含む）。**2 つの接続の統合テスト**: 一方の接続で入れる・外す・並べ替える・畳むと、もう一方の接続に `sidebar.layout_changed`／`workspace.updated`／`group.updated` が届き、同じ木になる
      対象: `packages/client-core/src/workspace/workspaceGrouping.ts`・`workspaceGrouping.test.ts`、`packages/server/src/session/SessionModel.ts`（`linkedWorktreeGroupMembers`）・`SessionModel.test.ts:1027-1110`、`packages/server/src/composeServer.integration.test.ts`（2 接続の統合テストの手本。場所は grep で確かめる）
      依存: T10, T15, T18
      AC: AC14, AC15, AC17
- [x] T20: E2E——新しい spec: グループを作る・項目を入れる・外す・別のグループへ移す／worktree グループがグループの中でまとまって並ぶ・子の行のメニューで全体が動く／ドラッグで項目を並べ替える・外と中をまたぐと落とせない／畳む（グループ・worktree グループ）／後から worktree を開くと同じ worktree グループ・同じグループに入る／全部閉じて開き直すと同じグループに戻る・**サーバを再起動しても同じ並び**（`appServer.restart()`）／本体を閉じるときグループの中でも「worktree も一緒に閉じる」が出て全部閉じる／種類の印と読み上げ用の文言／**別の接続からの操作にブラウザの DOM が追従する**／キーだけで一巡（navigate の選択・メニュー・折りたたみ・並べ替え）。合否はブラウザの DOM とフレームで見る。判定は 5 秒周期なので、イベントか DOM を待つ（固定の待ち時間を入れない）。観測を壊して落ちる確認。2 回続けて同じ結果
      対象: `packages/e2e/src/specs/workspace-groups.spec.ts`（新規）、手本は `packages/e2e/src/specs/workspace-tab-pane.spec.ts:501, :541`（`makePlainRepo` と worktree の作成）、`packages/e2e/src/support/appServer.ts:33, :86`（`openClient`・`restart`）・`wsClient.ts`（`waitForEvent`）
      依存: T19
      AC: AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC12, AC15, AC18, AC-I1, AC-I2, AC-I3
- [x] T21: 文書——`docs/herdr-parity.md`（H04・H37b: グループは独自の拡張、メンバーは項目）、`docs/tui-parity.md`（H04w・H37b・W04 を実態に直す）、`docs/tui.md`、`docs/machines.md`（別のマシンの行は今までどおり）、`docs/verification.md`（グループの節を新設し、自動テストで確かめた範囲と実機の手順を分けて書く。AC11〔cd で別のリポジトリへ移る〕・AC15／AC16〔端末版とブラウザ版を同じサーバで並べて見る・端末版の折りたたみとドラッグ〕の実機の手順、`repoKey` の既知の制約〔T4 の結果〕を含める）
      対象: `docs/herdr-parity.md:30, :73`、`docs/tui-parity.md:35, :88, :129`、`docs/tui.md:133`、`docs/machines.md:60, :132`、`docs/verification.md`（「共通：…」の形式の節・既知の制約）
      依存: T20
      AC: AC11, AC16, AC18

## 追補 01 のタスク（`amendment-01.md`。T16〜T21 より先に行う）

- [x] T22: 型——`GitInfo.worktreeKey`、`SidebarLayout` を追補 B の形（`top` はまとまりの順で `"u"` を含む・`ungrouped`）に、`ItemTarget` に `{ kind: "ungrouped" }`、共有の設定に「グループなし」を畳んだかの真偽。スキーマと型のテストを直す
      対象: `packages/protocol/src/model.ts`（`GitInfo`・`SidebarLayout`）、`packages/protocol/src/messages.ts`（`ItemTarget`・`item.move`／`item.move_by`・共有の設定の型。`collapsedAutoGroups` の隣）、`packages/protocol/src/messages.test.ts`
      依存: T15
      AC: AC19, AC20
- [x] T23: 純関数——代表の決まり（`itemRefOf(ws, workspaces)`・`repoMembers` は代表だけ・`worktreeKey` が無い古いサーバでは全部メンバー）、`sidebarTree` をまとまりの列（グループと「グループなし」。本物のグループが無ければ見出しなし）に、畳んだ worktree グループの隠れている数、`visibleWorkspaceIdsOfTree`（畳んだ「グループなし」）、`topUnitOf`（「グループなし」の中はグループ扱いしない）、`layoutFromLegacy`、`sidebarLayout.ts` の操作を新しい形に（新しい workspace・外す・グループの削除は `ungrouped` の末尾へ、新しいグループは `"u"` の直前、まとまりの並べ替え、`flattenWorkspaceIds`・`repairLayout`）。単体テストを新しい決まりで書き直し、壊して落ちる確認
      対象: `packages/client-core/src/workspace/workspaceGrouping.ts`・`sidebarLayout.ts` とそのテスト
      依存: T22
      AC: AC19, AC20, AC17
- [x] T24: サーバ——`GitInfoPoller` が `worktreeKey` を返す、判定の反映に代表の交代（代表が閉じる・移る・`worktreeKey` が変わる）、レイアウトの保ち方を新しい形に（表の各場面を追補 B の置き場に）、`group.*`・`item.*`・`workspace.move`／`move_to`・一括クローズ（代表だけ）を合わせる、保存と復元（`worktreeKey`・`ungrouped`）、仮の状態と確定。単体テストと、実物の git の結合テスト（同じフォルダで 2 つ目を開くと通常の項目・代表を閉じると次が worktree グループに入る）。壊して落ちる確認
      対象: `packages/server/src/git/GitInfoPoller.ts`、`packages/server/src/session/SessionModel.ts`・`SessionService.ts`、`packages/server/src/surface/methods/{group,item,workspace}.ts`、`packages/server/src/persist/SessionFile.ts`、`packages/server/src/composeServer.ts`（`toSessionFileData`）と各テスト
      依存: T23
      AC: AC19, AC20, AC8, AC10, AC13
- [x] T25: ブラウザ版の表示——B3 の見た目（グループの見出し: 折りたたみ・状態のまとめ・フォルダの印・名前・横線・数。面・帯なし）、「グループなし」の見出し（本物のグループがあるときだけ・フォルダの印なし・畳める）、worktree グループの木の線・worktree の印・ブランチ名、畳んだ worktree グループの状態のまとめと `+n`、代表でない workspace は通常の行。状態のまとめは既存の `aggregate`・`displayStateFor` で計算する。単体テスト
      対象: `packages/web/src/components/Sidebar.vue`（`rowStateFor`・行の組み立て・描画・スタイル）、`packages/web/src/store/view.ts`（畳んだ状態）、`packages/web/src/components/Sidebar.test.ts`、見本は `.aidev/works/20261004-group-worktree-items/mock-sidebar.html`
      依存: T24
      AC: AC19, AC20, AC21, AC12
- [x] T26: ブラウザ版の操作——メニュー（「グループなし」の見出しは「上へ移動」「下へ移動」だけ。「グループから外す」は「グループなし」の末尾へ）、ドラッグ（項目は同じまとまりの中だけ・まとまりどうしの並べ替え・「グループなし」の見出しも掴める）、navigate の選択と `navigate_toggle_collapse`・`navigate_open_menu`（「グループなし」の見出し）、`move_workspace_previous`／`next`。`layout` の無いサーバでの扱いは今までどおり。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/ContextMenu.vue`・`GroupPickerDialog.vue`、`packages/web/src/actions/ActionDispatcher.ts`、`packages/web/src/components/Sidebar.vue`（D&D・navigate）とそのテスト
      依存: T25
      AC: AC20, AC5, AC-I2, AC-I3
- [x] T27: 端末版——T16〜T18 の内容を、追補の構造と T4 の見た目で行う（グループの見出し `▾ ◐ <名前> ─── <数>`・「グループなし」・状態のまとめ・worktree グループの木の線と `⎇` と `+n`・ブランチ名・メニュー・navigate・クリックの当たり判定・項目とまとまりのドラッグ）。**T16・T17・T18 は、このタスクの中で、追補の決まりで消化する**（別々のコミットにしてよい）
      対象: T16・T17・T18 の `対象:` と同じ
      依存: T24
      AC: AC19, AC20, AC21, AC15, AC16
- [x] T28: E2E と文書の反映——T20（E2E）と T21（文書）に、AC19〜AC21 の場面（同じフォルダの 2 つ目・「グループなし」の出入りと並べ替え・見出しの状態のまとめ・畳んだ worktree グループの `+n`）を足して行う
      対象: T20・T21 の `対象:` と同じ
      依存: T26, T27, T19
      AC: AC19, AC20, AC21, AC18

## 独立レビューの指摘（`review-findings-01.md`。main の取り込みの後）

- [x] T29: 代表の決め方を「その `worktreeKey` を最初に持った workspace・既存の代表は奪われない」にする（サーバが代表を決めて配る・保存する。古いサーバでは今の導き方）。`SessionModel.test.ts:1684-1693` を新しい決まりに直す。モデルと E2E の回帰テスト（「グループなし」を上に並べ替えてから＋新規／並べ替えた後に別の workspace が cd で同じフォルダへ来る）と壊して落ちる確認
      対象: `packages/server/src/session/SessionModel.ts`・`SessionService.ts`・`persist/SessionFile.ts`・`composeServer.ts`、`packages/client-core/src/workspace/workspaceGrouping.ts`・`sidebarLayout.ts`、`packages/protocol`、`packages/e2e/src/specs/workspace-groups.spec.ts`
      依存: なし
      AC: AC19
- [x] T30: ブラウザ版のドラッグの落とす位置を端末版の決まり（上へなら落とした項目の前・下へなら次の項目の前・末尾は null）に揃える。計算は client-core の共有の純関数に。E2E に下へ・末尾へのドラッグを足す
      対象: `packages/web/src/components/Sidebar.vue`、`packages/web/src/actions/ActionDispatcher.ts`、`packages/tui/src/input/sidebarDrag.ts`、`packages/client-core/src/workspace/`、`workspace-groups.spec.ts`
      依存: なし
      AC: AC5
- [x] T31: `git rev-parse` の出力の検査（古い git が知らないオプションをそのまま出力して終了コード 0 を返す）。壊れた値は `unknown` 扱い。単体テスト・docs の記述の訂正
      対象: `packages/server/src/git/GitInfoPoller.ts`・`worktree.ts`、`docs/verification.md`
      依存: なし
      AC: AC9
- [x] T32: nit の整理（`layoutConfirmWiring.test.ts` の固定待ち・`SessionFile.ts` の `repoGroups` の形の不一致・保存の `repoKey` のコメント・`orderedWorkspaceIds` の撤去）と、`workspace-tab-pane.spec.ts:305` の落ちる件の確認
      対象: review-findings-01.md の 4〜7 と「確かめること」
      依存: T29, T30, T31
      AC: AC9, AC10

## 再レビューの指摘（`review-findings-02.md`）

- [x] T33: `keepRepresentativesFirst`（代表を平らな順で先に置く入れ替え）をやめ、平らな順をレイアウトの木を上から読んだ順そのままにする。`settle` の冪等・worktree グループの子の順が不変（linked worktree 2 つ以上の形）。回帰テスト（モデル・`clientAgreement`・E2E 1 件）と壊して落ちる確認
      対象: `packages/client-core/src/workspace/sidebarLayout.ts`・`workspaceGrouping.ts`、`packages/server/src/session/SessionModel.ts`・`SessionModel.clientAgreement.test.ts`、`packages/e2e/src/specs/workspace-groups.spec.ts`
      依存: なし
      AC: AC19
- [x] T34: 古い git（2.31 未満）では、`--path-format=absolute` がそのまま 1 行目に返ってきたとき、残りの行を cwd から解決して使う（main の `resolveCommonDir` の形）。それ以外の壊れた出力だけ `unknown`。単体テストと壊して落ちる確認、docs の記述
      対象: `packages/server/src/git/GitInfoPoller.ts`・`worktree.ts`、`docs/verification.md`
      依存: なし
      AC: AC9
- [x] T35: nit（保存に旗・worktreeKey の無い同じフォルダの workspace の代表を作った順で決める／改行を含むパスの記録）
      対象: `packages/server/src/session/SessionModel.ts`・`SessionService.ts`、decisions.md
      依存: T33, T34
      AC: AC19
