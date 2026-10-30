# 検証

feature head b3938bc5。pnpm build/typecheck成功、全体903ファイル13,104件pass（346.84秒）。関連5ファイル341件pass。Linux localは21件中20pass・GI不足の実codec1件skip、Portal50件中48pass・GI不足2件skip。前段で同じ環境のGstVideo不足とbrowser online DOM待ちをmainと比較済みで再調査しない。依存を導入したCIでは実software H264 encode/decodeと画素を検証する。

head51238160のMac SDK compile、generated139件（非対称4色CGImage→BGRA→実software VT encode→decode→4点RGB比較含む）と既存17negativeが成功。cd3a6d75では生成テストの2回目offerを34msへ進めた結果、ACK待ち開始も34へ変わったのに2001ms絶対時刻で期限超過としたfixture誤りで失敗。b3938bc5で2001ms加算（2035ms）へ直し、実装guardは変更していない。追加3negativeを含む計20negativeと最終headのCI状態はPR #337に記録する。

headcd3a6d75のCIはサーバ/UI関連339件とブラウザ6件pass。通常/共有・両nativeの生成H264をブラウザで復号して実canvas画素・描画ACK・停止後の画像継続を検査し、clipboard既存2件も継続した。実Portal、ScreenCaptureKit、OS入力、音声、信頼/サービス/driverは実行していない。

最終docs headの検証結果とmergeはPR #337・/tmp/soda-native-video-final-receipt.jsonを参照。実機確認済み、zero-copy転送、他製品の全機能同等は主張しない。native音声/mic/monitor/解像度と追加codec/UDP/adaptive等は後続としてstatusに残した。

## 原本を変更しない一時ソース負例

元kernel/test/生成fixtureを一時ディレクトリへコピーし、対応guardだけを外した。元bytes一致を確認し、以下の意図したAssertionErrorを確認した。

### ack

```text
F
======================================================================
FAIL: test_ack_deadline_is_checked_without_waiting_for_tick (__main__.Flow.test_ack_deadline_is_checked_without_waiting_for_tick)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-video-negative-rtpks9ip/test-linux-native-video.py", line 135, in test_ack_deadline_is_checked_without_waiting_for_tick
    self.assertIsNone(self.flow.current)
AssertionError: {'id': '2baf7ce9-c808-4d63-a627-adfc03ef49e0', 'fps': 30, 'kbps': 2500, 'window': 3, 'seq': 1, 'timestamp': 0, 'pending': [], 'encoding': None, 'next': 33.333333333333336, 'key': False, 'dead': False, 'codec': 'avc1.42041E', 'size': (640, 360)} is not None

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)
```

### slot

```text
F
======================================================================
FAIL: test_cancelled_encoding_keeps_global_slot_until_actual_completion (__main__.Flow.test_cancelled_encoding_keeps_global_slot_until_actual_completion)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-video-negative-hd7pksh4/test-linux-native-video.py", line 177, in test_cancelled_encoding_keeps_global_slot_until_actual_completion
    self.assertIsNone(self.flow.reserve())
AssertionError: ({'id': '6f24923a-e1be-4861-b2c1-66ee3ef093d3', 'fps': 30, 'kbps': 2500, 'window': 3, 'seq': 0, 'timestamp': -1, 'pending': [], 'encoding': (0, True, <object object at 0x7a31be720b60>), 'next': 33.333333333333336, 'key': False, 'dead': False, 'codec': None, 'size': None}, (0, True, <object object at 0x7a31be720b60>)) is not None

----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (failures=1)
```

### uuid

```text
F
======================================================================
FAIL: test_uuid_ledger_survives_many_stops_and_canonicalizes_case (__main__.Flow.test_uuid_ledger_survives_many_stops_and_canonicalizes_case)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-video-negative-wl1rr3pv/test-linux-native-video.py", line 267, in test_uuid_ledger_survives_many_stops_and_canonicalizes_case
    with self.assertRaises(video.VideoFailure):
AssertionError: VideoFailure not raised

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)
```

### published-codec

```text
F
======================================================================
FAIL: test_first_hardware_frame_failure_retires_before_software_retry (__main__.Flow.test_first_hardware_frame_failure_retires_before_software_retry)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-video-negative-rzjyb1vw/test-linux-native-video.py", line 301, in test_first_hardware_frame_failure_retires_before_software_retry
    with self.assertRaises(video.VideoFailure):encoder.encode(bytearray(64*64*3),False,lambda:True)
AssertionError: VideoFailure not raised

----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)
```

