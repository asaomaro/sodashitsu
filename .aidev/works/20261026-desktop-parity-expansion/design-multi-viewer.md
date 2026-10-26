# 複数viewer: 通常画像配信の共有取得（8A）

同一Bの同一設定の共有窓を最大8つにする。BのProviderが保有する一つのhelperを共有し、各viewerのWS・所有RPC接続・ready・描画ACK・入力ACK・期限・取消は独立する。別Aからの要求でもBの認証済み同一Providerの範囲に限定し、各接続のorigin許可は従来どおり検査する。ログインだけで共有しない。

開始時にsharedDesktop option・soda-desktop-shared-v1・B capability・featuresの積を要求する。旧peerへ未知fieldを送らず、選択時に未対応なら終了する。通常の単独接続の経路は維持する。

8Aでは完全画像のみを配信する。遅いviewerの未ACK画像は1枚までで、以降の画像を捨てる。Bは各画像の有限取り込み後にhelperへACKし、fast viewerを止めない。deltaはベースが飛ぶため使わず、動的画質・native動画・音声・別cursor・clipboard・解像度変更・仮想画面・保護画面を併用しない。ファイル転送も初期経路では交渉しない。新規viewerにはreadyのみを再通知し、過去画像を渡さず次の取得を待つ。完全なhelper設定が異なる参加を拒否する。

入力はBで明示排他。現在owner以外の取得要求はfalseを返し、既存ownerの入力を解除しない。owner自身の解除/切断はhelperのcontrol=falseによりheld inputを解放し、その後ほかの窓の明示要求で取得する。入力seqはBのsource単位で採番し、ACKは要求したviewerにだけ元seqで返す。source変化・ロック・helper終了・設定変更は全購読を失効させる。最後の購読解除だけがhelperを終了する。新しいgenerationへ画像/操作権/入力待ちを持ち越さない。

## 作業と必須点検

- [x] 共有helperと有限fanout、世代終了、入力排他を実装（taskcheck必須）。
- [x] A/B交渉とUIの明示選択、旧peer拒否、実WebSocket統合検証（taskcheck必須）。
- [x] browser2窓の描画・排他・切断後の継続と再取得を観測する。fake helperのみで実画面/OS入力を使わない。
- [x] build/typecheck/全体テスト、独立worktree起動確認、独立全体レビューと修正再レビュー、PR/merge/両端反映。

8A完了でもtask8全体は保留。native動画/音声の共有encode・viewerごとの復帰/keyframeとadaptation、保護sourceのowner/logon/epoch別の共有条件は後続差分で検証する。
