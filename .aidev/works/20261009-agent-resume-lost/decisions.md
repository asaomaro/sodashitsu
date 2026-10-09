# decisions: agent-resume-lost

## D1 再現の結果（AC1。2026-10-10。事実）

道具: `packages/server/src/composeServer.resumeLost.integration.test.ts`。実物の `composeServer`（一時の stateDir・一時の HOME。利用者のサーバ・7780 番・`~/.local/state/sodashitsu` には触っていない）・実 PTY の bash・偽の `claude`（`exec -a claude` の node。画面の判定に当たり、引数を記録する）・実際のフックの受け口（`agent-report.sock`）への報告。

| 道 | 結果（直す前） |
|---|---|
| (a) サーバが動いているうちに、エージェントのプロセスだけが先に終わる（`pkill` の KILL・TERM・HUP の 3 通り） | **消える**。判定が「居なくなった」（非 null → null）と見た時点で、`updatePaneRuntime` が `agentSession` を捨て、`persist.touch()` で `session.json` からも消えた（保存の `agentSession` が無くなった）。次の起動は再開しない。3 通りとも同じ。 |
| (b) 再開のコマンドを打ち込んだ直後に止める（検知の前・検知の直後） | **消えない**。復元した pane は `pane.agent` が null のままなので、D9 の条件（非 null → null）に当たらない。保存にも残り、次の起動で `--resume` がもう一度打たれた（引数のログで確認）。 |
| (c) 短い間の 2 回の起動（停止 → 起動 → 検知の前に停止 → 起動 → 検知の直後に停止 → 起動） | **消えない**。毎回 `--resume <id>` が 1 回ずつ打たれ、二重には打たれない。 |

結論: 消える道は (a)——「システムの停止などで、エージェントのプロセスがサーバより先に終わり、サーバがそれを『エージェントが終わった』と判定する」。D9 の「居なくなったらすぐ捨てる」は、利用者がエージェントを終了した場合と、巻き添えで先に終わった場合を区別できなかった。報告の「Codex だけ再開されなかった」は、停止の途中で終わる順がエージェントごとに違った、で説明がつく（Codex のプロセスが先に終わり、Claude Code は後だった／間に合った）。実機の WSL の再起動そのものは試していない。

## D2 直し方（AC2〜AC4）

- 居なくなったと見えても、すぐには捨てない。`agentGoneAt`（居なくなったと見えた時刻）を覚え、**シェルが生きたまま `AGENT_GONE_GRACE_MS`（10 秒）、エージェントの居ない状態が続いたら**、次の `updatePaneRuntime`（判定の周期ごとに呼ばれる）で捨てて保存する。時間は単調時計（`clock`）。
- 猶予の間にエージェントが検出されたら、猶予をやめる。新しい会話の報告（`reportAgentSession`）が来ても、前の猶予を打ち切る（新しい参照を捨てない）。
- **サーバが止まる処理に入った後は捨てない**（`SessionService.beginShutdown()`。`composeServer.close()` の最初。`control.beginClosing()` の直後）。pane が閉じたときは猶予の記録も消える（PTY・シェルが終わった pane は、そもそも pane ごと無くなる）。
- 判定が失敗した周期（時間切れ）は、何も変えない（今までどおり）ので、「居ない」と見えない限り猶予は進まない。
- 10 秒という値: 利用者が `exit` で戻ってシェルで何かする時間より十分に短く、システムの停止でプロセスがばらばらに終わる間より十分に長い、という目安（要件の目安）。限界: エージェントを終了して 10 秒以内にサーバを止めると、次の起動で再開されることがある（受け入れる。文書に書いた）。
- 打ち込みで参照を消費しない・`hasPendingResume` の 30 秒の決まりは、変えていない（(b)(c) の回帰テストで確かめた）。

## D3 ログ（AC5・AC6）

- 復元のとき pane ごと: `agent resume command written`（`paneId`・`kind`・`session` は先頭 8 文字）／`agent resume skipped`（`reason`）。参照を捨てたとき: `agent session dropped (agent gone, shell alive)`（`paneId`・`graceMs`・`kind`）。
- `agent judgment failed`: 同じ pane・同じ理由が続くときは、最初の 1 回と、60 秒ごとに `repeated`（まとめた件数）つきの 1 行。違う理由は、すぐ出す。判定そのものの動きは変えない。

## D4 元から落ちるテスト

`composeServer.graph.integration.test.ts` の「引き継ぎの間は実行を止め…」は、この変更を外した状態（stash）でも 2 回とも落ちる。退行ではないと判断（仕様どおり 2 回まで）。

## レビュー後の修正の決定

| # | 事項 | 決定 |
| :- | :- | :- |
| E1 | S2 | `session.beginShutdown()` を `await control.beginClosing()` の前へ（`beginClosing` は引き継ぎの終わりを待つので、その間に先に終わったエージェントの参照が捨てられるのを防ぐ） |
| E2 | S3 | 統合テスト (a'')：エージェントが先に終わって 3 秒待ってから止める。猶予を 0 にすると落ちることを確かめた（陰性の対照） |
| E3 | S1（記録のみ） | 猶予の判定は `pane.agent === null` が条件で、「不在が続いたか」は見ない。揺れの間は `agentGoneAt` が消える設計なので実害は無い。`patch.agent === undefined` の更新が来ない pane（監視が止まった pane）では捨てられないが、今までと同じ種類の限界 |
| E4 | N1（記録のみ） | 10 秒以内に別の種類のエージェントを起動し、報告が来ないと、古い参照が残りうる（狭い。害は小さい）。直さない |
| E5 | N3・N4（見送り） | 判定失敗ログの間引きの細部（成功でのリセット・件数の持ち越し）。ログの出し方だけで動作に影響しないので、直さない |
