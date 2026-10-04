# 独立レビューの指摘と、main の取り込み（依頼元から。must 1・should 5・nit 5）

## 先にやること: main を取り込む

`origin/main` に PR #79（設定画面のサイドメニュー）と PR #80（サブエージェントの件数と一覧。`Sidebar.vue` のエージェントの行・tui の `sidebar.ts`・キーの表のテスト〔操作 59 個・prefix の後のキー 46 個になる見込み〕・golden を変えている）が入った。`git fetch origin && git merge origin/main` で取り込み、衝突を解決する（PR #78 までは依頼元が取り込み済み: 65583d9）。両方の変更を残すこと（エージェントの行の件数のボタン・`⤷n` を消さない）。取り込みのコミットは 1 つにして、ビルド・型検査・単体テストが通ってから次へ。

## 直すもの

1. **[must] 代表の決め方**（AC19・追補 A 違反）。「グループなし」をグループより上に並べ替えた状態（`top = ["u","g:G"]`、G の中に `r:K`〔本体 M＋worktree W1〕）で、W1 を選んで＋新規（W2）を押すと、判定前の W2 が平らな順で W1 より前に置かれ、判定が届くと `representativeIds` が Map の順で W2 を代表にして、W1 を通常の行へ降格する。利用者が挙げた不具合（＋新規が worktree グループに入る）が、この経路で残っている。
   - **決め方を変える（依頼元の決定）**: 代表は「その `worktreeKey` を、最初に持った workspace」。**既に代表が居る `worktreeKey` では、代表を奪わない**（代表が閉じる・別のフォルダへ移るまで交代しない）。平らな順（Map の順）や並べ替えは、代表の決定に影響しない。代表が居なくなったときの次の代表は、残りのうち最初にその `worktreeKey` を持ったもの（順を持てないなら、workspace を作った順）。サーバの再起動をまたいでも同じ代表になるように、必要なら代表を保存する（`repoGroups` の隣など。古い保存には無いので、無ければ作った順で決める）。
   - 画面（client-core の純関数）とサーバが同じ代表を出すこと。画面が Map の順から代表を導いているなら、サーバが決めた代表を snapshot・イベントで配る形にする（古いサーバでは今の導き方に落ちる）。
   - 「平らな順で前に居る workspace が後から同じフォルダと判定されると代表を奪う」を正としているテスト（`SessionModel.test.ts:1684-1693`）は、新しい決まりに直す。
   - 回帰テスト: 上の経路（モデル・E2E。E2E は「グループなし」を上に並べ替えてから＋新規）と、並べ替えた後に別の workspace が cd で同じフォルダへ来た場合。壊して落ちる確認。
   - 根拠: `SessionModel.ts:320-323, :1204-1216, :1250-1254, :1282-1285`、`workspaceGrouping.ts:60-72`、`sidebarLayout.ts:201-223`
2. **[should] ブラウザ版のドラッグの落とす位置を端末版と揃える**: 端末版は「上へなら落とした項目の前、下へなら次の項目の前（末尾は null）」。ブラウザ版は常に「落とした項目の前」なので、すぐ下の項目へ落とすと印が出るのに並びが変わらず、末尾へ動かせない。ブラウザ版を端末版の決まりにする（計算は共有の純関数に）。E2E に、下へ・末尾へのドラッグを足す — `Sidebar.vue:532`、`ActionDispatcher.ts`（moveItemByDrag）、`tui/src/input/sidebarDrag.ts:5, :52-53`、`workspace-groups.spec.ts:957-1147`
3. **[should] 古い git の扱い**: `git rev-parse` は知らないオプションをそのまま出力して終了コード 0 を返す（2.43.0 で `--bogus-option --git-common-dir` が `--bogus-option\n.git`・0）。git 2.31 未満で `--path-format=absolute` が同じ動きをすると、壊れた値が `repoKey`・`worktreeKey` になる。出力を検査する: 行数が期待どおりで、各行が絶対パスであること（`--` で始まる行・相対パスがあれば `unknown` 扱い）。単体テスト（偽の出力）と壊して落ちる確認。コメントと `docs/verification.md:1278, :1472` の「失敗して取れないになる」を事実に合わせる — `GitInfoPoller.ts:149-158`、`git/worktree.ts:80-82`
4. [nit] `layoutConfirmWiring.test.ts:19-20` の固定 20ms の待ちに、陽性の対照（同じ待ちで「起きること」は観測できる）を足すか、偽のタイマーにする。
5. [nit] `SessionFile.ts:158-159`: `repoGroups` の形が合わないときは、`layout` と同じく捨てるだけにする（保存全体を壊れた扱いにしない）。
6. [nit] `composeServer.ts:871`・`SessionFile.ts:41-45`: 保存の `repoKey` の「項目が無い＝未確定／null＝管理外」のコメントと、実装（判定前でも null を書く）を合わせる。
7. [nit] `orderedWorkspaceIds`（`workspaceOrder.ts:4-9`）は本番の呼び出し元が無いので、テストごと消す。

直さないもの（review.md に記録だけ）: `containerOf`・`listOf` の二重（サーバと client-core）。

## 確かめること

- 依頼元が流した E2E で `workspace-tab-pane.spec.ts:305`（「新しい pane を作る操作の直後に打った文字は…」D99）が 1 件落ちた。`main`（取り込み前の基準）でも落ちる・揺れる件かを確かめ、この作業による退行なら直す。結果を decisions.md に書く。

## 終わり方

全部終わったら、`pnpm build`・`pnpm typecheck`・`pnpm test` と、`workspace-groups.spec.ts`・`workspace-tab-pane.spec.ts`・`subagents.spec.ts` を流し、直した内容と結果を報告して止まる（push・PR はしない）。コンテキストが足りなくなりそうなら、区切りのよい所でコミットして、残りを報告して止まる。
