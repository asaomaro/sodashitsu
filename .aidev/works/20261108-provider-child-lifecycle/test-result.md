# Muse2修正・種類別監査 checkpoint

Base638cb4d3。Runtime eb1d44ac（最後の正式durable子session bindingをprivate保持）→04b4050b（Muse正常emptyEOFで既存子補足処理を継続）。他providerのfold動作と共通fresh/kind/instance/ref/安全open/CHUNK/上限は変更しない。

- 2旧source負例: NativeSubagentRecordsだけ638へ戻すと新terminal/resume実observer回帰が1fail。NativeSubagentReaderだけ638へ戻すと新EOF再poll回帰が1fail。各rawはnegative-muse-binding.log/negative-muse-eof.log。
- finallyで2source byteExact復元、SHAはrestoration.json。固定runtimeと一致。
- 最終8suites192tests PASS、positive-final.log。Native Records/Reader/Service、Muse実observer、Grok Records/Reader、AGY、ClaudeTracker。Codex先行interrupt修正/両Copilotfamily/foreign/未所有/unknown/namespaceも既存回帰に含む。
- Node24.22.2 PATH、8GiB検査heap、strict/exactOptionalPropertyTypes/noUncheckedIndexedAccess/NodeNextで2production source＋変更testの型exit0。typecheck-receipt.jsonに実コマンド/HEAD/exitを保存、raw typecheck-final.log。
- 全repo test/buildや実model/Windowsは実行しない。生成した一時recordとmodel-free query注入を使い、実CLIでresume成功/同session固定/再binding通知発火を確認したとは主張しない。

回帰は実Reader＋実MuseChildObservationsを使用。terminalでcount0/private current getter拒否、resume contextだけでも0、正式runningでのみ関係復帰。新birth前の旧runモデルは不採用、新しい正式子model eventの後だけモデル復帰。spawnは旧bindingを消去、foreign boundは採用せず、明示boundで復帰、不明layoutでclear、instance差替え/forget後は旧関係を使わない。EOF補足はMuse・bytes0・offset===sizeの場合だけで、fd/path revisionとcurrentの既存再検証を通る。

独立backend固定source読取では追加must/should無し、最終ログ/SHA照合へ提出。Claude immediate-resumeの順序proofは別未完taskとしてaudit.md/tasks.mdへ保持し、このMusecheckpointでは完了扱いしない。
