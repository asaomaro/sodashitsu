# Codexの子の現在状態

親rolloutにある正式`SubAgentActivity`は所属・開始・終了の根拠です。`interacted`は入力の配達を表し、今も実行中か待機しているかを確定できません。正式startedで所属を確認し、completed後に再び参照された子が「状態不明」だったのは、この記録から現在の作業状態まで推測していなかったためです。

一覧に載せる所属が記録のEOFまで確認できた場合だけ、同じユーザーが所有する既存Codex App Serverへ`initialize`・`thread/loaded/list`・`thread/read(includeTurns:false)`で照合します。モデルターン、会話のstart/resume、子への入力、daemonの起動・停止は行いません。CLIの版とdaemonの版が異なることもあるため、CLI名や起動希望設定を状態の証拠にしません。

`active`で`activeFlags`が空なら`working`、`idle`なら`idle`です。承認待ち・入力待ちのフラグがあるactive、notLoaded、systemError、未知の状態、未loaded、読めない状態は`unknown`です。所属数は`countBasis: alive`とし、APIだけで子の所属を増やしません。completedだけで終わった子や、終了記録で取り除いた子を再表示しません。状態取得に失敗しても既知の所属を正常な0件へ変換しません。

現在状態transportは、現在確認したLinuxの所有Unix WebSocketに限定しています。Windows等の別transportは未実装で、所属の取得を保ったまま状態を不明にします。この制限を「CodexにAPIが無い」という意味にはしません。

## 境界と上限

- CODEX_HOMEの実体、control/daemonフォルダの所有者・書込権限、providerが作るcontrol socketリンクと実体（所有者・privateフォルダ・socket権限）を検証します。
- daemon PIDファイルをnofollow・単一の通常ファイル・16KiB以内で読み、同ユーザーの生存PIDとkernel開始時刻、前後のPIDメタデータ・socket dev/inoを照合します。daemonの入替中や別所有者は不明にします。
- 1 batchは最大64子・66リクエスト、応答1MiB/フレーム・合計4MiB、loaded一覧1万件、全体1500ms・各リクエスト1000ms以内。同時接続は最大2、同じhome/親の重複照合はしません。枠が使用中なら不明です。接続枠は実socketのcloseまで保持します。
- 状態の前後で親記録の同じfdとpathのdev/ino/size/mtimeNs/ctimeNsを確認し、追記・縮小・置換・metadataが変化する同サイズの変更で破棄します。pane、instance、kind、会話が変わる・forget/closeになると取消し、サーバー側のfresh session検証も維持します。
- providerのappend/rotateを想定しています。全履歴の再hashは行わず、同サイズ・同一metadataを保つ任意のin-place改変の検出までは保証しません。
- 本文・preview・cwdや通知内容を公開・保存しません。status応答の本文をログへ転送せず、正式IDは照合のためのメモリ内だけに保持します。

## 一次資料と確認範囲

[公式App Server仕様](https://learn.chatgpt.com/docs/app-server#protocol)では、stdioはJSONL、Unix socketは標準HTTP UpgradeによるWebSocketです。`thread/read`は会話を再開せずmetadataとruntime statusを読み、`thread/loaded/list`は同daemonのmemory内にあるIDを返します。導入CLI 0.166.0の生成schemaもactive/idle/notLoaded/systemError、activeFlagsのwaitingOnApproval/waitingOnUserInputを定義しています。

隔離HOME・認証コピー無し・専用Unix listenerでinitialize/loaded/readを確認しました。その後、正式親記録の所属とEOFを照合した利用者セッションに対し、既存の所有daemon 0.167.0へread-only接続し、親と3子のloaded/active・空のactiveFlagsを確認しました。モデルターンは開始せず、実ID・本文は記録へ保存していません。この実読取は正式transportの能力確認であり、製品コードからの最終公開状態は統合後に別途確認します。
