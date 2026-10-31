# 最終開発監査（2026-11-01）

## Desktop assistant / 配布更新

AssistantLaunchController/ManagedAssistant/AssistantBundledLaunch と設定・試験、docs/desktop-assistant.mdを再点検。sodaに管理起動を統合済み。既定無効で、無効時は専用GUI/音声device/agentを新規起動しない。共通GUI runtimeは有効化時に検証/準備し、各音声・画像処理は明示した操作時だけ使用する。独立実行ファイルの手動導入は不要だが、GUI runtimeの取得・OS要件と署名driver/専用serviceの管理者導入は別である。

設定済みClaude/Codex model/effortは専用agent起動へ渡す。画像理解/OCRは専用agent、任意音声はCodex app-server対応モデルへ明示送信できる。Claudeの任意音声file送信は公開CLI経路がないため提供せず、専用端末の公式音声機能と区別。Tesseract/Whisperは任意の明示ローカル構成で、自動導入や別AIへの暗黙送信はしない。

scripts/package.mjs/runtime-assets.mjsは閉じたSDK資材一覧を使用する。追加した通常ユーザー音声roleも共通host/SDKに含む。権限・file hash/cache/no-linkと無効時非起動は既存自動試験の対象であり、実GUI/OSdevice/driverの確認は代用しない。追加の別exe導入手順や未使用常駐processを導入する不足は見つからなかった。

## 暗号化プラグイン

docs/remote-desktop.mdとplugin-cli、ExtensionDesktopAgents/試験、DesktopAgentRecipient/Endpointの受信者・epoch・停止境界を再点検。通常host APIのgrantを暗号化grantとして扱う変更は行わない。プラグインは既存sodactl desktop session/mcp/model --endpoint-fingerprintで受信者固定経路を利用でき、CLIと鍵・寿命はそのプラグインが管理する。通常APIが受信者固定ticketを消費しない回帰を維持する。

## 機能範囲の区別

今回のOS機構対応はLinux Portal VIRTUAL/approved sources、macOS public CG display modes、Windows owned virtual driverである。nativeの全monitor合成/同時独立sourceや公開OS APIで提供できない汎用virtual/physical modeを実装済みとは記録しない。docs/remote-desktop-status.mdに現状を明記した。今回の開発台帳と将来の機能追加、実機確認を混同しない。

最終統合・配布・実接続・cleanupの結果はintegration記録に追記する。
