# 検証記録

## 対応内容

複合initializeで既存identityを保存した後、5秒のstep期限が切れた場合、結果記録を作れずclaim済み・観測済みの状態になる経路を生成テストで再現した。各段階30秒・全体60秒とし、単調時計で失効を固定する。実機で最初に起きた停止の原因がこの経路だったとまでは断定しない。native個別保存5秒・teardown8秒・要求期限は維持する。

既存鍵が1件だけ保存されている既知の履歴に限定した明示復旧を追加した。鍵を復号できるSYSTEM primary tokenの読取専用proofを先に必要とし、秘密鍵の署名と保存公開鍵の一致を確認する。暗号文と全runtimeのSHA、全履歴、SCMのcritical実体、排他barrierを固定し、再起動を挟んで同じ鍵を確認する。元要求は結果不明のまま退避し、正常停止と偽装しない。

## 自動検証

- 旧実装に戻した回帰テストは期待したassertionで失敗した。生出力: `negative-control.txt`。実装は元の修正版の生バイトへ復元した。
- 関連8ファイル154テスト成功（単体25件を含む）。全体typecheck/build成功。生出力: `typecheck.txt`, `build.txt`, `server-build.txt`。
- Windowsの凍結ZIP sourceで、Node WebCrypto PKCS8→DPAPI→native公開鍵一致、保存cipher無変更、曲線/DER/反転公開点/秘密鍵差異の拒否、既知履歴の結び付き、proof期限/SCM差異、退避と5箇所の中断保持を検査。5種のsource否定と完全復元成功。生出力: `windows-generated-first.json`。
- PowerShellの省略したstring引数が空文字になる実機境界を追加修正。inspect/bindのnull/emptyのみ受容、recoverは64hex必須、空白や不要ticketは拒否する。最終6否定検査も成功。生出力: `windows-generated-final.json`。

## 実機の確認と残る検証

sr-pcの既存サービスは停止中で、claim済みinitializeと843byteの暗号化identityを保持している。新しいSYSTEM読取専用taskが成功し、既存identityのDPAPI復号・PKCS8形式・公開/秘密鍵の署名一致を確認した。taskの完了と削除を確認し、runtime/admin/runsは変更していない。最初の管理者inspectはPowerShell省略引数の変換で入口で拒否された。修正後は新しいproofと同一親操作でnative inspectが成功し、mutates=false、元のrunId、公開指紋とruntime SHAを確認した。生出力: `windows-readonly-inspection.json`。

再起動前に、保守用のSession0通常ユーザーサーバーを別state/portで用意した。保護されたguardでAdmin=false、Medium IL、UIAccess=0、SeChangeNotifyPrivilegeだけの実tokenを検証し、通常ユーザーrunnerとserver両方がSession0であることを確認した。認証RPC接続、task再実行で二重起動しないこと、固有停止要求によるserver/runner/portの終了を確認した。再度起動して待機中。実OS再起動後の再接続は未検証。

現時点で新しいbind/recover、追加OS再起動、修正版package更新、再initialize/trust/enroll、実サインインと通知の再確認はまだ行っていない。これらを完了したとは扱わない。

## 独立レビュー

`/root/review_resource_monitor` が実装と別コンテキストで最終差分・期限処理・DERと署名照合・PowerShell省略値・実機記録・6否定の整合性を確認。必須指摘なし。実機のbind/recover以降は別の未完了検証として扱う。
