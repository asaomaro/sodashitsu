# 共用CORE音声と待機中の上下動

## 要件と構成

- SodashitsuがCOREを別プロセスで管理し、desktop assistantとyukkuri-workが共用。既存ENGINEも選択可能。
- CORE・ONNX・辞書・VVMは外部ランタイムフォルダ。公式ダウンロード用スクリプトは別フォルダに新構成を作り、soda voice enableでPythonモジュール／ランタイムの選択を切替。互換更新で本体再ビルド不要。破壊的Python API変更はworkerアダプター修正が必要。
- ユーザーは2026-11-01の会話で公式ダウンローダーの音声モデル／ONNX Runtime規約に明示同意。公式ダウンローダー0.17.1で取得、利用規約同梱維持。CORE 0.17.1、VOICEVOX ONNX Runtime 1.23.2、モデル0.17.0、Open JTalk1.11.1。非公開ユーザー用パス `/home/asaomaro/.local/share/sodashitsu/voice-core/`、素材・ランタイムはgitに含めない。
- 作業場所 `/workspaces/sodashitsu-main-live-assistant-agents`。以前の全dirty変更を維持。yukkuri-workのコードは変更せず、既存Voicevoxクライアントと接続先オプションで検証。
- 待機上下動は既定オフ、独立設定idleFloating。現在ユーザーのきりたんにはオン。OS/appのモーション軽減で停止、足元基準最大8DIP、周期約8.8秒。

## 検証

- desktop-assistant: 28 files / 208 tests passed。`/tmp/soda-voice-final-native.log`
- server VoiceHost + cliArgs: 2 files / 39 tests passed。`/tmp/soda-voice-server-tests.log`。親EOF追加後のHost2テスト再実行もpass `/tmp/soda-voice-host-finaltests.log`。
- Python API変換・pause_mora roundtrip・入力制限・loopback Host/Origin制約:2 tests passed `/tmp/soda-core-python-finaltests.log`。
- protocol build、desktop/server typecheck、host build、server tsc -b pass。
- 生成済みUIをChromium1223で検証。声一覧→選択→数値ID保存、idleFloating保存、実描画のm42変化、オフでm42=0、枠内、各モーション軽減、既存UI全体pass。`/tmp/soda-voice-float-ui.log`
- 通常smokeは既定Chromium1243で `.xterm-helper-textarea` 15sec timeout。既知のChromium環境問題を避けるため、テストコードを変更せず起動ラッパーで1223を指定。同じsmokeがDOM・タブ・入力・PTY roundtripまでPASS。`/tmp/soda-voice-smoke-compatible.log`
- 実CORE、yukkuri-work既存の `skills/video/motion-video/voice.py` をimportして5人のVoicevox.query→synthを実行。`/tmp/soda-core-live-verify.log`。
  - きりたん108:2.36sec生成、WAV4.25sec
  - つむぎ8:1.87sec、WAV4.19sec
  - めたん2:1.31sec、WAV4.18sec
  - ずん子107:1.51sec、WAV4.67sec
  - ずんだもん3:1.58sec、WAV4.82sec
  - 各AudioQuery accent_phrases8、字幕用モーラ長を保持。health loadedModels2。
  - これはCORE実動確認で、旧コンテナとの厳密な性能比較ではない。
- Windows native SoundPlayerでCOREのきりたんWAV263724bytesを再生し終了成功。`/tmp/soda-core-native-play.log`。物理的な聴音はしていない。
- Windows ElectronのNode fetchからWSL CORE /healthへ到達。`C:/Users/makku/AppData/Local/Temp/soda-core-network-result.json`にready:trueを保存。WSL interop/stdoutの終了待ちは不安定で検証用subprocessラッパーはtimeoutしたため、プローブ自身がWindows側に記録したHTTP応答を根拠とする。
- 実Windows Electron透明・非focus立ち絵を無操作で観測。floatMin=-7.896、floatMax=-0.133DIP、枠内、idle pose chin/think→speaking→通知raise/surprised。`/tmp/soda-float-native.log`、`C:/Users/makku/AppData/Local/Temp/soda-float-native.json`、thinking PNGを目視（素材本来の立ち絵）。GPU cache/子GPU異常終了ログはあるがDOM/capture成功、プローブexit0。
- 親stdin EOF:待機時exit0まで0.003sec、短文の合成要求中0.917sec。`/tmp/soda-core-managed-eof-short.log`。CORE blocking APIがGILを保持する長文合成中にはEOF監視threadの実行が遅れ、320文字程度の追加プローブは20secでラッパーtimeoutし子を回収した。通常stop/handoffはOS終了signal＋3sec後強制終了でこのGIL待ちを避ける。EOFによる退出が常時即時とは保証しない。

## 独立レビューとnegative control

`/root/review_core_voice_float` が新規差分全体を独立確認。設定切替中stopがchild=nullにした後にclose/suspendが来ると終了待ちを抜ける不具合を指摘。stopping Promiseを共有して全停止経路から待ち、syncもpaused/closedを再確認する修正を実施。再レビューで必須指摘なし。親stdin EOF追加も別途確認、必須指摘なし。

回帰テストは設定v1起動→v2切替で旧child停止開始→closeを重ねる→closeが未完了→旧child closeで完了、新spawnなし、を検出。修正stopだけを旧実装へ戻して同じテストがFAILを確認 `/tmp/soda-voicehost-negative.log`。固定ファイルをbyte一致復元、SHA256 `c8622d50de483d5ac7bb07b2526c9743ce5574f5b42f886d3d5b364bc79049b7`（この時点のfix、後のmanaged引数追加前）。現行2テスト再実行pass。

## 反映

通常soda handoffで5pane維持のまま更新。アシスタントdisableで旧GUI退出確認後、ユーザー用assistant.jsonをbackupして更新しenable。現在の立ち絵 `plugin:yukkuri-work/kiritan` を維持、voiceProvider=voicevox、origin localhost50022、style108、voiceEnabled/idleFloating=true、followSystemMotion=falseとreducedMotion=falseは維持。phase running。

残る範囲:macOS/Linux音声再生とmacOS/Windows用導入スクリプト分岐は未実機確認。ENGINEの全API互換、別PCの直接CORE接続、モデル更新時の既存yukkuri WAVキャッシュ自動破棄は対象外。既存コンテナはユーザー選択肢として稼働を維持。

最終反映確認: host SHA256 `363379a8331890887f4572e4696376239585aaaa46174e87a51d5e0dbba19ae7`、Windows導入済みmain.mjsとビルド結果のbyte一致を確認。実管理設定をthreads3→2へ切替し各1.62秒／1.82秒で新workerのhealth readyへ復帰、threads2を維持。`/tmp/soda-core-reload-check.log`。最後にCORE health ready、アシスタントphase runningを確認。
