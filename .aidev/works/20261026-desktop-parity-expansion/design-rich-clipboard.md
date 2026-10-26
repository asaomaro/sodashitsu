# 第1段階: 画像・書式付きclipboard

## 振る舞い

通常画面で明示的に許可した1 viewerだけにPNG/HTML/plain/RTFを公開する。旧テキストAPIは8192文字のまま、新APIは1 ClipboardItem、形式別容量と4MiB束上限を設ける。ブラウザの非対応形式は通知し、Excel固有形式等を扱うと装わない。

## 通信と境界

全peerのprotocol/capability opt-in後に親viewerへ紐付く一回限りのticketを発行し、専用双方向WSSへ束を16KiBずつstop-and-waitで流す。操作/映像に混ぜない。A/Bサーバはmetadataだけを保持し、束の組立はviewer/Windows workerだけ。所有者/許可/heartbeat/世代/offset/size/期限を各段で検査する。通常の入力許可上限はhelperが返したs.allowInputを使う。

STA clipboard workerは要求までOS clipboardを開かない。PNG/DIB/HTML/RTF/GlobalAllocを準備後、OpenClipboard直後・EmptyClipboard直前に現在世代/許可/取消token/sequenceを再検査する。transaction固有のsticky cancellationとbounded先行cancel ledgerを使い、別IDのcancelで取り消しが復活しない。途中束はOSへ書かない。Windows APIで書込み開始後のOS障害から復元は保証しない。

応答3秒/idle5秒/全体60秒。parent終了、blur、grant解除、pipeline終了で転送を取り消す。clipboard pipelineだけの障害で映像/入力は切らない。rich同期解除後はlegacy text同期を再開できる。

## 同期

手元と共有元それぞれhashを記憶。共有元を手元へ書く直前に手元が変わっていないか再確認する。書いた後の読み戻しは新しいコピーを同期済み扱いする競合があるため使わず、次pollで手元の現在値を一度送り返す。形式の正規化や未対応形式は手元を基準に収束する。

## 検証

生成PNG/HTML/RTF、fake IBoard、memory navigator.clipboardを使う。OS clipboard/実入力/実captureは自動試験しない。chunk超過、旧helper、local input ceiling、idle、世代/sequence revoke、cancel競合、フォーカス、busy/manual/auto開始停止、経路切断fallback、新copy競合を検査し、修正だけを外す負例とbyte-identical復元を記録する。Windows統合はValidateOnlyでcompileのみ実行する。
