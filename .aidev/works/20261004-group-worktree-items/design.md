# 仕様: グループのメンバーを「項目」（workspace か worktree グループ丸ごと）にする

## 概要

サイドバーの並びを、サーバが持つ**項目の木（レイアウト）**で表す。一番上は項目の列、グループの中も項目の列で、項目は「グループ」「リポジトリ（そのリポジトリの workspace 全部＝2 つ以上なら worktree グループ、1 つなら通常の行）」「git 管理外の workspace」の 3 種類。
グループの所属はリポジトリ単位の表（`repoGroups`）と、管理外の workspace の `groupId` で持ち、サーバが各 workspace の実効の `groupId` を計算して載せる（画面の型は今のまま読める）。
workspace ごとの直前のリポジトリの判定を保存し、起動直後も停止前と同じ並びにする。並びの計算は `client-core` の純関数 1 か所に集め、サーバ・ブラウザ版・端末版が同じものを使う。

## 設計方針

- **並びの正はサーバのレイアウト**（`SidebarLayout`）。今は「workspace の平らな順」だけが正で、グループの位置は先頭メンバーから導いていた（research F4）。グループが中身と無関係に位置を持つ（F9）には位置の情報が要るので、項目の順序を明示して持つ。
  - workspace の平らな順（`workspaces` Map の順・`workspace.order_changed`）は、レイアウトを平らにしたものに**サーバが並べ直して保つ**（古い画面はこれと `groupId` で今までどおり描ける）。レイアウトが持つのは項目の順だけで、**リポジトリの項目の中の順（本体が先頭・残りは開いた順）は Map の順が正**。レイアウトか項目の中身が変わるたびに、既存の `reorderWorkspaces`（`SessionModel.ts:525`）で Map を平らな順へ並べ直す（スナップショットの `workspaces` の順も Map の順。`:914`）。
  - 既存の `moveWorkspace`／`moveWorkspacesTo`（`SessionModel.ts:487-521`）は、レイアウトの操作へ委ねる薄い入口にする。画面のストアの `workspacesReordered`（web `store/session.ts:77`・tui `model/SessionModel.ts:157`）は残す。
- **リポジトリは常に 1 つの項目**。workspace が 1 つでも項目は「リポジトリ」で、2 つ目が開くと同じ項目に加わる（項目の位置・所属は動かない。F3・F4）。描画だけが、1 つなら通常の行、2 つ以上なら worktree グループに変わる（herdr と同じ「2 つ以上で束ねる」）。
- **所属の正**: git 管理下は `repoGroups[repoKey]`、管理外・判定前は workspace の `groupId`。`Workspace.groupId` は、サーバが計算した**実効の所属**として全 workspace に載せる（リポジトリの全 workspace が同じ値になる）。
- **判定は 3 つの結果**にする: git（`repoKey` が取れた）／管理外と確定（`rev-parse --abbrev-ref HEAD` の終了コードが 0 でない）／取れない（例外＝時間切れ・起動できない。`git.run` は時間切れと起動の失敗で reject し、終了コードが 0 でないときは resolve する。`packages/server/src/infra/GitRunner.ts:21-45`）。**HEAD は取れたが `--git-common-dir` が失敗した場合（今は `git` が非 null で `repoKey: null`。`GitInfoPoller.ts:116-127`）は「取れない」に寄せる**。取れない間は直前の判定を保つ（F7）。
- **判定の決まりは 1 か所**: 「どの workspace が同じ項目か・worktree グループの先頭はどれか・行の並び・一番上のまとまり」を `packages/client-core/src/workspace/` の純関数に置き、サーバ（`@sodashitsu/client-core` に依存済み）も同じ関数を使う。サーバの `linkedWorktreeGroupMembers` の書き写しをやめる（research F5）。
- **新しい操作は項目単位の RPC**（`item.move`・`item.move_by`）。既存の `group.add_member`／`remove_member`・`workspace.move`／`move_to`・`workspace.close` は意味を項目単位に読み替えて残す（古い画面・外部の呼び出し元のため。F14）。
- **保存は項目を足すだけ**（版は 1 のまま。`z.object` は知らない項目を落とすので、古い版は読める。research F11）。
- **代替案を退けた理由**:
  - workspace の `groupId` を同じリポジトリで揃えるだけの方式（表を持たない）→ 全部閉じると所属が消える（F5 を満たせない）。グループの位置も持てない。
  - 位置をグループに番号で持たせ、平らな順は今のままにする方式 → 平らな順とグループの番号の 2 つの正ができ、worktree グループを丸ごと動かす・外と中をまたがない、の検査が複雑になる。
  - 画面ごとに並びを計算し続ける方式 → 判定できない間の「直前を保つ」と、起動直後の並びを画面では作れない。

## 対象範囲

- `packages/protocol/src/` — `model.ts`（`SidebarLayout`・`SessionSnapshot.layout`）、`events.ts`（`sidebar.layout_changed`）、`messages.ts`（`item.move`・`item.move_by`）。
- `packages/client-core/src/workspace/` — `workspaceGrouping.ts` を項目の木の計算に書き直す。`sidebarLayout.ts`（新規。レイアウトの操作の純関数）。
- `packages/server/src/` — `session/SessionModel.ts`・`SessionService.ts`（レイアウト・`repoGroups`・判定の反映・移行）、`git/GitInfoPoller.ts`（3 つの結果）、`persist/SessionFile.ts`・`composeServer.ts`（保存）、`surface/methods/group.ts`・`workspace.ts`・`item.ts`（新規）。
- `packages/web/src/` — `components/Sidebar.vue`・`ContextMenu.vue`・`GroupPickerDialog.vue`・`ConfirmDialog.vue`、`actions/ActionDispatcher.ts`、`store/session.ts`・`StoreAdapter.ts`。
- `packages/tui/src/` — `render/chrome/sidebar.ts`、`input/mouse.ts`、`modes/ContextMenu.ts`・`dialogs.ts`、`actions/TuiDispatcher.ts`、`model/SessionModel.ts`。
- `packages/e2e/src/specs/`（新規の spec）、`docs/herdr-parity.md`・`docs/tui-parity.md`・`docs/tui.md`・`docs/machines.md`・`docs/verification.md`。
- 変えない: worktree グループの判定の中身（`repoKey` の作り方・2 つ以上で束ねる）、モバイルの一覧、別のマシンの行、`sodactl`。

## 依拠する既存の事実

出所は `research.md`（節名と file:line）。

- 今の所属は `Workspace.groupId` だけで、グループは `{id, label, collapsed}`（research F1。`packages/protocol/src/model.ts:39, :200-205`）。
- サーバの順序は `workspaces` Map の反復順だけで、グループの位置の値は無い（research F4）。
- git の判定は保存されず、復元直後は全 workspace が `git: null`（research F1。`SessionModel.ts:942`）。判定は `GitInfoPoller` の 5 秒周期と作成直後の即時の確認で届き、`applyWorkspaceIdentity`（`SessionService.ts:378-392`）と `updateWorkspaceGit`（`:1126`）で反映される（research F2）。
- `GitInfoPoller.probe`（`packages/server/src/git/GitInfoPoller.ts:98-131`）: `rev-parse --abbrev-ref HEAD` の終了コードが 0 でなければ `null`（:101。管理外・コミットなし）、例外（時間切れ・git が無い）は `catch` で `null`（:128）。**2 つは今も別の経路**（この work で読んで確認）。
- `GitInfo` は `{branch, ahead, behind, repoKey, isLinkedWorktree}`（`packages/protocol/src/model.ts:14-29`。この work で読んで確認）。
- 並びの計算は `packages/client-core/src/workspace/workspaceGrouping.ts`（research F4）で、使用箇所は web 3 か所・tui 3 か所（同 F4）。サーバは同じ判定を `SessionModel.ts:459-480` に持つ（research F5）。
- `session.json` は `schema: 1` 固定で、項目の追加は `.default`／optional で行ってきた（research F1・F11。`packages/server/src/persist/SessionFile.ts:54, :106, :123, :126, :130`）。
- `workspace.move` は平らな入れ替え、`workspace.move_to` は任意の ID 列を受ける（research F3。`SessionModel.ts:487-521`）。`workspace.close` の一括クローズは `linkedWorktreeGroupMembers` に依る（`SessionService.ts:463-467`）。
- ブラウザ版の D&D・メニュー・折りたたみの今の作り（research F6）、端末版に worktree グループの折りたたみの入口と全体のドラッグが無いこと（research F7）。
- worktree グループの折りたたみは共有の設定 `collapsedAutoGroups`（`repoKey` の配列。research F6）。
- グループと並べ替えの E2E は無い（research F10）。
- **未確認**: `name` 順のときのドラッグの今の結果（research F6）。symlink・bare・サブモジュールでの `repoKey` の値（research F2）。タスクの中で確かめる。

## インターフェース / データ構造

### プロトコル

```ts
/** 項目の参照。`g:<groupId>`（グループ）・`r:<repoKey>`（リポジトリ）・`w:<workspaceId>`（git 管理外・判定前の workspace）。 */
type ItemRef = string;
interface SidebarLayout {
  /** 一番上の項目の順。 */
  top: ItemRef[];
  /** グループの中の項目の順（`g:` は入らない）。空のグループも空の配列で持つ。 */
  groups: Record<GroupId, ItemRef[]>;
}
// SessionSnapshot に `layout?: SidebarLayout` を足す（古いサーバには無い）。
// イベント: { event: "sidebar.layout_changed", data: { layout: SidebarLayout } }

/** 操作の対象。workspace を指すと、その workspace の項目（リポジトリなら丸ごと）になる。 */
type ItemTarget = { kind: "group"; groupId: GroupId } | { kind: "workspace"; workspaceId: WorkspaceId };
// item.move    { item: ItemTarget, before: ItemTarget | null }   // 同じ入れ物の中で before の前へ。null は末尾
// item.move_by { item: ItemTarget, direction: "previous" | "next" } // 同じ入れ物の中で 1 つ動かす。端では動かない
```

- 結果はどちらも `{ moved: boolean }`。入れ物が違う・自分自身・グループをグループの中へ、は `moved: false`（エラーにしない）。画面は `moved: false` を「落とせない」の知らせに使う。
- `group.add_member {groupId, workspaceId}`: その workspace の**項目**を、グループの末尾へ入れる（別のグループに居れば移す）。`group.remove_member {workspaceId}`: 項目をグループから出し、一番上の、そのグループの直後へ置く。`group.create {label}` に省略可能な `workspaceId` を足す（その項目を新しいグループへ入れる。位置は下の決まり）。
- `workspace.move`（平ら）: その workspace の項目に対する `item.move_by` として扱う。`workspace.move_to {workspaceIds, beforeWorkspaceId}`: ID の集まりが「同じ入れ物の中の、1 つ以上の項目のちょうど全部」で、`beforeWorkspaceId` が同じ入れ物の項目の先頭の workspace（または null）のときだけ動かす。それ以外は何もしない（`null` を返す今の形のまま）。
- `workspace.close {closeLinkedWorktrees}`: その workspace が worktree グループの先頭なら、グループに入っていても同じリポジトリの workspace を全部閉じる。

### サーバの状態と保存（`session.json`）

```ts
// SessionModel
layout: SidebarLayout;
repoGroups: Map<string /* repoKey */, GroupId>;   // リポジトリの所属（開いていないリポジトリの分も残る）
// Workspace.git は「直前の判定」。取れない間は書き換えない。
// Workspace.groupId は実効の所属（リポジトリなら repoGroups から、そうでなければ自分の値）。

// SessionFile（すべて optional。版は 1 のまま）
layout?: { top: string[]; groups: Record<string, string[]> };
repoGroups?: Record<string, string>;
workspaces[].repoKey?: string | null;         // 直前の判定
workspaces[].isLinkedWorktree?: boolean;
```

- 保存した `repoKey` の読み分け: 項目が無い＝まだ一度も確定していない／`null`＝管理外と確定／文字列＝そのリポジトリ。
- 復元: `repoKey` が文字列で保存されていれば `git: { branch: null, ahead: 0, behind: 0, repoKey, isLinkedWorktree }` として戻す（ブランチ名と件数は最初の確認で入る）。`layout` が無いファイルは、移行待ち（下の「移行」）で始める。
- 整合の検査（復元時）: 実在しないグループ・workspace・`repoGroups` の行き先を指す参照は捨て、レイアウトに無い workspace は一番上の末尾へ足す（壊れた保存でも起動する）。

### 純関数（`packages/client-core/src/workspace/`）

```ts
itemRefOf(ws): ItemRef                         // git.repoKey があれば r:<repoKey>、無ければ w:<id>
repoMembers(workspaces, repoKey): Workspace[]  // 本体が先頭、残りは開いた順。本体が無ければ開いた順のまま（先頭が暫定の頭）
sidebarTree(workspaces, groups, layout, sort): TopRow[]   // 描画用の木（下）
visibleWorkspaceIdsInOrder(tree, collapsedGroups, collapsedRepos, focusedId): WorkspaceId[]
topUnitOf(workspaceId, workspaces, layout): { kind: "group"; groupId } | { kind: "repo"; repoKey } | { kind: "workspace"; workspaceId }
layoutFromLegacy(workspaces, groups): SidebarLayout       // layout を持たない古いサーバ・古い保存のための仮の木
// sidebarTree の決まり（配信の途中の状態でも崩れないこと）: レイアウトに無い workspace は一番上の末尾に足す／実在しない参照は読み飛ばす／
//   workspace の itemRefOf とレイアウトの参照が食い違うときは、workspace の今の判定（itemRefOf）で項目を決め、置き場所はレイアウトにある参照のうち先に見つかったもの。
// sidebarLayout.ts（レイアウトを変える純関数。サーバが使う）
insertItem / removeItem / moveItem / moveItemBy / addItemToGroup / removeItemFromGroup / deleteGroupFromLayout / flattenWorkspaceIds / repairLayout
```

描画用の木:

```ts
type ItemRow =
  | { kind: "workspace"; workspace: Workspace }                                  // 管理外、またはリポジトリに 1 つだけ
  | { kind: "worktreeGroup"; repoKey: string; head: Workspace; children: Workspace[] };
type TopRow = ItemRow | { kind: "group"; group: WorkspaceGroup; items: ItemRow[] };
```

## 振る舞いの詳細

### レイアウトが変わる場面（サーバ）

| 場面 | レイアウトと所属 |
|---|---|
| workspace を作る（判定前） | `w:<id>` を一番上の末尾へ。`groupId` は null |
| 判定が付く（`w:<id>` → リポジトリ R） | **先に `repoGroups[R]` を見る**。(1) あれば R の所属に従う: `r:R` があれば加わり、無ければそのグループの末尾へ `r:R`。(2) 無く、workspace に `groupId`（G）があれば `repoGroups[R] = G` にし、`r:R` が別の場所にあれば**丸ごと G の末尾へ移して**加わる。無ければ `w:<id>` を同じ場所で `r:R` に置き換える（F6 の引き継ぎ。届く順に依らない——`GitInfoPoller.pollNow` は `Promise.all` で順序が決まらない。`GitInfoPoller.ts:72`）。(3) どちらも無ければ、`r:R` があれば加わり、無ければ同じ場所で `r:R` に置き換える。いずれも最後に `w:<id>` を外す |
| 判定が変わる（R1 → R2） | R1 から抜ける（R1 が空になれば `r:R1` を外す。`repoGroups[R1]` は残す）。`r:R2` があれば加わる。無く `repoGroups[R2]` があればそのグループの末尾へ `r:R2`。どちらも無ければ、一番上の、元の項目の一番上のまとまりの直後へ `r:R2`（グループの外） |
| 管理外と確定（R1 → なし） | R1 から抜け、同じ入れ物の `r:R1` の直後（R1 が空なら同じ場所）に `w:<id>`。`groupId` はその入れ物のグループ |
| 取れない | 何も変えない（`git` も書き換えない） |
| workspace が無くなる | 項目から抜ける。空になった項目はレイアウトから外す（`repoGroups` は残す）。**モデルの削除の 1 か所（`SessionModel.ts:573`）で行う**——`workspace.closed` を出す経路は 5 つある（`SessionService.ts:495` closeWorkspaceOne・`:635` closeTab・`:812` closePane〔シェルの終了を含む〕・`:950` moveToTab・`:985` moveToNewTab）ので、どの経路でも外れるようにする |
| 項目の中の順が変わる（本体が後から開く・`isLinkedWorktree` が変わる） | レイアウトは変わらないが、Map を並べ直し `workspace.order_changed` を配る |
| グループを作る | 対象の項目が一番上にあれば、その位置にグループを置いて項目を中へ。対象がグループ G の中なら、G の直後に置いて項目を移す。対象が無ければ一番上の末尾 |
| グループを削除 | 中の項目を、グループのあった位置へ順に出す。`repoGroups` のそのグループ行きを全部消す。workspace の `groupId` を null |
| グループへ入れる／外す／移す | 上の RPC の決まり。所属（`repoGroups`／`groupId`）を合わせて書き換える |
| 並べ替え | `item.move`／`item.move_by`。同じ入れ物の中だけ |

- どの場面でも最後に、(1) 実効の `groupId` が変わった workspace に `workspace.updated`、(2) レイアウトが変わっていれば `sidebar.layout_changed`、(3) 平らな順が変わっていれば `workspace.order_changed`（古い画面向け）を配り、`persist.touch()` する。
- 判定の保存: `git.repoKey`／`isLinkedWorktree` が変わったときも `persist.touch()`（今は名前が変わったときだけ）。

### 移行（`layout` の無い保存データ）

「仮の状態」と「確定した状態」の 2 つを持つ。

- **仮の状態**（`layout` の無い保存から始めたとき）: レイアウトを持たず、毎回 `layoutFromLegacy(workspaces, groups)` で**導く**。`repoGroups` は空のまま。判定が届いたら `git` は入れる（worktree グループは今までどおり最初の確認で出る）が、「判定が付く」の表の決まりは当てない。
  - `layoutFromLegacy` の決まり（F13 そのもの）: 同じ `repoKey` の workspace は 1 つの項目にし、その所属は**本体の `groupId`**、本体が開かれていなければ最初に開いた workspace の `groupId`（null なら所属なし）。項目の位置は、所属するグループの中（グループの位置は、今と同じく先頭のメンバーの平らな順。空のグループは末尾）か、一番上の、項目の先頭の workspace の平らな順の位置。判定前・管理外の workspace は自分の `groupId` で置く。
  - この間に保存するときは、`layout`・`repoGroups` を**書かない**（`repoKey`・`isLinkedWorktree` だけ書く）。途中で止まっても、次の起動はまた仮の状態から始まる（移行が失われない）。
- **確定する時点**（1 回）: (a) 起動後の最初の 1 周の確認が終わったとき（`GitInfoPoller.start()` の 1 周。取れなかった workspace は判定前のまま含める）、または (b) それより前に利用者がグループ・並びの操作をしたとき（先に確定してから、その操作を当てる）。確定では、その時点の `layoutFromLegacy` の結果をレイアウトにし、各リポジトリの所属を `repoGroups` に書く。以後は「レイアウトが変わる場面」の表の決まりで保つ。
- 仮の状態でも、スナップショットには導いた `layout` を載せ、変わったら `sidebar.layout_changed` を配る（新しい画面が「古いサーバ」と見なして古い RPC を送らないように。画面にとっては、仮か確定かの区別は無い）。確定のきっかけ (b) に当たる操作は `group.*`（`toggle_collapsed`・`rename` を除く）・`item.*`・`workspace.move`・`workspace.move_to`。確定は 1 回だけ（`GitInfoPoller.start()` は引き継ぎの一時停止からの再開でも呼ばれ、1 周の合図は 2 回以上来うる。`composeServer.ts:475-482, :698`）。
- 確定の後に保存したファイルは `layout` を持つので、次の起動では移行しない（何度起動しても同じ）。保存した `repoKey` があれば、仮の状態でも起動直後から束ねて並ぶ。
- 引き継ぎ（`soda handoff`）は `SessionService.restore` と同じ経路なので、同じ決まり（古い版からの引き継ぎは仮の状態から始まる）。

requirements F13 は「本体の判定がまだ取れていない間は決めず、取れた時点で決める」と書くが、判定が取れない workspace（消えたフォルダに居る pane 等）が残ると移行が止まり続けるので、**最初の 1 周で取れた判定で確定する**（本体の判定が 1 周目で取れなかった場合だけ、F13 と結果が違いうる。その workspace は後から「判定が付く」の決まりで、リポジトリの所属に従って加わる）。`decisions.md` に残す。

### 並びと名前順

- `sort === "opened"`: レイアウトの順のまま。
- `sort === "name"`: 一番上の項目だけを名前（グループはグループの名前、worktree グループは先頭の workspace の名前、workspace はその名前）で並べる。グループの中・worktree グループの中はレイアウトの順（今の「グループの中は常に開いた順」を引き継ぐ）。
- 名前順のとき、一番上の並べ替え（ドラッグ・キーボード・グループの見出しのメニューの「上へ移動」「下へ移動」）は受け付けず「名前順では並べ替えできません」と知らせる。グループの中の並べ替えはできる。**今の動きを先に確かめる**（research F6 の未確認）。今が「送るが見た目が変わらない」なら、この決まりに変える。

### 画面（ブラウザ版・端末版共通の決まり）

- 行の種類: グループの見出し／worktree グループの先頭（＝本体の workspace の行）／worktree グループの子／通常の workspace。字下げは入れ物の深さ（0〜2）。
- 種類の印: グループの見出しにグループの印、worktree グループの先頭に worktree の印。ブラウザ版は SVG のアイコン＋読み上げ用の文言（「グループ」「worktree グループ」）、畳んだサイドバーではアイコンだけを出す。端末版は 1 桁の記号（既存の `▸/▾` と並べる。記号は端末版の既存の方針に合わせて実装で決め、色に頼らない）。
- 「グループへ追加…」「別のグループへ移す…」の選択肢の並びは、レイアウトの順（今は作成順。`GroupPickerDialog.vue:22`）。
- メニュー（workspace の行。worktree の子の行でも同じ項目で、全体に働く）: 所属なし →「グループへ追加…」「新しいグループを作る…」。所属あり →「別のグループへ移す…」「グループから外す」「新しいグループを作る…」。グループが 1 つも無ければ「グループへ追加…」は出さない。グループの見出し →「名前の変更」「上へ移動」「下へ移動」「グループを削除」。
- ドラッグ: グループの見出し・worktree グループの先頭・子・通常の行のどれを掴んでも、動くのは項目（子を掴めばその worktree グループ）。落とせるのは同じ入れ物の項目の間だけ。それ以外の上では落とせない印を出し、離しても何も送らず、知らせを出す。
- キーボード: `move_workspace_previous`／`next` は今いる workspace の項目に `item.move_by`。端では動かない。
  - **navigate の選択を「行」に広げる**（今は workspace の行だけ。`Sidebar.vue:475`、端末版 `TuiApp.ts:1309-1321`）。グループの見出しの行も上下で選べるようにする（畳んだグループ・空のグループにも届く）。
  - `navigate_open_menu`（既定 `space`）は、見出しを選んでいればグループのメニュー（「名前の変更」「上へ移動」「下へ移動」「グループを削除」）を開く。
  - 新しい navigate のキー `navigate_toggle_collapse`（既定 `z`。既存の 7 つ〔`packages/client-core/src/keys/navigateKeys.ts:28-71`〕・予約済みの chord〔`:99-`〕と重ならないことを実装で確かめ、重なれば別のキーにして `decisions.md` に残す）: 選んでいる行がグループの見出しならグループを、worktree グループの先頭ならその worktree グループを、畳む・広げる。子の行なら親の worktree グループを畳む。
  - 「上へ移動」「下へ移動」の後も、動かした見出しに選択が付いたまま。
- 折りたたみ: グループはサーバ（`group.toggle_collapsed`）、worktree グループは共有の設定 `collapsedAutoGroups`（今のまま）。端末版に、worktree グループの先頭の行の `▸/▾` のクリックを足す（キーは上の `navigate_toggle_collapse` で、ブラウザ版と同じ）。

### 古いサーバ・古い画面

- **新しい画面 × 古いサーバ**（`layout` が無い。別のマシンの古い `soda serve`・古いサーバにつないだ端末版を含む。`serverVersion` ではなく、スナップショットに `layout` があるかで分ける）:
  - 描画は `layoutFromLegacy`（上の決まり。同じリポジトリの workspace が別々の `groupId` を持っていても、本体の所属で 1 つの項目に描く）。
  - 並べ替えは今までの `workspace.move`／`move_to` を送る（`item.*` は無い）。グループそのものの「上へ／下へ移動」は出さない。
  - グループへの出し入れは、項目の workspace **全部**に `group.add_member`／`remove_member` を順に送る（古いサーバは 1 件ずつしか動かさない。`SessionModel.ts:427-442`）。
  - 「新しいグループを作る…」は今の 2 段（`group.create` の後に `add_member`。`ActionDispatcher.ts:548-`）を残す。古いサーバは `group.create` の `workspaceId` を黙って落とすため。
- **古い画面 × 新しいサーバ**: `groupId`（実効）と平らな順で今までどおり描く（worktree はグループの中に平らに並ぶ。空のグループは末尾）。古い要求は次のとおり読み替える。
  - `group.add_member`／`remove_member`: 項目丸ごと。
  - `workspace.move`: その workspace の項目の `item.move_by`。
  - `workspace.move_to`: (a) ID の集まりが、同じ入れ物の中の 1 つ以上の項目のちょうど全部で、落とし先が同じ入れ物の項目の先頭の workspace（または null）→ その項目を動かす。(b) ID の集まりが、グループ G の実効のメンバーのちょうど全部で、落とし先が G の外の一番上の項目の先頭（グループの先頭メンバーならそのグループ）→ `g:G` を動かす（古い画面のグループ全体のドラッグ。`Sidebar.vue:117-133, :327-369`）。(c) それ以外（一部だけ・外と中をまたぐ）→ 何も変えない。
  - 知らないイベント（`sidebar.layout_changed`）を古い画面が無視することを、実装で確かめる（**未確認**）。

## ドメイン固有の考慮

- AGENTS.md の条項: E2E を書く → `e2e-observe-browser`（合否はブラウザの DOM・フレームで見る）。不具合の回帰テスト → `regression-negative-control`。
- herdr との一致: worktree グループの判定・並び（本体が先頭）・一括クローズは herdr 準拠のまま。利用者が作るグループは独自の拡張（`docs/herdr-parity.md` H37b に書く）。
- `repoKey` は絶対パス。保存のキーにするので、同じリポジトリが別のパスで見える環境（symlink）では別の項目になる。今の worktree グループの判定と同じ値を使うので、束ねと所属は食い違わない。

## エラー処理 / 異常系

- 実在しない `groupId`／`workspaceId` を指す要求: 今までどおり `not_found`。
- 受け付けない移動（入れ物が違う等）: `{moved: false}`（エラーにしない）。古い `move_to` は何も配らない。
- 保存が壊れている・参照が食い違う: `repairLayout` で直して起動する（捨てた参照はログに出す）。
- 判定の確認が失敗し続ける workspace: 直前の判定（無ければ `w:<id>`）のまま。仮の状態の確定は、その workspace を判定前のまま含めて、最初の 1 周の後に行う（上の「移行」。`decisions.md` D2）。
- 古い版へ戻す: `layout`・`repoGroups`・`repoKey` は読むときに落ち、次の保存で消える。`groupId` は実効の値が残るので、古い版でも近い見え方になる。

## 受け入れ基準との対応

- AC1: 入力は workspace の `git.repoKey`（サーバの直前の判定）とレイアウト。`sidebarTree` が同じ `repoKey` の workspace を 1 つの項目にし、2 つ以上なら worktree グループ（本体が先頭）にする。1 つに減ると同じ項目のまま通常の行になる。
- AC2: メニュー・ドラッグ・キーボードは `ItemTarget`（workspace を指すと項目）で送る。サーバは項目単位でだけ動かす。子だけを動かす入口は無い。
- AC3: 所属は `repoGroups[repoKey]`。本体を入れても項目はリポジトリのまま。
- AC4: レイアウトの `groups[g]` に `r:`・`w:` が入り、`g:` は入れない（サーバが弾く）。字下げは木の深さ。
- AC5: `item.move`／`item.move_by`。グループは `layout.top` に自分の位置を持つ。端では `moved: false`。入れ物が違えば `moved: false` で、画面は落とせない印と知らせ。
- AC6: グループの折りたたみ（サーバ）と worktree グループの折りたたみ（共有の設定）を別々に持つ。`visibleWorkspaceIdsInOrder` が、畳んだ入れ物の中の今いる workspace だけを残す。
- AC7: `closeWorkspace` が `repoMembers` を使う（所属を見ない）。`ConfirmDialog` の件数も同じ関数。
- AC8: 「判定が付く」の決まり（`r:R` があれば加わる）。入力は `GitInfoPoller` の結果。
- AC9: 取れない結果では `git` もレイアウトも書き換えない。保存した `repoKey`・`layout` で起動直後を並べる。管理外の確定は終了コードが 0 でないときだけ。
- AC10: `repoGroups` は項目が空になっても残り、保存する。グループの削除で行き先がそのグループの行を消し、中身を元の位置へ出す。
- AC11: 「判定が変わる」「管理外と確定」「判定が付く（`repoGroups` を先に見る。引き継ぎは届く順に依らない）」の決まり。
- AC12: 行に種類の印と読み上げ用の文言。文言を「グループ」「worktree グループ」に直す。
- AC13: `layout` の無い保存 → 仮の状態（`layoutFromLegacy` で導く・`layout` を書かない）→ 最初の 1 周の後か最初の操作で 1 回確定。確定の前に止めても、次の起動で同じ結果になる。入力は保存データと判定。
- AC14: 古い要求の読み替え（`group.add_member`・`remove_member`・`workspace.move`・`move_to` の (a)(b)(c)）。保存は optional の項目だけ。
- AC15: 端末版も `sidebarTree`・同じメニューの項目・同じ RPC。レイアウトの変化は `sidebar.layout_changed` で両方に届く。
- AC16: 端末版の `autoGroup` の当たり判定を作り、折りたたみのキーを足す。ドラッグを項目単位（`item.move`）にする。
- AC17: `topUnitOf` と、サーバが `client-core` の `repoMembers`・`itemRefOf` を使うこと。同じ入力で同じ結果になるテスト（配信の途中の状態〔レイアウトに無い workspace・実在しない参照・判定とレイアウトの食い違い〕を含む）。
- AC18: 新しい E2E の spec と、文書 5 点。
- AC-I1: 折りたたみの印はボタン（クリック・`Enter`／`Space`）。グループの見出しは行のクリックでも切り替え、worktree グループの先頭の行のクリックは workspace へ移る（今のまま）。
- AC-I2: ドラッグは離した時点で `item.move`、`Esc`・行の外で取り消し。落とせない場所は印と知らせ。「グループへ追加…」「別のグループへ移す…」は選ぶと確定、`Esc` で取り消し。
- AC-I3: navigate の選択を行に広げ（見出しを選べる）、`navigate_open_menu` で workspace の行・見出しのメニュー（作る・入れる・外す・移す・グループの上へ／下へ）、`navigate_toggle_collapse` でグループと worktree グループの折りたたみ、`move_workspace_previous`／`next` で項目の並べ替え。ブラウザ版・端末版とも同じ。
- AC-I4: メニュー・ダイアログは今の仕組み（開く前の場所へ戻る）。並べ替えの後も今いる workspace は変わらず、動かした見出しに navigate の選択が残る。折りたたみの印はフォーカスが残る（端末版は選択が残る）。
- AC-I5: サイドバーの入力の扱いは変えない。pane のドロップ先（workspace の行）・workspace の切り替え・番号での切り替えは `visibleWorkspaceIdsInOrder` の新しい順を使う。

## 追補（`amendment-01.md`）

利用者の追加の決定で、(A) worktree グループに入るのは worktree ごとに 1 つの代表だけ、(B) 一番上の並びはまとまり（グループと「グループなし」）だけ、(C) 見た目は B3・T4 と状態のまとめ、に変わった。決まりの本文は `amendment-01.md`。上の節のうち、`itemRefOf`・`repoMembers`・`SidebarLayout` の形・「レイアウトが変わる場面」の表（グループの作成・削除・外す・新しい workspace の置き場）・「画面」の見た目は、追補で読み替える。

- AC19: `GitInfo.worktreeKey`（`--git-dir` の絶対パス）と、代表の決まり（同じ `worktreeKey` の最初の workspace）。入力は `GitInfoPoller` の判定と平らな順。
- AC20: `SidebarLayout` の `top`（まとまりの順。`"u"` がグループなし）・`ungrouped`。見出しを出すかは、本物のグループの有無で画面が決める。
- AC21: 状態のまとめは、画面が既存の `aggregate`・`displayStateFor` で、まとまり・畳んだ worktree グループの中の全 workspace について計算する。入力は各 pane のエージェントの状態。
