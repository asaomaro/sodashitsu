# Grok 共通アシスタント対応 (1)

## 根拠と範囲

手元 CLI `grok 1.0.77 (50ca579fa996) [stable]` の `--help`/`agent --help`/`models --help` を読み取り確認。起動引数 `--model` / `--reasoning-effort` / `--resume`、ACP stdio、モデル一覧経路がある。モデル turn / 設定変更はしていない。

公式 https://github.com/xai-org/grok-build の main 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8 の `crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md` は canonical effort none/minimal/low/medium/high/xhigh/max と、モデルごとの advertised menu が制約になることを記す。installed build50ca と公開commit一致は確認できないので、公式mainの機能を導入版の実証と混同しない。

## 契約と所有

protocol desktopAssistant kinds/labels/profiles/launchArgs と AssistantConversationKind に grok を追加する。保存済み旧5kind設定は既定空Grokを補い保持。effort unionは引数検証の上限だけで、各モデルのメニュー候補ではない。候補取得に失敗したら既定/保存済みだけを使い、全effortを対応モデルと偽らない。Grokのnative音声送信は未証明なので許可せず、共通Whisper文字起こし→編集下書きで提供。launch希望値はstatusline実測へ渡さない。

後続でこの担当はserver agent/assistantModels.ts、desktop UI/設定保存と共通音声経路、必要なWeb/TUI設定UIを所有。担当(2)はserver会話/summary/send/ExtraAgentRecords、担当(3)はusage/effort/permission/subagents実観測。protocol先行commitを両者へ共有し、公開型の追加だけで後続の実装完了と主張しない。

## 検証

既存5kind後方互換、Grok保存roundtrip/旧設定default/起動argv/無効effort、Grok音声能力false+localTranscription true、会話型accept。後続UIで生成fixture実DOMとdraft-only/no autosend、モデル切替effort絞込み、設定保存を検査。実アカウント/利用者pane/音声マイク/Windowsは対象外。
