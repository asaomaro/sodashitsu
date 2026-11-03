# ロック状態からの解除・再接続

## 再現と修正

sr-pcで初期ロック画面からサインイン画面へ進むと共有が終了し、認証画面のフレームが届かない事象を再現。

- 遅延生成したDesktopProviderへ設定を渡すだけで、許可済みのサービスleaseを開始していなかった。初回生成時に開始し、endpoint必須モードではrequireEndpoint内の開始を再利用する。生成後のconfigureもcore.configureに一本化し二重開始を避ける。
- Win32 CreateProcessで作った子の終了コードを、PIDから取得した.NET Framework Processで読むとInvalidOperationExceptionになる。生成時のnative handleをSafeFileHandleで保持し、同じhandleで待機・終了コード取得を行う。JOB_LISTによる生成時の所有と限定した標準handle継承は維持する。
- 既存入力検査のReflection呼出しに不足していたpointer引数nullを明示した。

## 検証

関連TS56テスト、pnpm build、pnpm typecheck成功。初回lease開始を戻すと回帰テストが失敗し、元のバイト列へ復元して再テストした。

Windowsでは隔離した所有者プロファイル下へソースを置き、ハッシュ一致を確認して実行。旧版はProcessが終了コードを取得できず失敗、修正版はcmd.exeのexit0/7を正しく取得した。検証用子以外のプロセスを操作しない。

Windows全体検査も成功。proxy/子回収、限定DACL照会、pipe取消とUTF8、lock cover、入力/ACK、フレーム準備、入力優先を含む。ログは個人名を含むプロファイルのパス部分だけ匿名化し、出力本文と終了コードは保持する。PINを記録していない。

review_resource_monitorによる独立レビューでendpoint必須モードの二重開始を指摘。実DesktopProviderを用いた両モード検査を追加し修正。再レビューと最終入力検査変更の点検で必須指摘なし。

## main・実環境への反映とロック解除の実機確認

2026-11-04、mainの1701bfb4をAとsr-pcへ反映。Aは13pane、sr-pcは4paneを保持してhandoffした。sr-pcはserver build成功、ロック解除サービスがRunningとなった。

Aのlocalhost Web画面から接続済みsr-pcのPCアイコンでviewerを開き、以下を人向けviewerの経路で確認した。

1. ロック中はlockScreenCover=true、初期画面の画像配信はなく、サインイン画面へ進む操作を表示。
2. 明示操作後にsecureDesktop=trueの認証画面を実画像で表示。表示がスリープしている場合は最初の操作で復帰し、もう一度進む操作を行った。
3. 操作権を取得し、サインインオプションからPINを選択。指定されたPINを一度入力してEnterを送信。PINや認証画面の画像は記録・保存しない。
4. session_unlockedを受信し、allowInput=true・secureDesktopなしの通常共有へ自動再接続。errors=[]、frame数2以上で実デスクトップを確認。
5. 再度操作権を取得し、正規化座標(0.62,0.52)へマウスを移動。Windows側の実カーソル座標は(952,498)、論理画面1536×960で期待値と一致。映像1280×800の実frameも継続した。
6. カーソルを移動前の(757,591)相当へ戻し、操作権を解放してviewerを終了。

これはログイン済みactive consoleのロック解除を1台で実際に確認した結果。サインアウト後のログイン、UAC画面、生体認証、RDP session切替、長時間安定性の確認とは区別する。テスト用の実画面スクリーンショットは一時領域から削除する。
