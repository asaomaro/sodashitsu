# research.md の事実確認

対象: research.md。2026-10-17、深さ「ざっと」。本調査の担当者による原文再照合であり、別コンテキストによる独立検証は最終レビューで行う。fact-check スキルの独立確認要件は、この記録だけでは完了としない。

## ローカル実測 A: 導入済み agy は native CLI v1.4.0
- 場所: 実体と安全な起動
- 種類: 実測
- 判定: 対象外（Web 原文照合の対象外。ローカル実測の再確認）
- 根拠: このセッションの readlink/file/--version の実行結果。ELF native executable とバージョン 1.4.0。公開資料だけで導入済み実体の同一性は検証できない。
- 出典: ローカル `/home/asaomaro/.local/bin/agy`（当日実測）
- 直し方: —

### C2 session_id は conversation_id の互換 alias
- 場所: 公式の statusLine 経路
- 種類: schema
- 判定: 確認できた
- 根拠: 「Backward-compatibility alias for conversation_id.」。claims.py quote で OK。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/cli/statusline/
- 直し方: —

### C3 statusLine にモデル・token・context・quota・承認待ちが載る
- 場所: 公式の statusLine 経路の表
- 種類: schema
- 判定: 確認できた
- 根拠: 「Contains token usage details:」。同ページの Available JSON fields と JSON payload example のキーを表と再照合した。各キーは公開schemaに存在する。実 CLI での payload 受信の実証とは区別している。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/cli/statusline/
- 直し方: —

### C4 cost と effort は公開statusLine schemaに記載がない
- 場所: 公式の statusLine 経路
- 種類: 記載範囲
- 判定: 確認できた
- 根拠: 「Available JSON fields」。同ページの Available JSON fields・JSON payload example に両項目がないことを再確認。CLI が内部で取得できないと断言していない。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/cli/statusline/
- 直し方: —

### C5 hook input は camelCase
- 場所: hooks と session 追跡
- 種類: schema
- 判定: 確認できた
- 根拠: 「Field names use camelCase.」。claims.py quote で OK。conversationId 等も Input fields と再照合。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/hooks
- 直し方: —

### C6 settings 内の完全な hooks nesting は未確定
- 場所: hooks と session 追跡
- 種類: 検証限界
- 判定: 確かめられない
- 根拠: 公開ページに hooks.json の例はあるが settings.json への完全な埋込例がない。ローカル実受信も行っていない。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/hooks
- 直し方: 未確定と記録済み。integration の導入形式は別の実 CLI 検証が必要。

### C7 公開CLI reference は /fork を列挙する
- 場所: 公開機能と制約
- 種類: 機能
- 判定: 確認できた
- 根拠: 「Clone the current conversation thread into a new parallel session.」。claims.py quote で OK。起動フラグや pane fork の実証とは区別。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/cli/reference/
- 直し方: —

### C8 v1.4.0 は OSC 7501 を案内する
- 場所: 公開機能と制約
- 種類: version
- 判定: 確認できた
- 根拠: 「OSC 7501 terminal status reporting」。claims.py quote で OK、同項目見出しが v1.4.0。別の出どころでは未確認。
- 出典: https://antigravity.google/docs/changelog?tab=cli
- 直し方: —

### C9 macOS/Linux の既定インストール先
- 場所: 公開機能と制約
- 種類: path
- 判定: 確認できた
- 根拠: 「~/.local/bin/agy」。claims.py quote で OK。元の /docs/cli/install/ はリダイレクトの本文だけを返すため、原文を直接確認できた Getting started に出典を変更した。ローカル実体とも一致。
- 出典: https://antigravity.google/docs/getting-started?tab=cli
- 直し方: 出典URLの差替え済み。

## ローカル実測 B: 信頼ダイアログの文言とプロセス名
- 場所: 追加観測
- 種類: 実測
- 判定: 対象外（Web 原文照合の対象外。ローカル実測の再確認）
- 根拠: PTY 起動時の画面からパス・メールを除去して固定文言だけ採取。/proc の comm と exe basename は agy。ProcessMatcher 本体の実行結果と誤認しないよう本文で明記した。
- 出典: 当日のローカル無入力PTY起動
- 直し方: —

公開主張は確認できた 7 件、確かめられない 1 件。別途ローカル実測 2 件。公開機能の実機実証は別途必要。公開schemaの主張は主に単一の公式資料による。
