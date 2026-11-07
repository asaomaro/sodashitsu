# 単発の生成音検証

- `BrowserMicrophone.mjs`は今回の手元Chrome→sr-pc用。物理micを使わず、Chromiumのfake-device/fake-file flagsを固定する。既知の認証済みブラウザsessionを使い、cookieを表示/保存しない。
- 入力fixtureは997Hz、48kHz、16bit、mono、20秒の生成WAVを`/tmp/soda-generated-997.wav`へ新規に用意する。実録音は使わない。試験後は生成fixtureを削除する。
- 起動後のreadyを確認してstdinへ`start`を1回送る。`SODA_TEST_MICROPHONE_DURATION_MS`は6000/10000/15000のみ。`SODA_TEST_MICROPHONE_PCM=1`は圧縮器なしの切り分け用。
- 実際のUIのDOM、ブラウザ自身の送受信frame、圧縮器の呼出し回数だけを記録する。PCM/Opusの内容やデスクトップ画像は保存しない。設定の一時変更と復元、仮想captureの開始/終了は外側の単発runnerが管理する。
- `GeneratedCodecTimestamps.mjs`は生成AudioDataだけを使う独立したChromium codec測定。物理音声deviceやデスクトップへ入力せず、入出力timestamp/durationのずれだけを出す。

どちらも今回の環境を固定した検証補助で、製品の常駐処理や一般利用者向けCLIではない。
