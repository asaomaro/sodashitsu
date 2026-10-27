# 次段階: 受信済みファイルを手元へドラッグ

MicrosoftEdgeのDownloadURL-list explainerとChromium drag_download_file.ccを参考に、検証済み受信Blobをbrowser内に明示的に一時保持し、Chrome/Edge向けDownloadURL dragstartを提供する。これはファイル転送一覧からの取り出しであり、接続先Explorerの画面内アイコンから直接OSへdragするものではない。実OSdropは未検証の実験機能と表示する。

- default offの明示checkbox。file/ZIP/保存再開経路のSHA確認後にのみ保持、未完了/失敗/取消のbyteやremote URL/credentialは載せない。
- window内8件/合計100MiB、最後の操作から5分。有限URL/サイズaccounting、期限/許可取消/切断/optout/unmountでrevoke。完了した通常downloadを損なわず、保持不可なら理由と通常受信への継続。
- private blobURLのみ。filenameからcontrol/colon/sep除去、DownloadURLはapplication/octet-stream又はZIP MIME+portable filename+blob URL。絶対パス/HTTP endpoint/認証tokenを転送しない。user gestureのdragstartだけ、copyのみ。
- browser不対応/OSdrop失敗時は通常のdownloadを案内。受信済みbyteの明示再保存ボタンも提供。ブラウザのdownloadへ渡した/OS側に実保存した、を区別。
- 純粋境界/clock/URLrevoke/一度入替失敗/active grant、realbrowserで実転送bytes/hash、合成dragstartDataTransfer/通常再保存bytes、実OS操作しない。nativeOS実機dropは利用者確認が残る。

参照: https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/DownloadURL-list/explainer.md
https://raw.githubusercontent.com/chromium/chromium/main/content/browser/download/drag_download_file.cc
https://learn.microsoft.com/en-us/windows/win32/shell/clipboard

将来のExplorer画面内→手元直接dragは、B側でファイルを特定・取得する経路とA側への引渡し方法を別途設計する。Shell IDataObject/FILEDESCRIPTOR/FILECONTENTSやnative drag hostはその候補とし、必須の方式とは断定しない。この差分だけでtask13全完了とはしない。

独立設計点検のmust対応: SHA digest/Blob.arrayBufferなどのawait前に保持policyのopaque epoch ticketを取得し、保持直前に同一instance/ticket＋enabled/optin/deadを再検査する。取消/optout/unmount/clearでticketを更新し、再許可後も古いticketを拒否する。URL生成後にも再検査し、失効していれば即revokeしてmapへ入れない。dragstart/再保存直前もactive/期限/現在entryを検査する。held SHA→revoke→再許可→完了解放で保持0/URL0、URL生成中の失効でも即revokeの回帰を追加する。
