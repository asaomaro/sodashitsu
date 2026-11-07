# Codex音声の正式Unix WebSocket化

前作2bcd41ab/33a72f4aの後続。コードの変更は既存daemonの所有・WS framing・physical socket quotaの共通化と、CodexAudioのJSONL proxyから正式WSへの移行。状態readerのallowlistを音声へ広げない。

## 変更範囲

- CodexControlSocket: 所有socket/PID/kernel世代の前後検証、HTTP Upgrade、text JSON frame、応答/時間上限、物理closeまで最大2枠・用途/親ごとの重複制限。
- 各adapterはtyped/runtime双方のmethod allowlistを渡す。状態はinitialize/loaded/readだけ、Audioだけturn/startを1回許可。モデル一覧の将来adapterは別allowlistを使えるが今回未追加。
- Audioは既存loaded/idle/会話ID/canonical cwd/guard/TTL/cancelを再検証し、daemon世代確認と最後のguardの後に1回送信する。モデル/effortを変更せず、ACK喪失・失敗・終了不明を再送しない。
- Uploadsのowned枠はChildProcessから実socket close完了Promiseに置換。handshake成功前から登録し、physical close eventでだけ解除。suspendが未終了socketを見落とさない。音声の保存/容量/所有者/TTL/保持削除は不変。
- CLI/daemon/modelの新起動なし。Linux所有Unix socketだけ対応し、Windows等は明示的に共通文字起こしへ案内。

## 検証

専用worktree/Node24/専用依存。source/fixturesを固定して最終検査を実施。

- 関連5files84tests pass（tests.log）。実Unix socket/HTTPUpgradeの偽WSサーバーに対して生成localAudioパケットのACK、ACK喪失時1回のみ送信、daemon世代変更時送信0を検証。readonly allowlistへのturn/startもruntime拒否。
- 既存Uploadsの保存・取消・不明送信ファイル保持などの回帰と、physical socket未終了時suspend拒否を確認。
- 旧CodexAudioだけへ戻した負例はexit1（negative.log）。旧spawnは明示mockで遮断し、負例から本番CLIへ接続しない。固定sourceへbyteexact復元（restoration.json）。
- server project build exit0（build.log）、最終server typecheckはテストfixtureも含む（typecheck.log）。途中のtypecheckで旧owned:ChildProcess contract残りを検出し、socket close Promise契約へ修正後の固定sourceで最終検査をやり直した。
- 実音声・利用者会話へのモデルターンは送信していない。生成値の偽サーバーACKはモデルが実音声を理解したという証拠ではない。録音/音声file/settings/UAC/sr-pc操作なし。

共通transportの状態通信予算は1500ms/各1000ms、Audioは既存TTLと最大30秒を維持する。close確認は最大1250msを別に待ち、終了不明ならquotaを保持して成功扱いにしない。全体CIはrootの統合後に1回。
