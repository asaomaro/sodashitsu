# Windows user-microphone の fresh session 確認

対象は WindowsUserMicrophoneRole.Read のセッション ID 取得だけ。PID を毎回 ProcessIdToSessionId へ渡す。API 失敗、session 0、int 範囲外を拒否する。キャッシュ、100ms PCM期限、owner/logon/elevation/active console/WTS lock、heartbeat、peer の生成時刻・生存確認は変更しない。通常 microphone の overload は変更しない。

## 検証

専用の通常ユーザー Windows セッションで、コピーした生成 fixture のみ使用。WASAPI・画面・実音声は開かない。Node24 の owned hidden runner から .NET Framework csc /warnaserror+ でコンパイルし、各 native プログラムの終了を確認した。

- 初回実 C# compile と generated/native/fake-sink 検査: exit 0。
- Native session の失敗/0/範囲外/PID不正: 8 rejection。既存 TOKEN_GROUPS 28 rejection、policy と fake PCM pipe 検査も通過。
- 実自己 token と通常 peer の logon 一致、managed/native session ID の同値確認: pass。ID、資格情報、音声内容は記録しない。
- native session 条件、native logon、lock、SYSTEM、elevation、別logon、startup、heartbeat、peer の9 source負例: 各期待箇所で exit 1。各変更後に source 全 byte を復元。
- 復元後に再 compile / 検査 exit 0。元 repository source の byte は不変。
- TypeScript/Nodeコード変更は無く、全体の TypeScript / 14k tests は重複実行しない。Python構文と git diff --check は成功。

生出力は [raw-checks.log](raw-checks.log)。Windows のローカライズされた stack marker は Node の既定 UTF-8 capture で文字化けしているが、翻訳・整形せず取得結果を残した。失敗の assertion 本文と終了コードで判定した。

## 旧 getter の負例と速度比較

実装の session 代入だけを process.SessionId へ戻し、同じ generated/native 検査を実 compile した。事実自体は同じなので機能検査は通る。この問題を機能テストの失敗とは扱わず、同じ Windows / 同じ fresh Read 100回の匿名比較を追加した。元に戻して再 compile し、全 source byte 一致を確認した。

[benchmark.json](benchmark.json) の平均は old getter 2.889155ms、fixed 0.131643ms、restored fixed 0.106882ms。source の正常1frameでは最低7回の fresh Read があり、旧経路は guard だけで平均20.224msを消費し20ms periodを超えた。fixedでは同じ最低7回で0.9215ms。これは機器依存の診断結果で、CIへ固定 wall-time 閾値は追加しない。

取得する native session 自体の分解計測は平均0.001908ms、managed getterは3.283144ms。fresh WTS25は0.148357ms、native logonは0.076447ms。同じ fact と照合回数を維持したまま、managed process 情報取得の重さを除く。

## 実機音声の到達範囲

この変更の検証は無音声。実 protected-source / ordinary actor / CABLE baseline の到達は別 fixture で確認済みだが、6秒 tone / 連続受信は未合格。新 role の配布・再生成と fixture の absolute cadence 校正後に再測定する。速度比較だけで tone 0 の単独根因・音声成功・UAC受信完了は主張しない。
