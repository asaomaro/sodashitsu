# 統合方針

作業開始点f38a9b72は取得時のorigin/mainと一致。detached HEADの変更をfeat/desktop-assistant-core-toolsへ収容する。最終独立レビュー、ビルド、型検査、全体テスト、起動確認、関連E2Eの結果を記録してからコミットし、mainへfast-forwardする。

COREのPython SDKを保持し、常駐CLIで呼び出す。Windows DirectMLはWSLからWindows Python経由のIPCに限定する。専用フォームはassistant rendererで対象askを固定し、通常の操舵室導線と分ける。
