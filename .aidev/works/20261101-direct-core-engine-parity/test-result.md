# CORE直結でENGINEコンテナの操作群へ拡張

## 対象と設計

ユーザー要求: CORE直結でコンテナ同等へ拡張。以前の「テスト不要」を継続して扱い、テスト・音声生成・API機能プローブは行わない。

比較元の稼働中image voicevox/voicevox_engine:cpu-latest、GET /versionは0.25.2。読み取りで取得したOpenAPIの全操作群を対象とする。Docker/ENGINEプロセスは起動せず、公式CORE0.17.1 public Python blocking APIを呼ぶ。

worker.pyを起動入口にし、runtime.py（CORE）、api.py（HTTP）、validation.py（入力境界）、state.py（辞書/プリセット/設定）、waves.py（PCM/リサンプル/WORLD）、resources.py（公式素材と許諾）へ分割。比較元のOpenAPI JSONと元ライセンスを同梱。/openapi.json /docsと追加streaming_synthesisも公開。

対応操作: audio_query[_from_preset], accent_phrases, mora_data/length/pitch, synthesis/cancellable_synthesis/multi_synthesis, sing_frame_audio_query/f0/volume, frame_synthesis, connect_waves, validate_kana, initialize_speaker/is_initialized_speaker, supported_devices, morphable_targets/synthesis_morphing, presets/add/update/delete, speakers/speaker_info/singers/singer_info/resources, user_dict/word CRUD/import, version/core_versions/engine_manifest/setting/root。

辞書・プリセット・CORSはstateDir/voice-core-dataへatomic保存。COREフォルダ差替と独立。モデル同時保持2VVM、各声の公式モーフィング許諾ALL/SELF_ONLY/NOTHINGを確認、欠損時は許可しない。

## 導入・ビルド

- scripts/voice-core/install.pyは全VVM既定、engine_support.pyで公式resources 0.26.0、歌唱/Nemoモデル0.17.0、numpy2.2.6/pyworld0.3.5/soxr0.5.0.post1/kanalizer0.1.1/setuptools80.9.0を導入。コア本体と分離、規約・ライセンス維持。使わないpng_largeを除外、Nemo character_infoもmergeしNemo規約はnemo-noticesへ保存。
- 現環境で導入を実行、pyworld wheelをビルドして導入成功。`/tmp/soda-core-engine-support-install-final.log`。既存ユーザーのモデル利用規約同意を継続。
- 現CORE導入フォルダのduは2.2G（従来1.6Gから依存・歌唱・素材分増加）。
- Pythonはcompile(source, filename, 'exec')のみで構文ビルド。テスト目的のimport/モデル実行なし。
- protocol build / desktop build:host / server tsc -b成功。`/tmp/soda-core-parity-{protocol,host,server}-build.log`。
- 通常soda handoffで5pane維持。管理worker起動引数に--data-dirを確認。通常起動状況GET /healthでready:true、loadedModels0。生成/辞書編集等の機能テストではない。`/tmp/soda-core-parity-handoff.log`。

## 独立レビュー

/root/review_core_voice_floatがread-onlyで確認し、以下を修正して再レビュー完了、必須指摘なし。

- CORE SynthesisStreamにcloseがない→public __exit__で解放。
- pause_mora子音長も検証/120sec計算へ加算、query.validate+frame_length最終上限。
- Nativeの24k倍数制約→検証時は24kへ正規化、外向きrateは後処理でリサンプル。
- Note.idを保持して歌唱音符対応を保つ。
- native辞書surface全角化→NFKC比較で英語置換から保護。
- CORE専用ValueError派生を一般例外前で400応答。
- Nemo素材不足→通常素材と同じ索引へmerge。
- streamingヘッダ送信後は追加HTTPエラー応答を送らず接続終了。

レビュー側もテスト/モデル/APIプローブを実行していない。ユーザー指定によりnegative controlも実行しない。

## 差異と制限

操作機能の対応であり、元コンテナとバイナリ/発音/エラー細分類まで同一の保証ではない。CPU・稼働CORE1版。かなParseKanaBadRequestはUNKNOWN_TEXTに集約。英語前処理はENGINE固有形態素処理と異なる場合あり。旧talkモデルの切断中断は合成前後、streaming_talkは分割間。通常/歌唱/結合120sec、morph30sec、同時4要求、通常JSON2MiB/結合64MiB、辞書512語、preset256件。manage_libraryは比較元コンテナ同様なし。拡張後のモデル/API動作は未テスト。
