# 作業用proxyの切断理由と短い通信断の復旧

ユーザーはhandoff以外でもproxyが終了する。直近はmachine linkの一時切断を記録。実装は接続世代の失効やpoll失敗で即cleanupし、終了理由を保存しない。1要求320秒のtimeoutもMCP側の接続を永久に閉じる。

- 同じAサーバが動いている間の短い通信断に60秒の復帰猶予を設ける。5秒間隔と次の操作開始前に再接続を試みる。IPC能力とagent paneは維持する。
- machine id固定。新しいchannelでBの元request id/claimをwork.agent_checkで検証し、元workspace/folder/root/identityをwork.inspectで照合してから採用する。元Bのpane/PJ/権限が変わった、またはBサーバ再起動でclaimを失った場合は復帰を拒否する。
- 自動再送するのは上記の読み取り/権限検査だけ。送信済みのtool/exec/transfer/plugin/指示は再送しない。切断中の操作は結果不明を明示し、復帰後に新しい読み取りで確認する。
- 起動済みB requestはplugin有無を問わず24時間保持し、proxyの寿命と合わせる。pending要求の10分制限は維持。
- pollの通信エラーは復帰待ちへ移し、scope/claim拒否・A pane消失・明示終了・24時間満了・Aサーバ停止では理由を付けて閉じる。
- clientの320秒timeoutでは当該要求を失敗させ、既存cancelで中断を要求する。proxy接続を閉じず、書き込みの自動再送もしない。
- server.logに切断/再接続/終了の固定理由、request/machine/pane idだけ記録する。secret/claim/command/file本文/パス/自由な例外文面は記録しない。private IPCに終了理由を通知し、新CLIは具体的な理由を表示。旧CLIは未知通知を無視できる。
- Aのhandoffを跨ぐIPC引継ぎは対象外。更新後は一度起動し直す。B再起動で能力を新規発行して継続することもしない。

独立レビュー必須。実machineを切断せず、fake connectionとisolated A/B統合で復旧・同じtarget確認・結果不明のwrite無再送・復帰期限・320秒後の接続継続を検証。negative controlを行う。
