# 判断の記録

## D1: light のまま進める（触るファイルは 3 を超える）

依頼が `--light` の指定。製品コードは 2 ファイル（`TabBar.vue` と、新しい純関数のファイル）で、共有モジュール・protocol・サーバ・外部依存には触らない。単体テスト 2・E2E 1・docs 3 を足すと、触るファイルは 8 前後になり、`lightMaxFiles`（既定 3）を超える（deliver の `aidev verify` が WARN を出す。終了コードは変わらない）。research は任意工程として起こさず、確かめたことは design「依拠する既存の事実」に書いた。実装で想定外のファイル（サーバ・protocol・`view.ts`・`PaneFrame.vue` など）に触ることになったら、`aidev escalate` で full に上げる。

## D2: 既存の `tab.move` を、動かす数だけ送る（`tab.move_to` は足さない）【利用者に確認】

- 端末版が同じ方式（`packages/tui/src/input/mouse.ts` の `dropTab`）で、すでに使われている。サーバ・protocol を変えずに済み、古いサーバとの組み合わせを考えなくてよい。
- 弱点 1（途中の状態が見える）: 動かす数だけ `workspace.updated` が配られ、ほかの画面では tab が 1 つずつ動いて見えることがある（tab の数だけなので、数回・数ミリ秒）。
- 弱点 2（競合）: 送っている最中に、ほかの画面が同じ workspace の tab を閉じる・動かすと、狙いと違う位置に止まる。`tab.move` は端で反対の端へ回るので、最悪は反対の端に行く。壊れはしない（順が違うだけで、もう一度ドラッグすれば直る）。
- 1 回で目的の位置へ動かす RPC（`tab.move_to {tabId, beforeTabId}`）を足せば両方が消えるが、protocol・サーバ・古いサーバへの落とし方・両方の画面の直しが要る。古いサーバのための落とし先は結局この繰り返しなので、後から足しても、この作業のコードは無駄にならない。**後の作業の候補**にする。

## D3: 落とし先は「入る位置の線」で見せる【利用者に確認】

サイドバーの workspace の並べ替えは、落とした行の枠を強調する（行の上に落とすと、その行の位置に入る）。tab は、`split-dnd.md` の F9・AC8（利用者の指摘を受けた要件）に合わせて、tab と tab の間の線にする。ポインタが tab の左半分にあればその前、右半分にあればその後ろ。サイドバーを線に変えるのは、D&D の表現の作業の範囲。

## D4: 確定すると、つかんだ tab を選ぶ【利用者に確認】

サイドバーの workspace のドラッグ（落とした後、つかんだ workspace を選ぶ）・端末版（押した時点でその tab へ切り替わる）・一般のブラウザの tab と同じ。取り消しでは選ばない。選ばれていない tab を、表示を変えずに並べ替えたい、という使い方はできない（キーの `move_tab_*` も、選ばれている tab しか動かせない）。

## D5: タッチではドラッグを始めない。モバイルは対象外【利用者に確認】

モバイルの 1 列の画面（`MobileShell.vue`）は tab バーを持たず、workspace と tab はピッカーで選ぶので、並べ替える場所が無い。幅の広いタッチ端末（タブレット）ではデスクトップの画面が出るが、tab の列は横スクロール（`overflow-x: auto`）で、指のドラッグはスクロールに使われる。そこへ並べ替えを重ねると、スクロールと取り合いになる（長押しで始める、などの別の決まりが要る）。`pointerType === "touch"` では始めない。マウスとペンは対象。

## D6: ポインタに付いて動く像・掴める形のカーソルは入れない

`split-dnd.md` の F7・F8 の像は、workspace・pane・tab に共通の表現として作るもの。tab だけ先に入れると、ほかと見た目がずれる。この作業は、つかんだ tab を薄くする（0.4）・入る位置の線・ドラッグ中のカーソル（grabbing）まで。乗せたときのカーソルは今の pointer のまま。

## D7: ドラッグ中のキーは全部止める

`useResizeDrag.ts`（`20261004-ui-interaction-polish` の D2 で実測）と同じく、window の keydown を capture で受け、`preventDefault` と `stopPropagation` の両方で止める。pane の名前・workspace の行のドラッグは `Esc` を見るだけで止めていない（そちらは直さない）。

## D8: ドラッグ中のホイールは今のまま

tab バー上のホイールは tab を切り替える（`TabBar.vue` の `onWheel`）。ドラッグ中も同じに働く（選ばれている tab が変わるだけで、ドラッグは続く）。止める理由が無いので、分岐を足さない。

## D9: 範囲の追加で full に上げた（2026-10-08）

利用者から「pane を別の workspace へ移すのを制限する」が足された。protocol・client-core・サーバに触るので light の条件を外れ、`aidev escalate` で full に上げた（D1 は tab の D&D だけだった時点の判断）。省いていた節（ユーザーストーリー・非機能要件・未確定事項）を足した。research は工程としては起こさず、確かめたことを design の頭に書いた。PR は「tab の D&D」と「pane の移動の制限」の 2 つに分ける。

制限の単位は、はじめ「同じリポジトリ（`repoKey`）」で書き、同じ日の利用者の決定で「同じ worktree（`worktreeKey`）」に書き直した。理由（利用者の決定）: workspace がどの worktree として一覧に出るかは、最初の tab の先頭の pane のフォルダだけで決まる。同じリポジトリでも別の worktree の workspace へ pane を移すと、一覧の行（ブランチ名など）と中身がずれる。「1 つの worktree を 1 つのまとまりとして扱う」ために、混ざる移動そのものを断る。

## D10: 「同じ worktree」は `Workspace.git.worktreeKey` が同じこと。workspace で判定する（利用者の決定）

- 鍵は、worktree グループの代表を決めるのと同じ `worktreeKey`（`packages/protocol/src/model.ts` `GitInfo`。`git rev-parse --git-dir` の絶対パス）。代表かどうか（`Workspace.representative`）・`repoKey`・利用者が作るグループ（`groupId`）は見ない。
- 判定は移動元と移動先の workspace で行う。pane 自身のフォルダは見ない。pane の中の `cd` は制限しない（docs に 1 行）。
- 同じ workspace の中の移動は、判定を通さない（今までどおり）。

## D11: git の判定が無い workspace どうしは、開いた場所（`Workspace.cwd`）が同じときだけ移せる【利用者に確認】

- 管理外のフォルダには worktree が無いので、「同じフォルダを開いた workspace どうし」を同じまとまりとして扱う。比べるのは、配られている `Workspace.cwd`（開いた場所。文字列の一致）。サーバだけが知る「いまの場所」（先頭の pane のフォルダ。`SessionService.identityCwdOf`）は使わない——画面が同じ判定をできなくなるため。
- 片方だけ判定がある（`worktreeKey` あり と `git: null`）ときは断る。
- 退けた案: 管理外どうしは全部通す（まとまりの外どうし、という見方）。「同じ worktree と確かめられるときだけ移せる」に合わない。管理外は全部断る、も考えたが、同じフォルダを 2 つ開いて pane を寄せ直す使い方まで塞ぐ理由が無い。

## D12: 判定がまだ入っていない workspace は、D11 と同じ扱い（「判定済み」の印は持たない）【利用者に確認】

- `Workspace.git` の `null` は「管理外」と「まだ判定していない」の両方を表す（`SessionModel` は `git: null` で作る）。どちらも「同じ worktree と確かめられない」ので、同じ決まり（開いた場所が同じなら移せる・違えば断る）にする。開いた場所が同じなら、判定が入っても同じ worktree になるはずなので、通して困らない。
- これで、サーバに「判定済み」の集合を持つ必要が無くなり、**サーバと画面が同じ情報（`git.worktreeKey` と `cwd`）で同じ結果を出す**。理由の種類も 1 つ（`different_worktree`）で済む。
- 作った直後（判定が入る前）に、場所の違う同じ worktree の workspace（サブフォルダで開いた等）へ移そうとすると、判定が入るまで断られる。判定は workspace ができるとすぐ走る（`GitInfoPoller`）ので、短い間だけ。
- 例外（食い違い）: 先頭の pane が `cd` で別の場所へ行った workspace は、`cwd`（開いた場所）と判定（いまの場所）がずれる。判定がある間は `worktreeKey` だけで決めるので、ずれは結果に出ない。判定が無い（管理外へ `cd` した）ときは開いた場所で比べる。

## D13: 断るときは、今ある `ok: false` に `reason` を足す（RPC のエラーにしない）【利用者に確認】

`pane.move_to_tab`・`pane.move_to_new_tab` は、何も起きなかったときに `{ok: false}` を返す作りで、ブラウザ版・端末版は `ok` が false なら何もしない（`ActionDispatcher.movePaneToTab`・`TuiDispatcher.movePaneToTab`）。ここに `reason?: "different_worktree"` を足すだけにすると、古い画面は今までどおり黙って何もしない。RPC のエラー（新しい code）にすると、古い読み手の扱いを 1 つずつ確かめる必要がある。`sodactl` には pane を移すコマンドが無い（`packages/cli/src/commands/pane.ts`）ので、CLI の文言・終了コードは足さない。文言は、画面が `reason` から出す。

## D14: 落とせない先の見せ方（落とせる相手が少ない前提で）【利用者に確認】

- この制限で、サイドバーの workspace の行は、ほとんどが落とせない相手になる（落とせるのは、同じフォルダを開いた別の workspace と、自分の workspace〔新しい tab へ切り出す〕だけ）。行の上に来てから落とせないと分かるのでは遅いので、**ドラッグが始まった時点で、落とせない行を全部薄くする**（ブラウザ版。新しいクラス `sidebar-row-pane-drop-disabled`＝不透明度を下げる）。落とせる行が 1 つも無ければ、自分の行だけが残って見える。
- 落とせない行の上では、既存の「落とせない行」の見た目（`sidebar-row-drop-invalid`＝点線と `not-allowed`）。落とせる先の破線は出さない。離すと、送らずにトースト「別の worktree の workspace へは移せません（同じフォルダを開いた workspace へだけ移せます）」。理由と、どこへなら移せるかを 1 文で伝える。
- 端末版: 落とせない行には強調を出さず、離すとトースト（同じ文言）。行を薄くするのは入れない（端末版の並べ替えも、落とせない所は何も出さない）。
- tab バーの tab は、表示中の workspace の tab しか並ばない（ブラウザ版。端末版は T10 で確かめる）。pane を tab へ落とす操作は必ず同じ workspace の中で、断られない。tab バーには手を入れない。
- 退けた案: 落とせない行を、ドラッグ中は落とし先の判定から外す（上に来ても何も出さない）。なぜ落とせないのかが伝わらない。サイドバーへの落とし込みそのものをやめる（自分の workspace の新しい tab へ切り出す入口が無くなる）。
- 画面は、`worktreeKey` を配らない古いサーバの workspace（`git` はあるが `worktreeKey` が無い）を、自分では断らない（薄くもしない）。古いサーバは断らないので、今までどおり通る。
