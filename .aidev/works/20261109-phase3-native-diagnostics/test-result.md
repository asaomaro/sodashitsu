# Verification

Source runtimebed5639b。作者Windows/native/実server/model0。Node24で実helper/actualstopVM/actualrunnerdiagnosticsegmentを検証。

- 初回fixture全test:85PASS/1moduleFAIL。唯一の失敗はisolatedtreeにtypescript無し（microphone-lane.test.mjs）。関連clock100silence+300tone校正はPASS。raw related.txt。
- 既存PHASE3_TEST_TYPESCRIPT_MODULEをmain-liveのreadonly既存moduleへ明示し、失敗したlane5cases＋最終observer9casesを対象実行:14PASS。raw targeted.txt。全体再実行やinstall無し。
- shadow1: collect closedgate除去→live accessorを読んでしまいFAIL。shadow2: unknown diagnosticをissuesへ流入→actualrunnersegment回帰FAIL。durable2runtimebytesを完全復元→observer9PASS。raw negative-close.txt/negative-issues.txt/restored.txt、restoration.json。
- A21private reader:14PASS/saturatedを許すfaultはFAIL→remote完全復元14PASS。reader別prefixmanifestに記録。
- 認可/期限/レート/PCM/合否式に変更なし。C#/serverproductはbackend所有別gateであり当branchではbuild不要。

先行独立readreview:元call透過、上限、unknown、2秒内、元判定非流入に追加指摘なし。最終固定SHA照合を別に記録する。
