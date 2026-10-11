# prefix 番号表示と複数エージェントの fork

通常は番号を出さず、prefix 中だけ Web は重ねて、TUI は番号:で表示する。tabs=数字、panes=f→数字、workspaces=u→数字、agents=d→数字。既存の prefix 定義と設定可能なカタログに組み込む。対象順は表示順と一致させ、仮想ペインを除外する。

forkはpaneが報告したUUIDと検出kindが一致するclaude/codex/copilotだけ。Claudeの既存手順を維持、Codexはfork ID --cd cwd。Copilotは公式SDKと同じheadless stdio JSONRPCでsessions.fork→新IDの検算→新IDだけのsession.resume workingDirectory→ペインでresume。元会話のresumeへフォールバックしない。通信上限1MiB・30秒・サーバ停止でabort。Copilotの自動更新やツール許可は与えない。

TUI paneメニューにfork/usageを追加。forkダイアログで同じ場所/worktree、ブランチ、最初の知らせを指定。tabメニューの新規項目は両版から削除。Windowsネイティブの既存POSIX起動制限は維持。

公式参照: https://developers.openai.com/codex/cli/reference 、https://docs.github.com/en/copilot/how-tos/copilot-sdk/troubleshooting/compatibility 、github/copilot-sdk の nodejs/src/client.ts と generated/rpc.ts（2026-10-11確認）。
