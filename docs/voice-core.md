# 共用音声合成（VOICEVOX CORE）

Sodashitsuは、VOICEVOX COREの常駐ワーカーをサーバと別プロセスで管理します。アシスタントの吹き出しを閉じても生成を続けられます。CLIとアシスタントはHTTPを立てず同じ常駐COREを使えます。HTTP専用の動画ツール向けには従来のHTTPモードも選べます。既存のVOICEVOX ENGINEコンテナも選べます。

## 導入

Python 3.10以降とpipが必要です。公式バイナリが対応するOS・CPUで利用します。今回実機確認した構成はLinux x64、Python 3.12、CORE 0.17.1、VOICEVOX ONNX Runtime 1.23.2、モデル0.17.0（CPU）です。Windows x64、Python 3.13、Radeon 890MでDirectMLのGPU合成とCPU切り替えも確認しています。macOSは実機未検証です。

```sh
python3 scripts/voice-core/install.py --output "$HOME/.local/share/sodashitsu/voice-core/0.17.1"
```

公式リリースからCORE Python wheel、ONNX Runtime、辞書、トーク用VVMを取得します。公式ダウンローダーの利用規約確認に同意して進めてください。規約とクレジットは取得したruntime/models、runtime/onnxruntime内に残します。生成音声の利用条件は各話者の条件にも従います。既定ではトーク・歌唱・NemoのVVM、公式の話者素材、モーフィング等の追加Python依存も導入します。必要なモデルだけ取得する場合は`--models-pattern 0.vvm`等を指定できますが、歌唱モデルを除外すると歌唱は利用できません。ENGINEと同じ英語・形態素処理のため公式forkのpyopenjtalkを固定コミットからビルドします。GitとC/C++ビルド環境が必要です。pyworldのwheelがない環境でもビルド環境を使います。

```sh
soda voice enable --transport ipc --acceleration-mode AUTO --python /usr/bin/python3 \
  --python-path "$HOME/.local/share/sodashitsu/voice-core/0.17.1/python" \
  --runtime-dir "$HOME/.local/share/sodashitsu/voice-core/0.17.1/runtime"
soda voice status
```

`--state-dir DIR`で操舵室と同じ状態ディレクトリを選びます。設定は`voice-core.json`（ユーザー用、実行ファイルの絶対パスを含む）です。実行中の対応版sodaサーバが2秒ごとに設定変更を検出して起動・停止します。無効化は`soda voice disable`。サーバ終了とhandoffでは所有するワーカーの終了を待ちます。初期化失敗は最大60秒の間隔で再試行します。

単独検証用には`soda voice serve --state-dir DIR`も使えます。IPCモードでは同じstate-dirの所有プロセスへ接続するため、サーバとの二重起動でCOREを重複起動しません。代理として接続したプロセスの終了では所有側のCOREを止めません。

新規設定の既定は`ipc`です。Linux/macOSはstate-dirのUnixソケット、Windowsは名前付きパイプを使い、CORE用TCPポートを開きません。旧設定は互換性のためHTTPを維持します。`soda voice enable --transport http`でHTTPモードを選ぶ場合、受付は`http://127.0.0.1:50022`、`--port`で変更可能です。CPUスレッド数は`--threads 2`（1〜16）です。CORE・Open JTalk辞書は起動時に初期化し、話者モデルは最初の要求時にロードします。同時に保持するVVMは2個までで、超えると古いものを解放します。コンテナ起動は不要ですが、辞書・モデルの読み込みと推論の費用は残ります。

## HTTPなしのCLIと常駐

```sh
# Sodaサーバが動いていない場合のみ、別端末で常駐を起動
soda voice serve
soda voice versions
soda voice speakers
soda voice synthesize --speaker 8 --text 'こんにちは。' --output hello.wav
soda voice query --speaker 8 --text 'こんにちは。' --output query.json
soda voice call --input request.json
```

`call`の入力例は`{"operation":"supported_devices"}`。`--input -`と`--text-file -`はUTF-8の標準入力を読みます。バイナリ出力は`--output FILE`または`--output -`を指定します。CLIは非公開IPCへ認証鍵を付けて接続し、アシスタントも同じ処理を利用します。Unixのソケットと鍵は所有者限定です。IPCの画像URLはHTTPの代わりにdata URI、WAVは全体を受け取ります。

複数COREは`add-core --core-version 0.17.0 --python /path/to/python --python-path /path/to/0.17.0/python --runtime-dir /path/to/runtime --acceleration-mode CPU`で登録し、合成時に`--core-version 0.17.0`で選びます。Pythonパッケージは版ごとに分離してください。互換性があるモデル・辞書は共有できます。各COREは最初の要求で起動し、その後保持します。`versions`の`gpu`は初期化後の実際のGPU利用、`accelerationMode`は指定した方針です。未起動は`gpu:null`です。

## GPUとWindows DirectML

`--acceleration-mode CPU`はCPU固定、`GPU`はGPU必須、`AUTO`はCOREの自動選択です。CPU版ランタイムを導入しただけではGPUは使えません。NVIDIA向けは`install.py --device cuda`、WindowsのDirectX 12対応Radeon/Intel/NVIDIA向けは`--device directml`で専用のONNX Runtimeと追加DLLを導入します。DirectMLはWindowsネイティブPythonで動き、Linuxのコンテナ／PythonにDirectMLを読み込ませる構成ではありません。

```powershell
python scripts/voice-core/install.py --device directml --output C:/Sodashitsu/voice/0.17.1-dml
soda voice enable --transport ipc --acceleration-mode AUTO --python C:/Python313/python.exe --python-path C:/Sodashitsu/voice/0.17.1-dml/python --runtime-dir C:/Sodashitsu/voice/0.17.1-dml/runtime
```

Windowsのsodaではデータは既定でWindowsのstate-dir内に保存します。WSLからWindows Pythonを起動する構成はIPCモード専用です。`--transport http`への変更はCLIで拒否します。HTTP連携が必要な場合は同じOSのPythonを使うか、Windows側でSodaを動かしてください。WSLでSodaを動かす場合も、`--python /mnt/c/.../python.exe`、`--python-path /mnt/c/.../python`、`--runtime-dir /mnt/c/.../runtime`を指定できます。加えて`--data-dir /mnt/c/Users/USER/AppData/Local/Sodashitsu-Voice/data`等のWindowsローカル保存先を指定してください。WSLのUNC保存先ではWindowsのファイルロックを利用できないため拒否します。既存の辞書・プリセット・設定を移行する場合は、CORE停止中に`voice-core-data`内の保存JSONをそのフォルダへコピーしてください。同じ設定へのWindows/Linux COREの混在は、保存先のロック方式が異なるため拒否します。起動時にWindowsのパスへ変換し、Python依存とDLL検索パスをWindows側で設定します。COREの親と推論子はstdioでつながり、親の入力が閉じると推論子も終了します。SodaのIPCはWSL側にあり、Windows側にもCOREのHTTPサーバは起動しません。アシスタントの画面描画に対するGPU設定と、音声推論のGPU設定は独立しています。

GPUは機種・ドライバー・モデルによってCPUより遅い場合もあります。`GPU`を指定して合成と`versions`の`gpu:true`を確認し、同じ台詞のウォーム状態でCPUと比較してください。CPUへの切り戻しは`--acceleration-mode CPU`です。

## アシスタントと動画から利用

アシスタントの設定「船長のボイス」でオンにし、生成元を「内蔵CORE（Sodashitsuが管理）」にします。接続先は認証済みの操舵室から自動取得するため、URL入力は不要です。IPCモードでは既存の認証済みSoda接続から常駐CLIと共通のCOREを呼び出します。設定「COREバージョン」で登録済みの版を選択できます。発話ごとにCLIやCOREを再起動しません。「話者一覧を更新」から声を選び、保存してください。既定では立ち絵の人物に声を合わせます。声を手動で選ぶと自動切替をオフにし、その選択を優先します。「PCの音声」も引き続き選べます。既存コンテナを使う場合は「外部VOICEVOX」にし、このPCの接続先URL（通常`http://127.0.0.1:50021`）を指定します。従来のVOICEVOX設定値は外部VOICEVOXとして維持し、勝手に接続先を変更しません。WAVは生成元から取得してアシスタントのPCで再生します（Windows SoundPlayer、macOS afplay、Linuxはaplayが必要）。内蔵COREの自動取得は操舵室自体も同じPCのloopbackから接続している場合に利用できます。別PCのCOREへの直接接続は対応していません。IPCモードではWindowsアシスタントとWSLの間も既存のSoda接続を使うため、CORE用のlocalhost転送は不要です。

HTTP専用のyukkuri-workツールには`--transport http`を選び、既存の接続先指定を使えます。このモードのCOREは既定の1バージョンです。

```sh
python3 skills/video/yukkuri-kaisetsu/kaisetsu.py script.txt \
  --voicevox --voicevox-url http://127.0.0.1:50022
```

motion-videoのbuild.pyも同じ`--voicevox-url`を受け取ります。既存コンテナへ戻す場合は`http://127.0.0.1:50021`を指定します。既存コンテナはこの機能によって停止・削除されません。

音声と字幕時刻に使うAudioQueryは同じ接続先から取得します。現在のコンテナVOICEVOX ENGINE 0.25.2にある操作を、ENGINEやDockerを起動せずCOREの公開Python APIへ直接つないでいます。

| 機能 | API |
|---|---|
| 読み上げ・プリセットからのクエリ | audio_query / audio_query_from_preset |
| アクセント・モーラの長さや高さ | accent_phrases / mora_data / mora_length / mora_pitch |
| 通常・切断時中断・複数生成 | synthesis / cancellable_synthesis / multi_synthesis |
| ストリーミング（追加） | streaming_synthesis |
| 歌唱クエリ・音高・音量・WAV | sing_frame_audio_query / sing_frame_f0 / sing_frame_volume / frame_synthesis |
| WAV結合・かな検証 | connect_waves / validate_kana |
| モデル初期化とデバイス | initialize_speaker / is_initialized_speaker / supported_devices |
| モーフィング | morphable_targets / synthesis_morphing |
| プリセット保存・変更・削除 | presets / add_preset / update_preset / delete_preset |
| 話者・歌手と画像・試聴・規約 | speakers / speaker_info / singers / singer_info / resources |
| ユーザー辞書CRUDと取込 | user_dict / user_dict_word / import_user_dict |
| 設定・対応機能・版情報 | setting / engine_manifest / version / core_versions |

`/openapi.json`で操作の定義、`/docs`で操作一覧、`/setting`でローカルのCORS設定を確認できます。初期設定はlocalappsで、このPCのlocalhost Originを許可します。追加Originやallへの変更は設定の保存で明示します。不正なHostと許可外Originを拒否し、受付自体はloopback限定です。ネイティブのローカルプログラムは認証なしで使えます。各話者のモーフィング許諾（ALL / SELF_ONLY / NOTHING）を公式素材から読み取り、禁止ペアを拒否します。素材未導入の人物のモーフィングは許可しません。

辞書・プリセット・CORS設定は、`--data-dir`指定先（省略時は操舵室state-dirの`voice-core-data`）に原子的に保存します。CORE・VVMの差し替えで失われません。単独でworker.pyを動かす場合は`--data-dir`を明示できます（省略時はruntimeの親のuser-data）。

既存の簡易CORE導入環境を拡張する場合は次を実行します。

```sh
python3 scripts/voice-core/engine_support.py \
  --runtime-dir "$HOME/.local/share/sodashitsu/voice-core/0.17.1/runtime" \
  --python-path "$HOME/.local/share/sodashitsu/voice-core/0.17.1/python"
```

利用中の導入場所に合わせてパスを置き換え、その後`soda voice disable`→`soda voice enable`でワーカーを再起動してください。公式の話者素材はVOICEVOX/voicevox_resource 0.26.0から取得し、規約・ライセンス・試聴素材を保持します。通常APIで使わない高解像度png_largeは省きます。Nemoの素材も取り込みます。原則としてモデル更新と同様、新フォルダに全構成を用意して切り替える方が切り戻しやすくなります。

比較対象は、既存のCPU版VOICEVOX ENGINE 0.25.2です。通常・歌唱・モーフィング・辞書・プリセット・かな検証・WAV結合など65項目を、隔離したコンテナと直結ワーカーへ同じ条件で要求して確認しました。英語はENGINE 0.25.2のNJD処理・標準辞書を利用し、未知語の英語読み、かなのエラー分類も合わせています。取り込んだ公式ソース・変更点・ライセンスはワーカーの`engine_frontend/SOURCE.json`、`API-NOTICE.txt`等に含めます。

以前の2000文字・120秒・モーフィング30秒・辞書512語・プリセット256件・JSON容量の独自上限は取り除きました。値の型・有限性・音素の整合性とCOREが受け付けるフレーム数等は検証します。出力サンプリング周波数を後処理で変換し、192kHzや浮動小数・多チャンネルWAVの結合も扱います。同時要求の受付は40件で、同じSynthesizerへの処理は直列化します。

古いtalkモデルの`cancellable_synthesis`は専用の推論子プロセスを使います。監視プロセスを推論から分離し、HTTP切断・所有ワーカー終了時に推論も止めます。通常の合成ではこれらの追加プロセスを起動しません。`streaming_talk`モデルはCOREの分割合成を使います。`streaming_synthesis`は追加APIで、24k/48kHzのstreaming_talkモデルが対象です。

互換性は機能・入出力の契約が対象です。比較元はCORE 0.16.0、内蔵側は0.17.1とモデルの版が異なるため、音声波形の完全一致は保証しません。IPCモードでは複数バージョンのCOREを独立プロセスで同時に保持し、CPU/GPU/AUTOを版ごとに選択できます。0.17.0と0.17.1の同時利用を確認しています。古いSDKすべてとの互換性を保証するものではありません。歌唱には教師・歌唱用VVMが必要です。アプリ／モデル素材のインストール機能（manage_library）は比較元コンテナ同様に提供しません。Windows DirectMLは実機確認済み、macOSは未検証です。

## COREの更新と切り戻し

CORE・ONNX Runtime・モデル・辞書・Pythonモジュールをアプリのビルドから分離しています。新しいフォルダを用意し、上のインストーラーの`--version`・`--onnxruntime-version`・`--models-version`で公式バージョンを指定します。既存フォルダは上書きしません。

導入後に同じ`soda voice enable`で新しい`--python-path`と`--runtime-dir`を指定すれば、旧ワーカーの終了を待って新構成を起動します。アシスタントと動画側の接続先は変わりません。失敗した場合は旧フォルダを同じコマンドで選び直せます。API互換の更新ではSodashitsu本体の再ビルドは不要です。COREのPython APIやモデル形式に破壊的変更がある更新では、`packages/server/assets/voice-core/worker.py`の接続処理も更新・再検証する必要があります。`/version`で実際のCOREバージョンを確認できます。

更新後は`/health`、`/speakers`、実際のクエリ取得とWAV生成を確認してから旧フォルダを整理してください。yukkuri-workの既存WAVキャッシュは自動破棄されません。モデル更新後に同じ台詞を新モデルで生成したい場合は別の音声出力フォルダを使ってください。

## ENGINEコンテナとの差と重さ

上記の操作群をCORE直結で公開し、DockerとVOICEVOX ENGINEのプロセスは起動しません。プリセットや設定保存、音声の後処理・モーフィングはこのアダプター側にあります。ONNX Runtime・辞書・音声モデルのロードと推論は必要です。同じモデル・CPUでも合成速度の向上は保証しません。追加機能に必要なPython依存・歌唱モデル・話者素材の分、簡易構成よりディスク容量は増えます。今回、コンテナとの同条件性能テストは行っていません。
