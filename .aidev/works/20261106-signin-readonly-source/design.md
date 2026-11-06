# 期限を緩めないreadonlyソースの共有

ACL batchの現物結果でも、初期2.3秒→定期確認の負荷時に更新が5秒期限に届かない。
read-signin-enrollmentのAdd-TypeとDPAPI helperを各読取で起こすことが負荷の原因候補。
metadataのキャッシュや5秒期限の緩和はしない。

## 実装案

専用サービスのepoch内だけで固定PowerShell readonly workerを1つ共有する。SYSTEM、
Session0、private stdout pipeを要求し、検証済みimmutable packageのコードだけを使う。
起動時にVault C#とpolicyを1度読み込み、readyまでの準備（上限10秒）には接続を許可しない。
policy初期readの5秒時計はready後に開始する。

workerが受ける操作は3種だけ:

- enrollment: 固定ownerの既存enrollmentを毎回ACL/祖先/reparse/handle前後確認後にDPAPI復号。
- unprotect: 私有pipeの既存ciphertextを固定entropy/CurrentUser DPAPIで復号。protectはない。
- check-paths: runtime, desktop-endpoint, identity.json, required markerの固定4パスの範囲内だけ。
  各パスと祖先は毎回既存EndpointAclPolicyで新規検査する。任意ファイルreadは提供しない。

stdin/stdoutは上限付きJSON line。seqは単調一致、固定op、dataはBase64のみ。queue最大16、
1requestはqueue時間込み5秒、workerはready後120秒で終了、epoch終了/abortでstdin終了。
C# timerで120秒を上限にし、Systemのキー/ACL/登録/サービスを一切変更しない。
bytesは処理後zero。秘密・任意例外・pipe内容をログやRPCへ出さない。

Node readonly sourceはenrollment、unprotect protector、ACL callbackをStoreへ渡す。
writeAllowed=falseとprotect拒否を二重に保持。close時はqueueを拒否し、stdinを閉じる。
子終了待ちとkill後の確認まで所有し、終了不明は既存unsafeStop/Host Job cleanupへ閉じる。

Runtimeにはlocal-onlyのsource factoryを追加し、ready→5秒の初期読取→既存2秒poll→
source/presence/identity/endpointの全teardownを行う。既存のgenerated depsでは従来の
readonly callbacksを使えるようにし、新factory分岐を別途回帰検査する。

## 確認

- Node generated child: framing/上限/seq/未知op/timeout/queue/abort/EOF/kill/secret zero/非Windows。
- Store protector/ACLが同じsourceを使い、毎回新たなreadを行うこと。
- workerを通常tokenで実行して拒否すること。
- private SYSTEM fixture（停止b499、mutex、排他、runtime digest不変、Jobzero）で実測。
  privateRootへhash固定copyしたworker/Vault/policyを使い、生成presenceと非通信connectorを使う。
  外側12秒（できれば複数epoch）まで保つことを条件にし、早いendedを成功扱いしない。
- protected packageの既存read-signin-enrollment.ps1へ固定ReadonlySource分岐を統合。必須ファイル集合は維持する。全体build/typecheck/関連tests、独立レビュー。
- 元の鍵・viewer・enrollment・historyを保持する限定復旧で実機へ導入し、SCM段階とpreloginを確認。
