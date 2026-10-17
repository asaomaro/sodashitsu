# 仕様

- `/machine-delegation` に専用Bearer/マシンIDで外向きWSS接続。Originを持つブラウザからの直接登録は拒否。通常の `/ws` と認証を分離し、招待を通常ログインには使えないようにする。
- 既存のBridgeEndpointを操作される側、MachineLinkを操作する側で再利用し、WebSocketStreamを既存のフレーム検証・多重化・背圧へ接続する。Unix socket・SSHは不要。
- `machines.json`の既存profileへ任意の`transport:reverse`を追加（旧profileはSSHのまま）。逆向きprofileでSSHを起こさず、認証した着信をMachineManagerへ渡す。既存UIと `/ws?machine=` は変更しない。
- 招待ハッシュは操作する側の `delegation-grants.json`、接続先と秘密は操作される側の `outbound-delegations.json`（原子的0600）へ保存。公開URLだけを状態一覧へ出し、本文・秘密はログに書かない。
- 招待64台、操作される側は同時16接続、認証の同時処理16件、同一マシンIDの同時接続を拒否。保存ファイル/フレーム/チャネル/送信待ちにも上限を設定。
- URLは外部WSSだけ、WSはループバックに限定。リダイレクト・URL資格情報・クエリ・任意パスは拒否。TLS検証を無効化するオプションは設けない。
- 切断後1〜30秒で再接続。15秒ping・45秒無応答で終了。成功handoff/再起動後は保存設定を復元し、失敗時rollbackでは既存設定のresumeを使う。
- CLIはinvite/delegate/delegations/stop-delegation。CLIの招待は既存ファイル上書きなし、本文をstdoutへ出さない。

## 検証

認証・復元・再接続は壊れやすい箇所として独立レビューと実サーバー2台の統合テストを実施。通常ログインとの分離、不正招待、ブラウザOrigin、無効化/再許可、双方から停止、サーバー再生成、無応答タイムアウトを確認する。ブラウザE2Eはサイドバー・ペイン・ブラウザが受けた出力で判定。最後に全差分を独立レビューする。
