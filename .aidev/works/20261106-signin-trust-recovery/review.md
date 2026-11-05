# 独立点検

`/root/review_resource_monitor` による別コンテキスト点検。

- 元trustの操作形式をflatと誤認した箇所を指摘。製品通りkind/peerに修正し、生成fixtureも製品Operation codecを経由。
- setup生成時の改行欠落を指摘。生成元で修正し、両PowerShell wrapperのParseFile成功を確認。
- 再点検で追加mustなし。固定snapshotと各hash、runtime/history保全、新SCM、unknown outcomeとmarker最後を確認。
- Windows生成fixture通過、SYSTEM Session0 ValidateOnly通過、private task ACL(readback exact SY/BA)、preflight task除去、bind成功。

現物recovery/enroll/通常接続の結果は別途記録する。

## 読取周期の修正

DesktopSigninRuntime.tsと回帰テストの独立点検も追加mustなし。5秒期限を読取開始前に固定し、旧lease失効後に復活しないこと、並列readを終了時に回収することを確認。現物接続成立は別検証。

関連5file/103test成功、旧コードでは新規3case失敗をraw logに保存。広範な全体テストは前回の既知失敗を再実行せず、変更したruntimeと接続/起動/identity/endpointに絞って検証した。
