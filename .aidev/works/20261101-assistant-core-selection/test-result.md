# 音声生成元3択と内蔵CORE接続先自動取得

ユーザー要求: PC音声／Sodashitsu管理CORE／外部VOICEVOXを分け、内蔵COREではURL入力を不要にする。併せて今回の機能差・軽さ・CORE直結での機能拡張可否を説明。以前の「テスト不要」指定を継続し、テストは実行しない。

## 変更

- voiceProviderへcoreを追加。system/voicevoxの従来値は維持。voicevoxは外部接続として保持、新規外部URL既定50021。
- 設定画面で内蔵CORE時にURL欄を非表示、外部VOICEVOX時だけ表示。PC音声では話者選択欄も隠す。非表示の外部URL編集値は保存せず保存済み有効値を維持。
- 認証済みRPC assistant.voice_core（空params）はVoiceHost.endpointを通じenabledとloopback originだけ返す。Python実行ファイル・モジュール・ランタイムのパスは返さない。
- desktop native mainが話者取得／発話ごとに操舵室から内蔵CORE起動設定を取得。serverOriginのloopback制限、RPC／操舵室接続先の取得後再確認。voicevoxSpeakはasync設定取得の前後でAbortSignalを確認。
- 外部VOICEVOXは従来のこのPCのHTTP接続先を使用。内蔵COREの未導入／無効時は説明エラー（自動OSフォールバックの追加は今回行わない）。
- docs/voice-core.mdとdesktop-assistant.mdの選択手順を更新。CORE自体のUserDict／アクセント・モーラ調整／streaming／歌唱処理APIをローカル公式Python宣言でも確認し、未公開機能との区別を記載。

## 反映と点検

テスト・音声生成・UIプローブ・smokeは実行していない。反映に必要なビルドのみ:

- protocol build成功 `/tmp/soda-voice-mode-protocol-build.log`
- desktop-assistant build:host成功 `/tmp/soda-voice-mode-host-finalbuild.log`
- server tsc -b成功 `/tmp/soda-voice-mode-server-build.log`

独立レビュー /root/review_core_voice_float:スキーマ、RPC登録／型／許可メソッド、接続先制限と再確認、3択表示、既存設定保持、キャンセルをread-only確認し必須指摘なし。非表示URLの保存処理追加も再レビューで必須指摘なし。レビュー側もテストを実行しない。

assistant disable→phase disabled確認→soda handoffで5pane維持→既存ユーザー設定がvoicevoxかつ管理COREと同じ接続先の場合だけcoreへ切替→assistant enable。きりたん、スタイル108、上下動true、その他設定は保持。バックアップ /tmp/soda-assistant-before-core-mode.json（0600）。`/tmp/soda-voice-mode-handoff.log`。

## 機能差・性能について

現在のワーカーはENGINE全API互換ではない。トーク／話者／音声パラメータ／字幕同期用AudioQueryに対応。UserDict、歌唱、アクセント編集等はCORE API直結で追加可能だが、UI・プリセット保存はアプリ側の実装が必要。歌唱モデルは既定導入に含めていない。

今回のターンでは性能テストは行わず、既存プロセスの読み取りだけを実施。CORE RSS382184KiB（約373MiB）、既存コンテナdocker stats572.4MiB。ただし読込モデル・集計方法が異なるため比較ベンチマークや省メモリ率とは扱わない。Docker／ENGINE周辺起動を省ける一方、同CPU・モデルで合成速度向上を保証しない。既存コンテナはもともと常駐しており、各動画に毎回起動費用が掛かっていたわけではない。
