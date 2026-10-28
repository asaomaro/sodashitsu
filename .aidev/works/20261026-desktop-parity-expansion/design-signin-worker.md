# 7B サインイン画面の専用worker

セッション0のSYSTEM brokerと、physical consoleのWinSta0\\Winlogonに固定したSYSTEM workerを分ける。CreateProcessAsUserはsessionを跨ぐhandle継承を使えないので、ランダムnonce付きのローカル専用pipeを使い、両端のPID/作成時刻と固定exe/compiled ownerを検査する。一般のコマンド/ファイル/clipboard/audio/agent APIは持たない。workerは実ユーザーtokenを使わず、専用の複製primary SYSTEM tokenだけを対象consoleへ固定する。

worker内ではcandidateの二重読取りに加え、desktop switch/全WTS session changeを不可逆epochとして扱う。observer markerとcandidate読取りの前後のepoch一致を要求し、broker/worker kernel handle、session、nonce、期限を再検査する。事実の読取りはOS全体の原子snapshotではない。変化やtimeoutを観測したscopeは復活しない。frame取得前/取得後/圧縮後/出力直前と入力直前に検査し、120秒で終了する。

GDI JPEGのprimary画面だけから始め、ACK1枚・鮮度1.5秒・入力seq/表示frame seqを検査する。入力はenrollmentの上限と接続ごとの明示sealed grantの積。起動直後はcontrol=falseで、暗黙の再許可をしない。署名/enrollment/key/controller/installer/UIが揃うまで実サービスは動かさない。生成factsと生成pipe/processだけで境界を確かめ、実capture/input/loginは自動実行しない。

根拠: [CreateProcessAsUserWのsession別handle継承制限](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw)、[WTS session通知](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsregistersessionnotification)、[WM_WTSSESSION_CHANGE](https://learn.microsoft.com/en-us/windows/win32/termserv/wm-wtssession-change)。

Node ownerとの終了契約: brokerはJob内active process=0・output pump joinと全lease解放の後にだけ`signin_stopped`をprivate stdoutへ出す。Nodeはこのackとexit0を確認するまで次のworkerを許可せず、不明な終了はservice全体を停止してfail closedにする。これはOS停止の実測ではなく、native/Node間の契約である。
