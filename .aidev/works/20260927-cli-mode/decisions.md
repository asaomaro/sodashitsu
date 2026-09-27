# 判断の記録（20260927-cli-mode）

## D1 三層の判定と実行モード（2026-09-27T16:20Z）

- **背景**: requirements はユーザーとの対話（interactive）で確定・承認した。その後ユーザーから「こちらで確認はしないので、①の PR と merge まで進めて。
  ①の完了時点で 4 時間（起点 2026-09-27T16:20Z）が経過していれば停止。②（20260927-agent-graph）の途中で 4 時間が経過したら、作業中の工程が完了したタイミングで停止」と指示された。
- **決定**: full のまま、requirements 承認後の工程を `mode: autonomous` で回す（`state.yml` の `mode` を interactive→autonomous に変更）。
  deliver は PR 作成に加えて **merge まで行う**（`protocol-autonomous.md` の「auto-merge 禁止」はユーザーの明示の指示で上書き）。
- **理由・代替案**: 各ゲートで確認を待つ interactive は、ユーザーが確認しないと明言したため採らない。merge 禁止のまま PR で止める案は、②へ進む指示と矛盾するため採らない。
- **影響**: 上流文書は `aidev doccheck`、coding の各タスクは `aidev taskcheck` で独立点検を記録する。test が通らないまま merge しない（通らなければ draft PR で停止して報告）。

## D2 手元のサーバへの自動の接続は「0600 の秘密ファイル＋同じマシンからだけのログイン」（design D-4）

- **背景**: token は平文で残らない（research F7.5）。token なしの既存の口 `bridge.sock` は Windows に無く、行き先（machine）を選べない。Windows では Node から DACL 付きの named pipe を作れない。
- **決定**: サーバが起動ごとに乱数の秘密を `<state>/local-auth.json`（0600）に書き、`POST /api/local-login` が「同じマシンからの接続（remoteAddress と localAddress が同じ）かつ秘密の一致」のときだけ通常の session cookie を出す。以後はブラウザと同じ `/ws`。
- **理由・代替案**: 全 OS で 1 経路になり、`?machine=`・失効（4401）・TLS がブラウザと同じに効く。退けた案: A/B（Unix socket。Windows に無く 2 経路）、D（handoff.sock。Windows に無い）、E（sodactl の cookie。初回に token が要る）。
- **影響**: Windows の信頼の根拠は `%LOCALAPPDATA%` の既定の ACL（同じ利用者・SYSTEM・Administrators）。`--state-dir` を任意の場所にした場合はその場所の権限に依る（docs に書く）。HTTP の口が 1 つ増えるが、同じマシンからでなければ秘密を知っていても通らない。

## D3 設定をサーバに置き、ブラウザ同士でも共有する（design D-3）

- **背景**: requirements F11・F9・AC11・AC13 は「端末版と Web 版で設定を共有」。今の設定はブラウザごとの localStorage（research F3.1）。
- **決定**: `prefs.get`/`prefs.set`/`prefs.changed` と `<state>/prefs.json` を新設し、web は localStorage を起動時の表示用のキャッシュに下げる。初回だけ localStorage の値をサーバへ移す。端末ごとの項目（サイドバーの幅・折りたたみ）はブラウザごと・端末版ごとのまま。既読（`done`）はクライアントごとのまま。
- **理由・代替案**: 要件の「共有」を満たす唯一の置き場所はサーバ。退けた案: 端末版だけ別の設定ファイル（要件に反する）。既読の共有（herdr・docs が「クライアントごと」と明記しており、変える理由が無い）。
- **影響**: **ブラウザ同士でも設定が共有されるようになる**（今の挙動からの変化）。2 つのブラウザで違う設定を使っていた人は、最初に繋いだブラウザの値に揃う。docs に書く。

## D4 herdr にあって Web に無い操作は web にも実装する（design D-7）

- **背景**: 端末版は herdr 同等（requirements）。research F1.2 の操作は Web に無い。操作表と設定は共有（D3）。
- **決定**: `switch_workspace_1..9`・`open_worktree`・`remove_worktree`・`swap_with_focused`・`stop_server` を共有の操作表に足し、web と端末版の両方に実装する。既定のキーは herdr と同じか「なし」で、既存の既定は変えない。
- **理由・代替案**: 端末版だけに足すと、共有の設定画面に web で効かないキーが並ぶ。
- **影響**: web の変更が増える（小さい）。
