# アシスタントの音声入力

音声をモデルへ直接渡す経路と、手元で文字起こしして確認した文章を会話へ渡す経路を区別する。

`assistantAudioCapabilities(kind)` と読み取り専用 `assistant.audio_capabilities` は連携経路の有無を返す。モデル起動・CLI起動・音声エンジン読み込みは行わない。`nativeAudio` は現在のモデルや会話が送信可能という意味ではない。送信時には既存の専用会話ID、instance、待機状態、接続許可、期限を改めて検証する。`localTranscription` は文字起こし経路があるという意味で、Whisperの導入・準備完了は端末側で別に確認する。

| 種類 | 直接音声の連携 | 確認して文章を送る経路 |
| --- | --- | --- |
| Codex | 既存専用threadへのapp-server proxy。送信時の検証が必要 | ローカル文字起こし |
| Claude Code | 既存専用会話への直接送信は未実装・未検証 | ローカル文字起こし |
| Muse Code | MSP安定・実験schemaに音声入力なし。voice transcribeは別の文字起こし経路 | ローカル文字起こし |
| Antigravity CLI | upstreamは音声添付対応。操舵室から既存会話への添付経路は調査中 | ローカル文字起こし |
| GitHub Copilot CLI | SDKの汎用file/blob添付だけでは音声入力対応を保証できず、既存専用会話への直接送信は未実装・未検証 | ローカル文字起こし |

対応しない直接経路を、モデル提供元が一律に音声非対応という意味で扱わない。

音声ファイルの既存保護（接続所有者・専用会話への固定、容量と並行数、TTL、取消、送信結果不明時の自動再送禁止、一時ファイルの保持と削除）は変更しない。Codexでは別threadの作成や再開を行わない。

## 確認した一次資料

- [Antigravity CLI changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md): 音声添付対応と形式修正。
- [Antigravity CLI mentions](https://antigravity.google/docs/at-mentions/): 手入力のパスと候補から選択したパスは挙動が異なる。
- [Muse Code SDK](https://meta-models.github.io/muse-code-sdk/): 導入済みMuse 1.4.14-R7309.1のschema generate-json-schemaで安定版・experimental版を確認。
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages): メッセージの入力型。
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md): 添付型と画像の対応範囲。

2026-11-07時点。CLI側の対応と操舵室の検証済み連携を分けて記録する。
