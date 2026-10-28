# 7B2f 常駐host

固定ownerでcompileするServiceBase hostを追加する。SCM引数/任意実行入口は持たず、SYSTEM primary・64bit・既存package verifierを通った配置だけを起動する。通常serverや旧unlock serviceは変更しない。

Nodeは絶対application/固定bootstrapとowner SIDだけをargvへ渡す。環境はOS由来SystemRoot/windir/System32 PATHと固定owner state/runtime TEMP/TMPのみ。親のNODE_OPTIONS/NODE_PATH/秘密/プロキシ/ユーザー環境を継承しない。runtimeは事前に管理者が用意したSYS/BAだけのACLを読み取り検査し、祖先とともに保持する。作成/修復しない。

CreateProcessWのSTARTUPINFOEXは三つのNUL標準handleだけを継承し、匿名kill-on-close Jobをcreation属性で原子的に割り当てる。主threadはsuspended、hostの有効性を再検査してからresumeする。childのstdout/stderrを外部へ出さない。Jobはbreakaway不可。異常終了/停止/host guard失効はJob全体を終了し、active processが0になるまでpackage/runtime handleを解放しない。回収失敗はhostをfail-fastし、OSによるjob closeまでleaseを保持する。自動再起動や権限の自動付与はしない。

SCM登録/installer/enrollment controller、専用Node main、Winlogon worker/epoch/UIは後続。実サービス・画面・入力・鍵をこの作業で操作しない。生成ordinary-account子/孫だけでWindows native経路を検査する。

根拠: [CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)、[process creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)、[handle list](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)、[Job objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[Job accounting](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information)。
