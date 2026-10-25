# 動画専用接続の検証

生成H264を使用し、実デスクトップやOS入力は扱っていない。

- 関連unit 180件成功（server desktop/protocol desktop/web desktop）。一回券のrole/session/origin、replay、期限・失効・親終了、pending上限、両attach順とpingを確認。
- 実Relay/Providerと合成helperで、動画packetが専用接続へ届く間、mainへ入力ACKが返ることを確認。動画の不正packet・B送信詰まり・A→viewer送信詰まりの3通りで、専用接続だけが閉じ、画像とmain入力ACKが継続。
- native→browser切替後の遅延した旧native停止状態を無視し、idleのnative接続が閉じてもbrowser mediaを止めないことを確認。
- 旧viewer/旧providerへ動画ticketを渡さない互換検証。
- 実ブラウザ: native/video/input/mediaの9件成功・実画面性能試験1件opt-in skip。追加のGPU fixtureケースは画像fallback後に非表示になる動画専用UIへ依存した試験の誤りを直して1件再実行し成功。計10件成功。canvas色/グレー、専用socketへの8枚以上の受信、mainからの描画ACK/キー送信、追加接続を遅延したnative-only ready順、動画socket終了後の画像再描画とキーACKを確認。
- 全体build/typecheckとsmoke成功。

独立レビューで見つかったvideoエラーの停止範囲、ready順の選択、旧media停止通知、idle動画socketとbrowser mediaの分離を修正した。

## 修正を戻した反証

いずれもテスト対象の修正だけを戻し、コンパイルではなく実行時assertionが失敗。その後ファイルをバイト単位で復元した。

- [従来のmain送信へ戻す](negative-routing.log): 専用接続へ動画が届かず失敗。
- [全共有を停止するcatchへ戻す](negative-failure-scope.log): main接続の継続検査が失敗。
- [ticket session/origin制限を外す](negative-ticket-owner.log): 誤った所有者の接続が閉じず失敗。

## 限界

実sr-pc/WANの操作遅延や速度比は測っていない。専用socketはTCPであり、帯域共有・TCP再送自体は残る。JPEG snapshotとhelper stdoutの待ちは別対応。GPU直接入力は前PR #202、今回の追加はサーバー/Webのbuild/handoffが必要。

追加のnegative: [native ready順](negative-ready-order.log)は修正前の選択判定へ戻しWebを再buildすると、実browserのnative選択が空となって失敗。[idle close](negative-idle-close.log)は選択値でstopVideoする処理へ戻し再buildすると、WebRTCのcanvasが3枚で止まり継続描画の検査が失敗。[旧media通知](negative-retired-media.log)は旧id/transportの無視を戻すと、後続mediaが破棄され状態参照で実行時失敗。全てbyte復元し、Webを再buildした。

全体unitでは744 suite・11,357件が成功し、PTYの1 suiteだけが「negative実施後のsource mtimeよりdistが古い」という開始前チェックで止まった。機能assertionの失敗ではない。sourceを復元した状態で全体buildし直し、そのsuiteだけ再検証する。

復元後の全体build成功。PTY suiteの1件を再実行して成功し、全体745 suite・11,358件のassertionが全て成功した（全体の再実行はせず、停止したsuiteだけ再実行）。復元後の関連48件とnative-only ready順/WebRTC idle closeのbrowser2件も再実行して成功。
