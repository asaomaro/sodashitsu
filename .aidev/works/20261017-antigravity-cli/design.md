# 設計

既存 herdr kind `agy` と起動表を維持する。製品固有 manifest を追加して版差を補う。公式 SessionStart の conversationId を共通 hook report に変換し、既存の pid/前面プロセス照合を通して agentSession を保持する。再開は `agy --conversation <id>`。

利用情報は独立した Antigravity statusline wrapper → ローカル report socket → pid/session 検証 → UsageAdapter → UsageService/UsageFeed → 既存 Web/TUI/標準statusline を通す。アカウント枠は公式 quota の値のみ。Claude の statusline と設定/状態を分離する。旧サーバが返さない設定項目は表示しない。

実装単位: (1) 検出・session・能力、(2) statusline収集と設定、(3) UI経路とBob/Copilot監査、(4) 全体検証と独立レビュー。数十ファイルに跨るため単位を分けて検証する。
