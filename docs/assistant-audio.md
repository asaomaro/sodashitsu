# アシスタントの音声入力

音声をモデルへ直接渡す経路と、手元で文字起こしして確認した文章を会話へ渡す経路を区別する。

`assistantAudioCapabilities(kind)` と読み取り専用 `assistant.audio_capabilities` は連携経路の有無を返す。モデル起動・CLI起動・音声エンジン読み込みは行わない。`nativeAudio` は現在のモデルや会話が送信可能という意味ではない。送信時には既存の専用会話ID、instance、待機状態、接続許可、期限を改めて検証する。`localTranscription` は文字起こし経路があるという意味で、Whisperの導入・準備完了は端末側で別に確認する。

| 種類 | 直接音声の連携 | 確認して文章を送る経路 |
| --- | --- | --- |
| Codex | 既存専用threadへの正式Unix WebSocket。現transportはLinuxのみ。送信時の検証が必要 | ローカル文字起こし |
| Claude Code | 既存専用会話への直接送信は未実装・未検証 | ローカル文字起こし |
| Muse Code | MSP安定・実験schemaに音声入力なし。voice transcribeは別の文字起こし経路 | ローカル文字起こし |
| Antigravity CLI | upstreamは音声添付対応。導入済み1.4.12のPTYへWAV/MP3を貼っても添付にならず、既存会話への直接経路は未検証 | ローカル文字起こし |
| GitHub Copilot CLI | SDKの汎用file/blob添付だけでは音声入力対応を保証できず、既存専用会話への直接送信は未実装・未検証 | ローカル文字起こし |

対応しない直接経路を、モデル提供元が一律に音声非対応という意味で扱わない。

音声ファイルの既存保護（接続所有者・専用会話への固定、容量と並行数、TTL、取消、送信結果不明時の自動再送禁止、一時ファイルの保持と削除）は変更しない。Codexでは別threadの作成や再開を行わない。

## Codexの正式transport

導入CLI/daemonのcontrol socketはHTTP UpgradeによるUnix WebSocketです。JSONLを単純にproxyへ流す経路を廃止し、状態取得と所有socket/PID世代確認を共通化しました。read-onlyの状態取得・モデル一覧とは別のtyped/runtime allowlistで、音声だけ`turn/start`を1回許可します。既存loaded thread・idle・会話ID・canonical作業先・instance/許可/期限/取消を送信直前に再検証します。モデル・effortは変更せず、応答喪失・失敗・終了不明を自動再送しません。

同時接続は状態取得等と共通で最大2、同じ用途/会話の重複を防ぎます。接続作成直後から実socketのcloseまで所有枠を保持し、handoffのsuspendも終了不明のsocketを見落としません。音声ファイルの保存/保持/削除は従来の仕組みです。Windows等の正式transportは未実装で明示エラーにし、共通文字起こし経路を案内します。

生成の偽サーバーとの実Unix WebSocketでlocalAudio入力のframeとACK、ACK喪失時1回だけの送信、世代変更時の非送信を確認しています。利用者の会話への実音声モデル送信を行ったという検証ではありません。

## 確認した一次資料

- [Codex App Server](https://learn.chatgpt.com/docs/app-server#protocol): Unix WebSocket framingとloaded/thread metadata API。
- [Antigravity CLI changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md): 音声添付対応と形式修正。
- [Antigravity CLI mentions](https://antigravity.google/docs/at-mentions/): 手入力のパスと候補から選択したパスは挙動が異なる。
- [Muse Code SDK](https://meta-models.github.io/muse-code-sdk/): 導入済みMuse 1.4.14-R7309.1のschema generate-json-schemaで安定版・experimental版を確認。
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages): メッセージの入力型。
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md): 添付型と画像の対応範囲。

2026-11-07時点。CLI側の対応と操舵室の検証済み連携を分けて記録する。

## Antigravityで確認した添付の境界

1.4.12を既存の利用者paneと別の隔離HOME・新規fixtureフォルダで起動し、無音WAV（Python wave生成、16kHz/mono/16bit/1秒）と生成MP3を調べた。モデルへの送信や利用者会話の再開は行っていない。PNGは同じbracketed pasteで `media attached` と `image/png` が表示される。WAV/MP3は本文にパスが残り、音声の添付表示は出ない。WAVの `@path` と引用付きパスでも同様だった。

この確認は音声モデルへ送信した実証ではない。CLI全体のnative音声機能が存在しないとも断定しない。必要な未確認契約は、既存の専用TUI/instanceへ音声MIMEの添付を作成する入力形式と、その受理確認である。文字として届いたパスをnative音声入力の成功に置き換えない。固定待ち時間後のEnterだけではこの契約を満たさないため、自動送信アダプターは有効にしていない。

[添付段階の検証記録](../.aidev/works/20261107-agent-audio-backend/verification.md)に、開始時の認証表示を除いた入力後の端末出力を保存した。
