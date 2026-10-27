# 共有sourceマイクの独立レビュー

base e322e815 / source 27290ced。実装と別コンテキストのreview_pointer/review_transferが全差分を点検し、製品mustなし。member+stream ID所有権、pipe前claim、古いstop/最初のviewer退出、共通configure、旧peer gateを確認。

should2点を対応: 利用者文書へ単一owner/明示handover/非奪取/実デバイス未検証を追記。native/video+audio交差テストは各回native_audio_status runningとhelper audio_stopを待機し、その後の新規mic ACKを検査。初期化前に停止して空振りする穴を修正し、追加差分の再レビューで指摘なし。

実音声/OS入力やレビュアーによるコード変更・重複全体テストは実行していない。
