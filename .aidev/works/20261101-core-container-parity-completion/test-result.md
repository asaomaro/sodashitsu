# 検証

ビルド・型検査を通過。隔離したプロセス・state-dirで実行。既存コンテナは変更しない。

## soda-parity-all-final2.log

```text
PASS /version
PASS /core_versions
PASS /supported_devices
PASS /engine_manifest
PASS /speakers
PASS /singers
PASS /presets
PASS /user_dict
PASS /openapi.json
PASS /setting
PASS kana error contract テ'スト
PASS kana error contract 'ア
PASS kana error contract ア
PASS kana error contract ア''
PASS kana error contract ア'/
PASS kana error contract ヘンナabc
PASS kana error contract ア'？ア
PASS /audio_query
PASS /audio_query
PASS /audio_query
PASS /accent_phrases
PASS /mora_data
PASS /mora_length
PASS /mora_pitch
PASS /connect_waves
PASS /initialize_speaker
PASS /is_initialized_speaker
PASS /morphable_targets
PASS /synthesis_morphing
PASS /speakers
PASS /speaker_info
PASS /singers
PASS /sing_frame_audio_query
PASS total 65

```

## soda-core-unit-final.log

```text
......
----------------------------------------------------------------------
Ran 6 tests in 0.053s

OK

```

## soda-core-negative-controls.log

```text
E
======================================================================
ERROR: test_song_query_accepts_native_negative_volume (__main__.CompatibilityTests.test_song_query_accepts_native_negative_volume)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-main-live-assistant-agents/scripts/voice-core/test_worker.py", line 15, in test_song_query_accepts_native_negative_volume
    self.assertEqual(encode(frame_query(query))['volume'],query['volume'])
                            ^^^^^^^^^^^^^^^^^^
  File "/workspaces/sodashitsu-main-live-assistant-agents/packages/server/assets/voice-core/validation.py", line 143, in frame_query
    for v in volume:number(v,0,4)
                    ^^^^^^^^^^^^^
  File "/workspaces/sodashitsu-main-live-assistant-agents/packages/server/assets/voice-core/validation.py", line 44, in number
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high: raise ValueError("number out of range")
                                                                                                                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: number out of range

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (errors=1)
F
======================================================================
FAIL: test_frontend_releases_mapped_dictionary_before_cleanup (__main__.CompatibilityTests.test_frontend_releases_mapped_dictionary_before_cleanup)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-main-live-assistant-agents/scripts/voice-core/test_worker.py", line 44, in test_frontend_releases_mapped_dictionary_before_cleanup
    Frontend.discard(holder)
  File "/workspaces/sodashitsu-main-live-assistant-agents/packages/server/assets/voice-core/frontend.py", line 48, in discard
    if temp:temp.cleanup()
            ^^^^^^^^^^^^^^
  File "/workspaces/sodashitsu-main-live-assistant-agents/scripts/voice-core/test_worker.py", line 42, in cleanup
    def cleanup(self):self_cleaned=bool(released);assert self_cleaned,'dictionary still mapped'
                                                         ^^^^^^^^^^^^
AssertionError: dictionary still mapped

----------------------------------------------------------------------
Ran 1 test in 0.043s

FAILED (failures=1)

```

## soda-cancel-lease-check2.log

```text
PASS cancellation lease EOF stops supervisor + inference in 0.008 s
PASS owning worker death stops supervisor + inference
PASS successful legacy cancellable synthesis yields WAV 25644 bytes

```

## 実機反映

2026-11-01: サーバhandoffで実PTY5件を保持、snapshotの7 pane IDを照合。アシスタントphase=running。既存characterId=plugin:yukkuri-work/kiritan、idleFloating=true、voiceProvider=coreを維持。Windowsアプリ4プロセスの報告を実サーバで確認。元voicevoxコンテナは稼働継続。隔離比較コンテナ/ワーカーは停止済み。

辞書metadataのnegative control（修正のみ戻して失敗・byte一致復元）はresource-monitor側test-result.md内soda-final-negative.logにも原文を記録。

## 起動確認

```text
smoke: starting server on 127.0.0.1:44941 (state dir /tmp/soda-smoke-n9oDLs)
{"ts":"2026-11-01T11:29:51.266Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-01T11:29:51.267Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-01T11:29:51.267Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-01T11:29:51.271Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-smoke-n9oDLs/commands.json","count":1}
smoke: agent manifests ok (23/23)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane aa3fefb9-56df-47ba-b87f-f5eebdfce17b)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-11-01T11:29:52.102Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"b1f58a20-af8d-4a59-aa17-6aa79d1bba5e","paneId":"aa3fefb9-56df-47ba-b87f-f5eebdfce17b"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane aa3fefb9-56df-47ba-b87f-f5eebdfce17b
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS

```
