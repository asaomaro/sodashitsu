# 独立レビューの指摘（依頼元から。must 0・should 7・nit 6）

直すもの: 1〜6 と nit の 8・9・13。それぞれ回帰テストを足し、壊して落ちる確認をする。1〜2 コミットにまとめる。依頼元が origin/main（PR #78 まで）を取り込んだ（a414077）ので、その上に積む。

1. [should] 一覧をボタンから開いている間にエージェントが居なくなる・pane が閉じると、フォーカスがサイドバーにも端末にも戻らない（`close()` はボタンも行も無いと何もせず、`closeDialog()` は `focusedPaneId` に同じ値を書くだけで `TerminalPane` の watch が動かない）。AC-I4「サイドバー、無ければ端末へ戻る」。ボタンも行も無いときは、今フォーカスのある pane の端末へ明示的にフォーカスを戻す。単体（行が消えた DOM）と E2E（閉じた後の `activeElement` が端末）で見る — SubagentListDialog.vue:67-79, store/view.ts:522-527, TerminalPane.vue:66-72, subagents.spec.ts:243-266
2. [should] 切れたマシンのノードで、キー `s` だと古い一覧が開く（ボタンは `exists === true` のときだけ出るが、`subagentCountOf`／`openSubagents` は `exists` を見ない）。同じ条件を掛ける — graph/GraphView.vue:986-993, :1167-1170, GraphNode.vue:53-55, store/graph.ts:373-388
3. [should] 端末版の一覧は、開いている間に経過時間が進まない（タイマーが無い。F6「少なくとも 10 秒ごと」）。overlay が開いている間だけ 10 秒ごとに描き直し、閉じたら止める — tui/src/modes/SubagentList.ts:93-140, app/TuiApp.ts:480-485
4. [should] エージェントが居なくなった後（X → null で状態を捨てた後）に遅れて届く報告が、`instanceId: null`・`seen: true` の状態を作り直し、次に検出された別のエージェント（codex でも）に `{count: 0}` や残った `items` を付ける（F10・AC11「報告を一度も受けていない＝null」と食い違う）。検出の無い pane への報告で作った状態は、次の検出が **claude で、かつ報告より後に始まったものでない**ときだけ引き継ぐ、など、design の「検出より前の報告と最初の検出」（起動直後の SessionStart より前に届く報告を拾うための決まり）を壊さない形で塞ぐ。どう塞いだかを decisions.md に書く — server/src/agent/SubagentTracker.ts:96-103, :241-255, :288-299
5. [should] セッションの上限（32）の捨て方が、動いているサブエージェントを持つセッションを先に捨てうる。`stopped` だけが残ったセッション（動いているものが 0）を先に捨て、それでも超えるときだけ古い順にする。テスト（:364-369）の期待も直す — SubagentTracker.ts:144-151, :235-238
6. [should] AC12「報告に失敗する状況（socket が無い・サーバが止まっている・pane の外）で、何も出力せず正常に終わる」の自動テストが無い。スクリプトの単体で、3 つの状況それぞれの stdout・stderr が空で終了コード 0 を見る（イベントは `Stop` を含める） — server/assets/agent-hook-report.test.ts:27-62, :236
8. [nit] `ContextMenu.ts:66` のコメント「キーボードだけの道筋の 1 つ」を事実に合わせる（メニューはマウス用。D11）。
9. [nit] `uninstall()` が空の配列（`"PreToolUse": []` など）を残す。自分のエントリを除いて空になった経路は、キーごと消す（元から空だった経路は触らない） — AgentIntegrationInstaller.ts:321-330
13. [nit] 定数の後の空行が 2 つ — AgentIntegrationInstaller.ts:19-20

直さないもの（review.md に記録だけ）: 7（端末版のキーボードの道筋は `show_subagents` へのキー割り当てだけ。既定のキーを付けるかは利用者の判断待ち）、10（`SessionStart` だけ手で消した状態）、11（「起きないこと」の固定の待ち。陽性の対照あり）、12（E2E のイベント待ち。判定はブラウザ）。

テストや確認で起動する子プロセスに SODA_* の環境変数を継がせない決まりは今までどおり。終わったら、直した内容とテストの結果を報告して止まる（push・PR はしない）。
