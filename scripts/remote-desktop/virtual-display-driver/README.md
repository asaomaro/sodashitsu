# Sodashitsu virtual display driver foundation

Windows 11 x64向けの一時的な仮想画面用IDD基盤です。Microsoft sampleからの派生箇所とライセンスはSOURCE.md / LICENSEを参照してください。Node・共有helper・保護brokerは専用HWIDとleaseで接続します。署名済みpackageの導入と実captureの検証は別です。

ビルドにはVisual Studio 2026のC++/WDKビルド部品とMicrosoft署名付きNuGet.exeが必要です。`build.ps1 -NuGetPath <absolute path>` は固定バージョンのWDK/SDKを取得し、unsigned DLL/INF/catalogを生成します。driver導入・service変更・証明書store変更・testsigning有効化は行いません。GitHubのVirtual display driver workflowでも同じcompile-only検査を行います。

`python3 validate-modes.py` は実callbackを偽IDD型で実行してbuffer境界を検査します。`../validate-virtual-display.ps1` はfake owner/device/clockとnative ABIを検査し、native device作成や表示変更はしません。

生成artifactは実機へ導入するproduction packageではありません。通常のWindows署名要件を満たす署名済みpackageの配布、明示的な管理者導入、およびheadless実機でのcapture確認が必要です。これらが済むまで一般利用可能とは扱いません。

署名申請素材は`prepare-signing.py`で、WDK出力のINF/DLL/CATと対応PDBから新しいフォルダーへ準備します。生成DDFから`makecab /F submission.ddf`を実行できます。CIも`virtual-display-unsigned-submission`を出力しますが、提出/署名/導入は行いません。返却された署名済みpackageは`prepare-release.ps1`で署名・catalog membershipを確認し、通常installerが使うmanifestと署名者fingerprintを生成します。

必要条件・コマンド・現状と復元手順は[署名と配布](../../../docs/virtual-display-driver-signing.md)を参照してください。
