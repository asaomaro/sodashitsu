# 判断の記録: 20261004-subagent-display

## D1: 範囲（利用者の指示と、主エージェントの勧め）

- 利用者の依頼（2026-10-04）: 「エージェント自身が起動しているサブエージェントを表示するようにできますか？」→ 案 A（件数と一覧。グラフのノードにはしない）から進める（利用者の回答「Aから」）。
- 主エージェントの勧め（利用者に提示済み）: 導入済みの利用者には設定画面で「更新が必要」と出し、押したときだけ足りないフックを足す／説明が取れなければ種類と経過時間だけ／対象は Claude Code だけ。

## D2: フックの実物の確認（Claude Code 2.1.289。3 回）

research.md「F-H1」〜「F-H16」。要点: 同期のフックでは実行前 → 起動が対になって順に来る／`Stop` の `background_tasks` に、動いているバックグラウンドのサブエージェントの ID・状態・説明・種類が入る／`SODA_PANE_ID` がフックに引き継がれる。利用者の設定は変えず、`claude -p --settings <一時の設定>` で確かめた。

## D3: 設計の独立点検で決めたこと（15 件）

- **検出より前の報告を失わない**: `SubagentTracker` が pane ごとに最後に見た `instanceId` を持ち、無し → X は捨てずに配り直す。X → null・X → Y は捨てる。
- **一覧の対象は `{machineId, paneId}`**（pane の ID はマシンをまたいで衝突する）。
- **グラフの中の一覧は、グラフの `<dialog>` の中の横のパネル**（グラフの上で `view.dialogContext` を使うと文脈と戻り先が上書きされるので、既存のコードは避けている）。入口はノードの件数のクリックとキー `s`。
- **フォーカスの戻り先**: ボタン → 行（`tabindex="-1"`）→ 端末。
- **突き合わせで足すのは `status: "running"` だけ**。最近終了した ID は足し直さない（フックは並行に走るので、終了と作業の終わりの到着順は保証されない）。
- **上限はスクリプトとサーバの両方で掛ける**。受け口の上限は 32768 文字、`running` は 64 件まで（超えたら `truncated` で、足すだけ・外さない）。
- **`SessionEnd` のフックを足す**（6 つ目）。同じ pane の中で起動した別の `claude` が終わったとき・`/clear` のときに、そのセッションの分を捨てるため。強制終了された分は残りうる（既知の制約）。
- **`uninstall` はスクリプトを消さず、何もしない中身に差し替える**（動いている Claude Code が古いフックのまま、無いスクリプトを同期で起動し続けるのを避ける。実物で害が無いと分かれば今までどおり消す）。`SessionStart` だけ手で消した状態からも外せるようにする。
- **フックごとの同期・非同期**（design の表）。
- **別のマシンの要約にも最大 64 件の一覧が載る**ことは許す（サーバは要約の接続を見分けられない。100 ミリ秒のまとめで量を抑える）。
- `sodactl` の一覧の項目は `null` で埋め、項目の有無を揺らさない。

## D4: T1 の実物の確認（Claude Code 2.1.289・2026-10-04。`claude -p --model haiku --settings <一時の設定>`。SODA_* は子プロセスから消した）

設計と食い違う事実は無かった。確かめたこと:

- **(1) `SessionEnd`**: `claude -p` の終わりに 1 回発火した（最後の `Stop` の約 80ms 後）。入力は `session_id`・`transcript_path`・`cwd`・`prompt_id`・`hook_event_name`・`reason`（この場合 `"other"`）。`/clear` でセッション ID が変わるかは対話が要るので**未確認のまま**（`SessionEnd` が来ても来なくても、`agent_stop` の突き合わせと、エージェントの入れ替わりで捨てる仕組みで外れる）。
- **(2) 同期と非同期の混在**（`PreToolUse`・`SubagentStart`・`Stop` を同期、`SubagentStop`・`SessionEnd` を `async: true`。前面 2・バックグラウンド 1 を 1 メッセージで並行に起動）: 起動順は `PreToolUse`(A) → `SubagentStart`(A) → `PreToolUse`(B) → `SubagentStart`(B) → `PreToolUse`(C) → `SubagentStart`(C) で、**対の順序は保たれた**（各対は 90〜100ms 差。F-H9 と同じ）。非同期の `SubagentStop` は、起動の報告より後に届いた。
- **(3) 所要**: 実物のスクリプトを 10 回起動した平均で、環境変数が無い（pane の外）と約 24ms（素の `node -e 0` と同じ）、socket へ送ると約 52ms。同期のフックが Agent ツールの呼び出し・ターンの終わりごとに足す遅れは、この程度（目標の 0.3 秒に十分収まる）。
- **(4) matcher `Agent\|Task`**: 同じ実行で `TaskCreate` が呼ばれたが、`PreToolUse` の記録は `tool_name: "Agent"` の 3 件だけ。**`TaskCreate` には当たらない**。スクリプト側の `tool_name` の絞り込みは保険として残す。
- **(5) スクリプトが無い状態**: 同期・非同期のどのフックも `exit_code: 1`・`outcome: "error"`（stderr に `Cannot find module`）になるが、**エージェントの動きは止まらず**、`claude -p` は正常に終わった（`is_error: false`）。対話の画面にエラーが出るかは `-p` では確かめられず**未確認**。害は無いが、利用者に見えうる雑音なので、**`uninstall()` は設計どおり、スクリプトを消さず何もしない中身に差し替える**（T19）。
- ほか: `SubagentStop` の `background_tasks` には、終わる直前のものを含めて動いているものが `running` で載る（F-H11 と同じ）。`Stop` の時点で `background_tasks` に `running` のものが 1 件残る場面があり（バックグラウンドの A が、まだ `SubagentStop` を出す前）、その後に `SubagentStop` が来た。**`Stop` の突き合わせで足されたものを、遅れて来る `SubagentStop` が外す**順は実在するので、`stopped` の扱い（設計）に加えて、`subagent_stop` は無い ID でも `stopped` に入れる（設計どおり）ことを T5 のテストで押さえる。

## D5: T3 で決めたこと（スクリプトの細部）

- **`Stop` に `background_tasks` が無い**（古い Claude Code）ときは、`{type:"agent_stop", running: [], truncated: true}` を送る。`truncated` は「足すだけ・外さない」なので、動いているものを誤って外さず、`pending` の掃除だけが効く（design は `truncated` を「64 件を超えたとき」としていたが、意味は同じ「一覧が完全でない」）。
- **kind が claude 以外**は、イベントの種類にかかわらず今までどおりセッション ID の報告（`type` なし）。
- **`agent_id` は 129 文字まで残す**（128 を超える ID を切って別の ID にしない。受け口が 128 超を捨てる）。
