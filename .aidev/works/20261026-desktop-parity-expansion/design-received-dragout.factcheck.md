# design-received-dragout ファクトチェック

確認日: 2026-10-28。深さ: ざっと。指定3 URLを開き直し、外部browser/OSに関する主張・前提だけを照合した。本文・製品コードは変更していない。実OS dropは実行していない。

判定: 確認できた4件／食い違う0件／言いすぎ1件／確かめられない1件／対象外1件。

## 直す所

- C6: 特定のShell形式とA側native hostが一律に必須とは資料から言えない。候補となる取得・引渡し経路を別途設計する、という表現へ弱める。
- C4: Blob URLによるChrome/Edge各OSの実保存は指定資料だけでは未確認。現行の実験機能・実OS未検証という留保を維持し、資料でBlob URL互換性まで確認済みとは扱わない。

### C1 DownloadURLはWebページからOSへファイルとして取り出す仕組みである
- 場所: 冒頭のDownloadURL dragstart説明。
- 種類: browserの既存機能。
- 判定: 確認できた
- 根拠: Edge explainerは既存DownloadURLをChromium固有の仕組みと説明し、用途を「from a web page into the operating system as a file」とする。DownloadURL-listは複数ファイル向けの提案であり、既存DownloadURLとは区別される。
- 出典: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/DownloadURL-list/explainer.md （2026-10-28確認）
- 直し方: —。DownloadURL-listを実装するとの表現にはしない。

### C2 DownloadURLはMIME type・filename・URLをcolonで区切る
- 場所: DownloadURL形式の箇条書き。
- 種類: wire形式。
- 判定: 確認できた
- 根拠: 「The DownloadURL format requires a string with three colon-separated components:」。直後にMIME type、File name、URLを列挙し、`<mimeType>:<filename>:<url>`の例を示す。portable filenameやcolon除去の具体的規則は製品独自の予定である。
- 出典: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/DownloadURL-list/explainer.md （2026-10-28確認）
- 直し方: —。

### C3 Chromiumには利用者のdragからdownloadを開始する実装がある
- 場所: drag_download_file.ccの参照／user gestureの前提。
- 種類: browser実装。
- 判定: 確認できた
- 根拠: 原文に「activated by direct user action.」があり、実コードはDownloadUrlをDRAG_AND_DROPのdownload sourceで呼び出す。このファイル自体はDataTransferのDownloadURL parserやBlob URL対応判定を含まない。
- 出典: https://raw.githubusercontent.com/chromium/chromium/main/content/browser/download/drag_download_file.cc （2026-10-28確認）
- 直し方: —。これだけを根拠に全browser/OS対応としない。

### C4 private Blob URLをDownloadURLへ載せるとChrome/Edge各OSで実保存できる
- 場所: 冒頭のChrome/Edge向けとprivate blobURL方式から読み取れる互換性の前提。本文は実OS未検証と留保しており、対応済みとは明言していない。
- 種類: browser/OS互換性の前提。
- 判定: 確かめられない
- 根拠: explainerのURL説明・例はremote URLまたはdata URI。指定ChromiumファイルにBlob URL固有の許可やOS別実装はない。指定資料でBlob URLによる実保存成功を確認できず、別の出どころでは未確認。非対応の証明でもない。
- 出典: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/DownloadURL-list/explainer.md ; https://raw.githubusercontent.com/chromium/chromium/main/content/browser/download/drag_download_file.cc （2026-10-28確認）
- 直し方: 現行の実験機能・実OS未検証という留保を維持する。Blob URL対応を資料で確認済みとする表現は追加しない。

### C5 ShellにはIDataObjectとFILEDESCRIPTOR/FILECONTENTSによる転送経路がある
- 場所: 将来の直接dragに関する末尾段落。
- 種類: Windows Shell API。
- 判定: 確認できた
- 根拠: Shell資料はFILECONTENTSとFILEDESCRIPTORの併用およびIDataObject::GetDataでの取得を説明し、「These two formats are the preferred way」とする。特にfile-system fileとして保存されていないShell objectについての説明である。別の出どころでは未確認。
- 出典: https://learn.microsoft.com/en-us/windows/win32/shell/clipboard （2026-10-28確認）
- 直し方: —。候補となるShell経路の根拠として使える。

### C6 Explorerから手元への直接dragには特定Shell形式とA側native hostが必須である
- 場所: 『B側Shell IDataObject/FILEDESCRIPTOR/FILECONTENTSの許可とA側native drag hostの別設計が必要』。
- 種類: 方式の必然性。
- 判定: 言いすぎ
- 根拠: CF_HDROPについて「This clipboard format is used when transferring the locations of a group of existing files.」という別経路も説明され、C5の形式が全Explorerファイルで必須とはされていない。指定3資料は遠隔BからAへの方式やA側native hostの必須性も規定しない。別の出どころでは未確認。
- 出典: https://learn.microsoft.com/en-us/windows/win32/shell/clipboard （2026-10-28確認）
- 直し方: 例: 将来の直接dragには、B側のShell IDataObject等からの取得経路と、A側への引渡し方法（native drag host等）を別途設計する。特定API/host構成は候補として記す。

### C7 保持上限・期限・SHA・epoch・試験計画・未完タスクの扱い
- 場所: 8件／100MiB／5分と、SHA・取消・revoke・検証計画。
- 種類: 製品独自方針／これからの予定。
- 判定: 対象外
- 根拠: 今回指定された外部browser/OSの事実確認の範囲ではない。上限値は外部仕様の数値とは記されていない。
- 出典: 対象文書内の実装予定。外部資料との照合対象外。
- 直し方: —。

## 機械照合

claims.py extract後に対象を上記7件へ整理。pageで3原文を取得し、quoteで引用5本が原文に存在することを確認した。verify/lint結果を末尾へ記録する。

- verify: 引用5／一致5／NG0／未照合0。
- lint: 必須項目の抜け0。単一出典の注意はC5（Microsoft公式Shell資料のみ）。

## C6修正後の再点検（2026-10-28）

### C6r 取得・引渡し経路を別途設計し、Shell形式とnative hostは候補とする
- 場所: 本文15行目。C6に対応する変更箇所のみ再点検。
- 種類: 将来の設計方針。
- 判定: 対象外
- 根拠: 現行文はB側の特定・取得経路とA側への引渡しを今後設計するとし、特定のAPI/host構成を必須とは断定していない。C5で確認したShell経路を候補として挙げることと矛盾しない。C6の外部仕様に関する過剰な必然性の主張は削除された。native hostが必要になるかは今後の設計事項であり、確認済み機能とは扱わない。
- 出典: 修正後の対象文書15行目。既確認の候補経路は https://learn.microsoft.com/en-us/windows/win32/shell/clipboard に対応。
- 直し方: —。旧C6の言いすぎは解消。C4の実験機能・実OS未検証の留保は維持されている。

上の初回C6判定は経緯として保存する。現行本文についての7件の内訳は、確認できた4／食い違う0／言いすぎ0／確かめられない1／対象外2となる。
