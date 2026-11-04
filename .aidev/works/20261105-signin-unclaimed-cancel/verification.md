# 期限切れ・未claimの初期化要求を保存して取り消す限定復旧（実機適用待ち）

## 対象と設計

実機は旧package `2fee9af791dde7547e4f554f5a355f530f75294eb878d53641064ca56f9f6d67`、停止中。元admin.pendingのSHAは `b9559c70b4cc0eacc0c6a8941a626614dcfb7868006e2b688c38ec200ee03085`、intent.pendingは `0165b97993dfda3dde25672f48f4413ddd67ee9377ac600b2f1e0d78ba2d7528`。初回のnative起動は.NET ServiceBaseの名前制限で失敗し、claim/ACKに進んでいない。実snapshotと失敗receiptは前作業 `20261105-signin-native-dispatch/` にある。

公開操作はadmin/固定owner/package/mutex/厳格SCM構成・停止/排他barrierを必要とする。初回slotのexact inventoryと空runtime、元2ファイルのhash/実identity、DPAPIの閉schema initializeだけ、両期限の経過とnonce/package/barrierの結び付きを照合する。install.transitionを先に耐久保存し、元runs/adminを非置換で全byte保存、archiveのidentity/hashを再照合する。新しいrun generationのinitialと空adminを作成し、永久取消receiptを保存して全証拠を再検査した後にだけmarkerを除去する。

これはclean process stopの証明ではなく、claim前の期限切れ要求の明示的な取消。元要求の再生/削除・鍵/trustの生成や消去・サービス起動/設定変更を行わない。既存controller/Hostの許可や通常admissionの期限条件は変更しない。中断時はmarker/元・移動済みの記録を保持して既存起動を拒否する。

## 検査状態

- 初回生成検査はdir renameで拒否。次の診断でWin32 error5を確認（first/renameチェックの生ログ）。Windowsでは子fileをshare Read|Deleteで保持しても親directoryのrenameが拒否されるため、既存Upgradeと同様に元byte/Snapshot・private parent・marker・排他barrierを保持し、rename直前にfile handleだけを閉じ、archiveを開き直して同一file ID/hashを検査する形へ変更した。
- この修正の正例・8負例・byte復元後正例・各中断位置・既存Upgrade.Coreへの引継ぎは成功。生ログは `windows-cancellation-checks.json`。
- さらにarchive handleを開き直して処理終了まで再保持する `Evidence.RebindArchive` を追加した。独立再レビューは必須指摘なし。
- **再保持版は再接続後のログ付き再検査に成功した（2026-11-04T22:21:06Z、source SHA 9fc8b43cd3edbccabd8730f3b2b413ade162390fadd352ab4cd9e8111217eb47）。正例・8負例・byte復元後正例・中断位置・Upgrade引継ぎの生ログは windows-cancellation-retained-final.json、完了receiptは windows-cancellation-final-receipt.json。実配置への取消・更新・再初期化は未実施。**
- 正常な実機再接続後、残っている検査プロセスを先に確認し、完了ログの有無を確認してから必要な検査だけを再実行する。検査sourceは一時コピーで変異し、元staging sourceを変更しない。

## 配布物の準備

Native SCM修正45932270のowner埋込みEXEを含む新packageを生成し、install -ValidateOnlyが成功した。実配置は更新していない。

- 新manifest SHA: `ec399280816050b7527689769bec8f879bae0441940265e954bd70da8ecc83fa`
- revision: `4057f1fd-3666-4b4e-a067-6baecb4da2c9`
- native SHA: `7599eba71ee297f145d6264c1483ed34233e3ce1d9337e0c3d5d85f674b26092`
- sr-pcのowner profile下 `sodashitsu/signin-native-package-20261105`

## 次の運用準備（未実行）

`/tmp/soda-signin-repair-connect-admin.ps1` は、既存controller sourceのSHA、maintenance全22 sourceのSHA（LF正規化でlocalと照合し、Windows上の生バイトaggregateも固定）、RSA暗号化済み登録情報とDPAPI鍵のSHA、登録先を照合する。復号と配布物のValidateOnlyを先に行い、限定取消→通常Upgrade→新manifestでinitialize/trust/enrollの各prepare/自然終了/result/ack→normal startの順。途中失敗や結果不明は停止し、child PID/開始時刻・各receiptを保持する。ログアウト/再起動は行わない。

**sourceと運用wrapperの独立レビューは必須指摘なし。UAC承認前に実運用しない。** ブラウザの実fingerprintと暗号化済みenrollmentは会話/ローカルprivate tempへ保持し、この文書やgitへtoken/鍵/個人のfingerprintを記録しない。PC再起動/実サインアウトの時期は未承認。マイクdriver導入も未完了。
