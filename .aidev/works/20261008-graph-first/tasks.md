# タスク: グラフを主体にしたワークフロー

`design.md`（追補 01 が優先）の PR の分け方に従う。この文書は、**PR1a（データとサーバ）**のタスクを書く。PR1b 以降は、PR1a の着地の後に足す。

- ★ = タスクごとの独立点検（`aidev taskcheck`）を掛ける。PR1a は、保存・移行・位置の計算・サーバの状態なので、ほとんどに掛ける。
- PR1a では、ブラウザの見た目を作り替えない（今のグラフの画面のまま）。

## PR1a: データとサーバ

- [x] T1: 上限と定数（**独立点検あり**）
      - `packages/protocol/src/graph.ts`: 手元のノード 512・別のマシンのノード 64（別枠で数える）・線 512・1 回の更新 1024。`graph.history` の 1 回の応答の上限は、今の値（6,400）を定数として切り離す。
      - `validateGraph`・`GraphSchema`・`applyGraphOps` の上限の検査を、手元・別のマシンの別枠に合わせる。上限のエラーの文言。
      依存: なし
      AC: AC-V8, AC-V9

- [x] T2: 置き場所の計算（`graphLayout.ts`）（**独立点検あり**）
      - 純粋な関数。置き場所は、サーバとブラウザの両方から使える所（`client-core/src/graph/`。`geometry.ts` の定数から導く。D14）。
      - 入力の型: 空間の構成（最上位の囲い → workspace → ノードの鍵。別のマシンの囲いを含む）と、ノードの位置。
      - `frames`・`placeNode`・`placeFrame`・`resolveDrop`・`overlaps`（重なりの量。D10 の「増やすか」の判定に使う）。囲いの定義は、design 追補 01「囲いの定義」の 6 点。
      - 性質のテスト（乱数の構成を 200 通り）: `placeNode`・`placeFrame` の結果は重ならない・既存のノードを動かさない（詰むときの例外を除く）・20 の倍数・座標の上限の中。
      依存: T1
      AC: AC-V2, AC-V5

- [x] T3: 空間の構成を、セッションから導く（**独立点検あり**）
      - サーバの関数 `graphStructure(session)`: 手元の、一時的でない pane（独自コマンドの pane・スクロールバックのエディタを除く。D16）を、workspace → サイドバーの項目（`r:`・`w:`）→ グループ（`Workspace.groupId` の実効値）にまとめる。代表でない workspace は、単独の項目。
      - 別のマシンのノードは、グラフのノードの鍵から、マシンごとの囲いにまとめる。
      依存: なし
      AC: AC-V1, AC-V2, AC-V3, AC-V9

- [x] T4: `reconcileGraph`（不変条件の検査と修復）（**独立点検あり**）
      - 純粋な関数。入力は `graphStructure` の結果と、いまの `Graph`。出力は、直すための `GraphOp` の列（破れていなければ、空）。不変条件 I1〜I3（design 追補 01「維持」）。workspace ごとに少なくとも 1 つのノード（囲いの定義 3）。
      - テスト: 何度呼んでも同じ（2 回目は空）・線を変えない・既存のノードの位置を、要る場合のほかは動かさない。
      依存: T2, T3
      AC: AC-V3, AC-V5, AC-V6

- [x] T5: 維持をサーバにつなぐ（**独立点検あり**）
      - 起動: 復元と `pruneMissing` の後・`graphEngine.start()` の前に、毎回呼ぶ（`composeServer.ts`）。
      - 構造のできごとの後に、50ms まとめて 1 回。できごとの一覧は design のとおり。`pane.move_to_tab` で、ここに届くできごとが出ることを、最初に確かめる（点検で未確認だった点）。出ないなら、足りるできごとを出す所を決めて、`decisions.md` に書く。
      - `AgentLineage` の「ノードを足す」を外し、線だけを足す形にする（ノードは、`reconcileGraph` が先に足している前提。順が逆になる場合に、線が落ちないこと）。
      - `soda handoff`: 引き継ぎの停止の間は呼ばない。新しい版の起動で呼ぶ。`handoffSmoke` が通ること。
      依存: T4
      AC: AC-V5, AC-V6

- [x] T6: 移行（`schema` 1 → 2）（**独立点検あり**）
      - 読み込み: `schema: 1` のファイルを読めたら、控えを `graph-backups/` に書き（既存の仕組み）、T5 の起動の `reconcileGraph` と、外接が大きすぎる workspace の詰め直しを行い、`schema: 2` で 1 回保存する。
      - `schema: 2` のファイルを、古い版が読んだときの動き（退避して空で起動）は、今の作りのまま。それをテストで固定する。
      - テスト: 移行の前後で、線の数と中身が同じ・移行の前からあったノードが、同じ workspace の中で相対の位置を保つ（詰め直しの対象を除く）・2 回目の起動で何も変わらない・途中で落ちても、元のファイルが残る。
      依存: T5
      AC: AC-V6

- [x] T7: `graph.update` の検査（**独立点検あり**）
      - 方式の層（`surface/methods/graph.ts`）に、`node_required`（手元の、開いている pane のノードを外す・手元のノードへの `rekey_node`）と、`frame_overlap`（その更新が、重なりを新しく作る・広げるときだけ）。エラーの型と、`clientErrorMessage` の文言。
      - サーバの内部の更新（`GraphPaneCleanup`・`reconcileGraph`・`AgentLineage`・`GraphEngine`）は、検査を通さない。
      依存: T2, T3
      AC: AC-V5, AC-V7

- [x] T8: 今の画面と `sodactl` の追従
      - ブラウザ: 「pane を載せる」の一覧から、手元の pane を外す（別のマシンの pane だけ）。「グラフから外す」を、手元のノードでは出さない。ノードのドラッグは、離す前に `resolveDrop` で寄せる（断られないように）。上限のため出ていない pane の数の表示。
      - `sodactl graph show --json` に、`spaces` と、ノードごとの `workspaceId`・`tabId`（CLI が、スナップショットと突き合わせて作る）。表の出力にも、空間の列。`sodactl graph node add`（手元: すでにある、で成功）・`rm`・`rekey`（手元: 断る）の動きと文言。`addMissingNodeOps` の置き場所を、`placeNode` に寄せる。
      依存: T5, T7
      AC: AC-X1, AC-V9

- [x] T9: 文書とテスト
      - `docs/agent-graph.md`（すべての pane が載る・載せる操作は別のマシンだけ・上限・古い版へ戻す手順）・`docs/sodactl.md`・`docs/tui-parity.md`。
      - 統合テスト（サーバを立てて）: pane を作る → ノードが増える・pane を別の workspace へ移す → 囲いが重ならない・workspace を別のグループへ移す → ノードの座標が変わらない・一時的な pane ではノードが増えず `rev` が進まない・上限。
      - `pnpm build`・`pnpm typecheck`・`pnpm test`。
      依存: T1, T2, T3, T4, T5, T6, T7, T8
      AC: AC-X3

## PR1b 以降（骨子。詳しいタスクは、前の PR の着地の後に、ここへ足す）

- [ ] T10: PR1b 画面の並び（下の T10a〜T10g に分ける。この行は、まとめ）
      依存: なし
      AC: AC-S1, AC-S3, AC-S6, AC-S7

### PR1b: 画面の並び（詳しいタスク）

設計は `design.md` 追補 01（D11〜D13・「`modalOpen` の仕分け」）。**PR1b では、空間・囲い・tab のタグ・地図は作らない**（PR1c・1d）。グラフが、重ねるダイアログから、主な領域の画面になり、サイドバーが残る、まで。

- [x] T10a: いまの動きを固定する E2E を、先に書く（`packages/e2e/src/specs/graph-screen.spec.ts`。**変更の前の main で通ること**を確かめてから、次へ進む）。開く（`prefix+a`・メニュー）・ノードの選択・ノードのドラッグで位置が変わり保存される・線を結ぶ・閉じる（`Esc`・×・`prefix+a`）・閉じた後に開く前の pane へフォーカスが戻る・開いている間のキーが端末へ届かない・`sodactl ask` のダイアログが上に出て、閉じるとグラフへ戻る・スクリプトの面（`script-html`）を載せた pane がある状態で開閉を 10 回くり返しても、フォーカスの脱落が数えられない。
      依存: なし
      AC: AC-S3
- [x] T10b: `view.screen` と画面の一覧（**独立点検あり**）。`view.graphOpen`（真偽）を、`view.screen`（`"base" | "graph"`）に置き換える。画面の定義は 1 か所の一覧（`screens.ts`: id・名前・部品）。`view.openGraph()`・`closeGraph()` は残し、デスクトップでは `screen` を書く薄い別名、モバイルでは今の動き（D13）。窓を狭めてモバイルの画面に切り替わったら、`screen` を `base` に戻す。`graphOpen` を見ている 8 ファイル・19 か所（点検の一覧）を、1 つずつ置き換える。
      依存: T10a
      AC: AC-S3, AC-S6
- [x] T10c: `modalOpen` の仕分け（**独立点検あり**）。`view.keysCaptured` と `view.modalOpen` に割り、design 追補 01 の表のとおりに、9 か所を仕分ける。デスクトップのグラフの画面は、どちらにも入れない。ドラッグの取り消しは、`modalOpen` に加えて、`view.screen` が変わったときにも。「グラフを開く前の pane」の持ち方（`StoreAdapter`・`NotificationController`・`AskDialog`）。
      依存: T10b
      AC: AC-S3
- [x] T10d: 基本画面の隠し方（**独立点検あり**）。グラフの画面の間、基本画面（tab バーと pane）は、大きさを保ったまま見えなくする（`visibility: hidden` と `inert`。`display: none`・`v-show`・`v-if` は使わない。D11）。**画面を切り替えても、`client.view` が送られない・PTY の大きさが変わらない**ことを、E2E で確かめる（サーバが受けた `client.view` の回数と、pane の桁・行）。表示の面のフォーカスの見回り（`focusDrop.ts`。変えられない）が、基本画面が `inert` の間に、戻し先の端末へ戻そうとして数え続けないか——**最初に、いまの外側の口（`withDisplayChange` と同じ入口）で見回りを止められるかを確かめる。止められない場合は、実装を止めて報告する**（守りのファイルの変更は、利用者の判断）。
      依存: T10b
      AC: AC-S7
- [x] T10e: `GraphView` を、中身と 2 つの入れ物に分ける（**独立点検あり**）。中身 `GraphCanvas`（面・ノード・線・ツールバー・横のパネル）、入れ物 `GraphDialog`（モバイル。今の `<dialog>` と `showModal()`）と `GraphScreen`（デスクトップ。主な領域の部品。`<dialog>` を使わない）。`Esc` の「1 段ずつ戻る」の最後は、デスクトップでは基本画面へ切り替える。`Toast`・`ReconnectOverlay` の Teleport は、モバイルのグラフと `ask` のときだけ。グラフの面にフォーカスがある間だけ、グラフのキーが働く（面は `tabindex` を持ち、画面を切り替えたときにフォーカスを受ける）。
      依存: T10c, T10d
      AC: AC-S1, AC-S3
- [x] T10f: サイドバーの共有と、切り替えの部品。`App.vue` の主な領域を、`view.screen` で出し分ける。サイドバーの上に、画面の一覧から作る切り替えの部品（「基本画面」「グラフ」）。サイドバーの行を押したときの動きは、PR1b では、**グラフの画面でも今の動き**（その workspace・pane を選ぶ。グラフの面の位置は動かさない——動かすのは PR1c）。ただし、pane を選んでも、基本画面へは切り替えない。`open_graph`（`prefix+a`）は、2 つの画面の入れ替え。右クリックのメニューの「連携（グラフ）」。
      依存: T10e
      AC: AC-S1, AC-S3, AC-S6
- [x] T10g: E2E と文書。T10a の spec を、新しい動き（主な領域・サイドバーが見える・切り替えの部品）に合わせて直す（**期待を緩めない**。変えた行を、結果に一覧で書く）。足す: サイドバーがグラフの画面で操作できる・切り替えても PTY の大きさが変わらない（T10d）・モバイルは今のまま・窓を狭めると基本画面へ戻る・スクリプトの面を載せた状態での切り替え。PR3 のフォーカスの E2E 3 本を、単独で流す。`docs/agent-graph.md`「開く・閉じる」・`docs/tui-parity.md`。`pnpm build`・`typecheck`・`pnpm test`。
      依存: T10f
      AC: AC-S1, AC-S3, AC-S6, AC-S7
- [ ] T11: PR1c 空間と囲い（空間の見出し・囲いの描画・tab のタグ・サイドバーの行からの移動・囲いのドラッグ・別の空間との線の印・性能の測定）
      依存: T9, T10
      AC: AC-V1, AC-V2, AC-V4, AC-V7, AC-V8, AC-S2, AC-M4
- [ ] T12: PR1d 地図と探す（小さな地図・探す・キー・文書）
      依存: T11
      AC: AC-S4, AC-S5, AC-X2, AC-X3
- [ ] T13: PR2 端末の窓
      依存: T11
      AC: AC-T1, AC-T2, AC-T3, AC-T4, AC-T5, AC-T6
- [ ] T14: PR3 足す
      依存: T13
      AC: AC-A1, AC-A2, AC-A3, AC-A4, AC-A5
- [ ] T15: PR4 移す
      依存: T11
      AC: AC-M1, AC-M2, AC-M3
- [ ] T16: PR5 処理のノード
      依存: T11
      AC: AC-P1, AC-P2, AC-P3, AC-P4, AC-P5

## AC の対応（PR1a）

| AC | タスク |
| :- | :- |
| AC-V1 | T3（空間の構成。見出しの並びの画面は PR1c） |
| AC-V2 | T2, T3（囲いの描画は PR1c） |
| AC-V3 | T3, T4 |
| AC-V5 | T2, T4, T5, T7 |
| AC-V6 | T4, T5, T6 |
| AC-V7 | T7（印の画面は PR1c） |
| AC-V8 | T1（性能の測定は PR1c） |
| AC-V9 | T1, T3, T8 |
| AC-X1 | T8 |
| AC-X3 | T9 |

AC-V4・AC-S・AC-T・AC-A・AC-M・AC-P・AC-X2 は、PR1b 以降。
