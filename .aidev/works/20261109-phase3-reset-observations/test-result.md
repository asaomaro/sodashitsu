# Checks

Source fixed commit4d770842 (base8c4). Node24 production modules不変更、server/Web build/type rerun対象なし。fixture JSのみ構文と実生成テストを検証。

- node --test reset-metrics.test.mjs continuity-aggregate.test.mjs pure-checks.test.mjs: 17 PASS / 8.74s（100silent+300tone worker校正含む）。raw: related.txt。
- detector.mjsだけ旧8c4へ差替え、新actualJS4cases全FAIL。durable recovery bytes復元、cmp相当byteexact/SHA確認後4PASS。raw: negative.txt/restored.txt、restoration.json。
- C# Main回帰は実Phase3Detectorに直接Accept/ObserveCaptureFlags、JSON10scalar/phase-vs-zero/bound8を検査する。作者Linuxにcsc/mcs/dotnet無しのためC#compile実行0・Windows0。Root fresh A8/3・BC12/7 compile＋generated-checks実行を別gateとして残す。
- Native.cs/transport/queue/閾値/既存判定不変更。

Prior pure audit: pure-audit-results.json / source pins。pure-audit-runner.mjsはGit8c4 sourceを読み実JSmetrics/Detector/generatedFrameで再現（PCMはmemoryのみ）。C#Drainは対応モデルであり実COM/capture実行の主張ではない。

独立先行source review must/should無し、最終object/SHA/復元照合待ち。
