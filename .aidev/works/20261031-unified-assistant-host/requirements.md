# 要求

ユーザーの依頼: 統合可能な機能ごとの独立実行ファイルをsodaへ取り込み、別途手動導入せず設定から有効化できること。有効化前は実装を読み込まず、不要なprocess/instanceを生成しない。起動管理と別ZIP installer追加だけでは未達。旧コード互換の維持は不要。

アシスタントの専用Sodashitsu Assistant.exe/個別ZIP導入を廃止し、sodaに含めるGUI resourcesと共通GUI runtimeの内部roleとして起動する。GUI用のprocess自体は必要だが、機能固有exeと独立installerを利用者へ要求しない。共通runtime素材は配布に含めるか、ON時だけ公式固定版から検証して準備する。OFFでCLI help/status/通常serverはdownload/GUI load/起動しない。

Web/TUIの設定からON/OFFでき、準備中OFF/停止でも未承認の起動をしない。OS権限・外部仮想driverのようなOS要件は分離する。実GUI/WSL実機検証以外を生成試験とhosted buildで完了させる。

## この最初の差分

依存なしのGUI資源bundle、soda配布への収録、固定runtime catalogの準備に限定する。専用exe/ZIPの廃止、runtime準備、内部role、設定ONは次段階であり、この差分をもって統合完了とはしない。
