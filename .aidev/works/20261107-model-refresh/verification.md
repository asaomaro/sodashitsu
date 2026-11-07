# 候補の強制更新と取得元

optional refresh/source/fetchedAt/cached契約004c3989を使う。未指定APIは既存5分cache、forceは完了cache迂回/進行query共用。sourceはCLI/local-cache/reference/unavailable、fetchedAtは照会日時でremote一覧更新日時ではない。

Web設定は常時mountなのでactive propをSettingsDialogから渡し、開く/種類変更でforce。desktopは新「モデル候補を再取得」・再表示/再接続で古いpromiseを失効。Webepoch/machine/kindとmaincontrol/origin/connectionepochで旧scope結果を拒否。oldhost invalid_paramsのみkind-onlyを1回試し、強制更新未対応表示、認証/通信失敗は再試行しない。rendererから任意CLI/引数/pathを受けない。

server11/desktop74/Web12/SettingsDialog147関連テスト成功。desktop/Web型確認0。実ブラウザでforce要求/再取得クリック/取得元/照会日時/選択保存/reloadを確認。製品7fileだけ旧版に戻したnegativeはmodel/desktop/Web/browser全失敗、exactrestoreして全成功(raw logs/restore.json)。全体test/build重複なし。

Grok review追記: installed同梱 `.grok/docs/user-guide/14-headless-mode.md:38` がcanonical none/minimal/low/medium/high/xhigh/maxとモデルメニューの部分集合制約を定義。同梱15-agent-mode.md:70は--no-leaderが共有leaderでなくlocal agentを強制する正式指定。従ってprotocol7tierはCLIaccepted上限、実モデル4tierだけの候補と混同しない。実probeで追加一時socketを使ったがproductionの--no-leaderも同じlocal実行契約。

このcommit時点はClaude/Copilot/Codex adapter統合前。Grok/Cursor候補は実CLI検証済、各新adapterを次の専用統合treeで配線する。会話provider(2)未統合server型4件は後段合同CI対象。
