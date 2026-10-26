# 生成データによる30分継続試験

2026-10-26、独立worktree `/workspaces/sodashitsu-desktop-audio-smoke`。通常Windows画面の製品伝送コードを使い、実画面/音声device/OS入力は扱わない。実ChromiumでH264とOpusを復号し、AudioContextの最終出力だけをzero gainへ迂回した。

## 条件

- Windows hardware encoderで事前生成した640×360 H264の4packet fixture、要求10fps。音声は生成440Hz、48kHz/stereo、Nodeで実Opus圧縮。
- 実UDP接続、ICE空。音声の20件ごと1件を受信破棄、映像は30秒ごと220ms間の受信片を破棄、13件ごとに40ms遅延して順序を入れ替えた。帯域制限やWANの測定ではない。
- ブラウザDOMとcanvasの進行、AudioDecoder output、decoder queue、AudioBufferSourceNode数を5秒以上ごとの345点で検査。
- coreのソース16ファイルはmain `7defd993`とバイト一致（`product-source-hashes.json`）。後続#211はUIの遅い再生完了だけを修正し、browser6件・全体758 suites/11,447 testsで別検証。core変更なし。
- 試験helperはperformance共通時計を使用。初回の別々の論理時計での失敗とbackpressure連番の修正は音声integrationの記録を参照。最終30分runの生成helperは共通時計版で、pipeの送信上限に当たる症状は発生していない。最終fixtureの未送信seq修正は実socketを3秒pauseする正例・旧実装の負例で別検証。

## 結果

- **1 passed (30.1m)**。計測区間1,800.081秒、345点で進行と上限を確認。最後の消音・再開・停止、decoder/context/source解放も成功。
- canvas 17,648枚、audio output 77,585件。故意の破棄はvideo受信片128件/audio message4,415件。WSS fallbackせずUDPで継続した。
- decoder queue最大2、scheduled source最大5（製品上限6）。ブラウザJS heap最大40.73MiB、最後14.70MiB。GCに伴い上下しており、この区間では単調な増大を認めない。
- 終盤約6分の/proc有効採取19点（JSON配列は終了後の時刻だけの1行を含み20件）: helper RSS 67.16〜67.16MiB。A/Bを同居させたPlaywright test worker RSS 506.5〜510.25MiB。後者にはcodec/RTC/計測・記録も含み、個別の製品サーバRSSではない。
- `raw-browser.log`に毎分28点と最終summaryの生出力、`browser-summary.json`に同じ数値を保存。全345点は試験中に検査したが、今回list reporterのbody attachmentから全sampleファイルは保存されていないため、保存済みの345点生データとは扱わない。

## 再実行

```sh
SODA_DESKTOP_SOAK_MS=1800000 pnpm --filter @sodashitsu/e2e exec playwright test remote-desktop-audio.spec.ts --grep 'soak,'
```

## 反映と限界

音声#209/#210と表示競合#211はmainへmerge。接続元は既存ローカル変更を保持して反映しbuild/typecheck/関連100件/smoke成功。sr-pcはmainをpullし依存追加・build、生成sourceでcombined helper compile/owner ACL/PID/停止チェック成功。最終B handoffは2026-10-26T02:32:35.686Z完了（head e43ad867、tracked変更なし、audioBuilt=true、unlock service Runningを読み取り確認）。Aも7pane維持でhandoff完了。handoffのRPC結果取得はexec.read timeoutとなったが、別の読み取りで実際の完了を確認した。

実WASAPI endpoint、実1920×1200/60fps画面、実WAN/NAT/帯域制限・音声品質は今回の試験対象ではない。入力反映遅延や他アプリとの同等性をこの生成試験から主張しない。既存のWindows生成GPU/60fps/force-keyframe検証、UDP切替/cursor/IME browser8件成功は各記録を参照。
