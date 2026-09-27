# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/server/src/handoff/HandoffController.ts:92 `isBusy` を直接確かめるテストが無く、常に false でも通った / 対応: 修正済（HandoffController.test.ts の「実行中にもう 1 つ来たら busy」に isBusy の前後を足した。T1・ラウンド1）
- [nit][conv:-] packages/server/src/handoff/HandoffSocket.ts:23 `StopReply` の置き場が design（controlRequests.ts）と違う / 対応: 修正済（循環 import を避けるため HandoffSocket.ts に置くと decisions D8 に記録。T1・ラウンド1）
- [nit][conv:-] packages/server/src/main.ts:66 停止の失敗の `console.error` の 2 つ目の引数が `undefined` のとき落ちる / 対応: 修正済（`error(...args)` をそのまま渡す。T3・ラウンド1）
- [nit][conv:-] .aidev/works/20260927-session-stop/design.md `beforeClose` と実装の `showTokenIfUnshown` の名前の食い違い / 対応: 修正済（design を実装に揃えた。T3・ラウンド1）
- [nit][conv:-] packages/server/src/serveShutdown.test.ts:69 シグナル→シグナルの直接のテストが無い・後続を待たない / 対応: 修正済（テストを足し、後続を待つ。T3・ラウンド1）
- [should][conv:-] packages/server/src/composeServer.stop.integration.test.ts:54 後続の指示が close() と競合し、落ちると捕まらない reject になる / 対応: 修正済（close() より先に並行して繋ぎ始め、reject も記録する。T2・ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.stop.integration.test.ts:73 socket がロックより前に閉じることを見ていない / 対応: 修正済（閉じ終えた後に socket のファイルが無いことを確かめる。T2・ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.ts:499 `.catch` は今は効かない / 対応: 修正済（将来への備えとコメントを改めた。T2・ラウンド1）
- [should][conv:-] packages/server/src/stop/stopCommand.test.ts:195 繋げなかった後の見直しで持ち主の pid が替わった分岐を確かめていない / 対応: 修正済（ECONNREFUSED と [42,99] で 3 を足した。T4・ラウンド1）
- [nit][conv:-] packages/server/src/stop/stopCommand.test.ts:166 シンボリックリンクのケースが無い / 対応: 修正済（sessions/<名前> が別の場所を指すリンクで 2・何も送らない を足した。T4・ラウンド1）
- [nit][conv:-] packages/server/src/stop/stopCommand.test.ts:154 綴り違い・ディレクトリでないのテキストの ConfigError を通していない / 対応: 修正済（T4・ラウンド1）
- [nit][conv:-] packages/server/src/cliArgs.ts:31 `parseArgs` の説明が `list|delete` のまま / 対応: 修正済（T5・ラウンド1）
- [nit][conv:-] packages/server/src/cliArgs.ts:151 `applySessionEnv` の説明に stop が無い / 対応: 修正済（D3 の理由を添えた。T5・ラウンド1）
- [should][conv:-] packages/server/src/config.ts:254 別のホストのとき案内を省く分岐を確かめていない / 対応: 修正済（別のホストのロックで delete・token reset とも案内が出ないことを確かめるテスト。T6・ラウンド1）
- [should][conv:-] packages/server/src/sessionCommands.ts:96 案内が `--state-dir` を引き継がず、そのまま打つと既定の根を見て止められない / 対応: 修正済（`sessionStopCommandFor` で既定でない根なら `--state-dir` を添える。T6・ラウンド1）
- [nit][conv:-] packages/server/src/sessionCommands.test.ts:191 WTM_SESSION から選んだ名前の案内のテストが無い / 対応: 修正済（T6・ラウンド1）
- [should][conv:-] packages/server/src/persist/namedSession.ts:56 Windows でも（非対応の）`wtm session stop` を案内し、POSIX の引用で打てない / 対応: 修正済（Windows では案内しない。platform を渡すテスト。T6・ラウンド2）
- [nit][conv:-] packages/server/src/sessionCommands.test.ts:199 期待値に引用なしの一時ディレクトリを埋め込んでいた / 対応: 修正済（`sessionStopCommandFor` で期待値を作る。T6・ラウンド2）
- [should][conv:-] packages/server/src/stopSmoke.ts:261 起動し直した後の「同じ pane の id」が新しく始めた起動と見分けられない（p1） / 対応: 修正済（2 つ目の workspace の pane〔p2〕に印を打ち、その id と画面が戻ることを見る。T7・ラウンド1）
- [nit][conv:-] packages/server/src/stopSmoke.ts:251 繋ぎ直しの失敗の原因を捨てる / 対応: 修正済（最後の失敗を時間切れの文に添える。T7・ラウンド1）
- [nit][conv:-] packages/server/src/stopSmoke.ts:200 起動待ちがシグナルでの終了を見ない / 対応: 修正済（signalCode も見る。T7・ラウンド1）
- [nit][conv:-] packages/server/src/stopSmoke.ts:172 待ちの timer を解除せず smoke が延びる / 対応: 修正済（unref。T7・ラウンド1）
- [nit][conv:-] packages/server/src/stopSmoke.ts:169 後始末でシェルが残りうる / 対応: 修正済（サーバを SIGKILL で止めたときだけシェルの pid に送る——普段は送らない〔pid の再利用〕。T7・ラウンド1）
- [nit][conv:-] docs/verification.md:414 引き継ぎの直後の断りは時機で `unreachable` にもなる / 対応: 修正済（両方の案内を書いた。T8・ラウンド1）
- [nit][conv:-] docs/verification.md:414 「その窓ごと」が曖昧 / 対応: 修正済（「サーバとその pane のシェルごと」。T8・ラウンド1）
- [should][conv:-] packages/server/src/composeServer.ts:470 socket を閉じる位置を移したことで、引き継ぎの最中のシグナルで停止と引き継ぎが並んで走りうる / 対応: 修正済（`beginClosing` が受け付け済みの引き継ぎの終わりを待つ。decisions D9。cross・ラウンド1）
- [should][conv:regression-negative-control] packages/server/src/composeServer.ts:474 `close()` が最初に引き継ぎの終わりを待つ配線がテストで固定されていない / 対応: 修正済（`internal.handoffPreflight` で引き継ぎの最中を作り、close() が端末の破棄・ロックの解放を待つことを確かめる結合テスト。await を外すと落ちることは test 工程の負の確認で確かめる。cross・ラウンド2）
- [nit][conv:-] packages/server/src/handoff/controlRequests.ts:66 シグナルで止まる途中かつ引き継ぎの最中の stop は alreadyStopping ではなく busy、起動の途中にシグナルを受けた後の stop は alreadyStopping:false を返す / 対応: 許容（どちらもサーバは止まり、CLI の表示の違いだけ。cross・ラウンド2）

## ラウンド 1（2026-09-27T03:20Z）
- [should][conv:-] packages/server/src/handoff/controlRequests.ts:51 止まる途中のサーバへの `wtm handoff` が `busy` で断られ、既存の CLI が「the server keeps running as before」と事実と逆の案内を出す（handoffCommand.ts:131） / 対応: 差し戻し
- [nit][conv:-] packages/server/src/stop/stopCommand.ts:200 繋げなかった後の見直しで持ち主の pid が替わっていても「動いていない（3）」と答える（別のサーバが動いている） / 対応: 差し戻し
- [nit][conv:-] packages/server/src/stop/stopCommand.ts:207 `unreachable` の案内が pid の再利用（前のサーバが落ちた残りのロック）の場合の次の手を示さない / 対応: 差し戻し
- [nit][conv:-] docs/verification.md:479 Windows の手順で、止めて消した後に「動き続けること」を確かめる順になっている / 対応: 差し戻し
- [nit][conv:-] packages/server/src/stop/stopCommand.ts:60 `readSessionsDirDefault` が namedSession.ts の非公開の `readSessionsDir` と重複 / 対応: 差し戻し
- ラウンド 1 の対応（coding のやり直し）: 5 件とも修正済。止まる途中の handoff の断りを新しい reason `stopping` にし、`wtm handoff` はそのとき「動き続ける」と言わず `wtm serve` で起動し直すよう案内する（controlRequests.ts・HandoffController.ts の `HandoffFailureReason`・handoffCommand.ts）／見直しで持ち主の pid が替わっていたら `unreachable`（1。「changed while stopping」）／`unreachable` の案内に pid の再利用の場合の `wtm.lock` の消し方を添えた／verification.md の Windows の手順の順序／`readSessionsDir` を namedSession.ts から公開して再利用。負の確認（M13・M22・M23）で各テストが落ちることを確かめた。

## ラウンド 2（2026-09-27T03:45Z）
- [nit][conv:-] .aidev/works/20260927-session-stop/design.md:104 ラウンド 1 の修正（reason `stopping`・見直しで pid が替わった分岐・wtm.lock の案内）が design に反映されていない / 対応: 修正済（design の該当 5 か所を実装に合わせた）
- ラウンド 1 の 5 件はすべて解消を確認（独立 review）。must/should は 0 件。
