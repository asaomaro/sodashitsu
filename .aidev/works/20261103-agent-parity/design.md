# 設計と分割

対象は導入済み5種: claude/codex/muse/agy/copilot。段階ごとに機能・境界を小さくレビューして最後に全体を確認する。Museの既存差分はcore（起動・フック・状態・再開）と専用会話へ分割する。

共通化の方針:

1. エージェント能力とCLIの引数・設定元を共通の表へまとめる。バージョン差や存在しないフラグを無条件に渡さない。
2. 会話の読み取りを種類別の既知ファイル・schemaから共通メッセージへ変換し、ページ/履歴/要約/作業文脈/ToDo/監督が同じアダプタを利用する。任意パスや最新会話の推測はしない。
3. 利用状況の生記録を共通の数値イベントへ変換する。主/サブ・ツール・比較・集計DBは共通化し、記録のない値や単位の違いを保持する。
4. デスクトップの専用起動/モデル/effort・分析/要約の隔離実行と作業起動も、同じ能力表に基づく。ツール/権限を意図せず緩めない。
5. 監督・トリガ・承認代理は既存の種類非依存のグラフ経路を点検し、5種の組合せで検証する。

確認済み環境:
- Muse Code 1.4.14-R7309.1: Linux。SessionStartの環境が剥離されるため近い同UIDのMuse祖先から経路2項目だけを回収。実echoでPID一致・会話・再開を確認。
- Antigravity CLI 1.4.12: --model/--effort/--print/--settingsがある。
- PATH上の旧Copilot CLIは0.0.362。利用者の「更新してOK」を受け、Linux版1.0.105をnpm公式パッケージから導入。フック/SDK/effortを現行版で扱う。
- Agyの実1.4.12の短い生成/own fixture readで保存形式を照合。PLANNER_RESPONSE/DONEのトップレベル数値・tool_calls。bubblewrapでhomeを一時領域へマウントして設定を隔離し、元のHOME変数や設定を書き換えない。
- MuseのMSPはインストール済みバイナリからschemaをoffline export。initialize/initialized後のsession/readはwriter attach・SessionResumedを発生させず、ツール投影を取得可能。session/forkも生成したecho会話で成功。

未着手の制限を並べた初期Muse文書は、追加要件に合わせて各段階の完了時に更新する。

共通対象はデスクトップ・通知/応答・監督・会話/履歴・利用量/比較/ツール分析・レポート・サーバの通常作業起動。ネイティブAPIや操作先権限のある固有機能（音声API、画像、fork、remote work制限）はdocs/agent-parity.mdで明示。存在しないAPIや検証不能な権限境界を「同等」と称して流用しない。
