# 判断と保留

## D1 専用worktree

ユーザーの依頼により`feature/remote-web-preview`を`/workspaces/sodashitsu-remote-web-preview`へ作成。mainの追跡済みHEAD `94f53f12`から開始し、元worktreeの未コミット変更には触れない。別のTailscale/VSCode GUI配信作業とは独立する。

## D2 エージェントが利用者の手入力を代行する

ユーザー追加要望: Sodashitsuから指示したエージェントが、ポート等の設定と外部Webアプリ画面の立上げまで行えるとよい。register/open/statusを標準CLIとして設計する。起動shellコマンドは既存のpane操作を使い、preview登録に任意commandを保存する仕組みは初期範囲に入れない。

## D3 PC側の補助プログラムを採用

ユーザーが「補助プログラムを認めます」と回答したため、app/sessionごとの直接の子`p<uuid>.localhost`を使うloopback gateway方式でP0へ進む。外部origin/ドメインの取得は不要。ブラウザ標準のLNA許可が必要な環境では初回に案内し、ユーザーの許可なしに安全機能を無効化しない。

## D4 自動化とpane.sockの境界

ログインなしのpane.sockへ転送有効化・他画面操作の管理RPCを無条件で追加しない。callerの候補登録/open intentと、認証済みviewerの明示grant/activateを分ける。現行socketは同OS利用者の境界であり、強いpane本人認証ではない。自動化grantもworkspace/pane/port/期限で限定する。実装できない場合は認証済みCLIを先行する。

## D5 画面を開く成功とアプリの正しさを分ける

open intent受付、PreviewView作成、gateway/upstream到達、ブラウザ描画、アプリ機能の成功を別の状態として扱う。クロスorigin iframeのloadイベントだけを正常動作の証拠にしない。エージェントがユーザーへ「検証済み」と誤報しない契約にする。

## D6 現段階の成果

調査・設計に続き、独立したLoopbackGatewayと自動実行できるbrowser入口PoCを追加。依存関係はworktreeにofflineで準備した。製品CLI/remote転送/UIへの配線、システムへの補助機能/証明書の導入、外部公開、外部port開放、commit/PR/mergeはまだ行っていない。段階的な作業単位はtasksに記録する。

## D7 初期実装への継続

ユーザーの継続依頼によりP0後、標準CLI・既存RPC上の転送・専用Webプレビュー窓まで配線。ブラウザPCでのhelper初回起動は利用者が行い、それ以後の登録/openはagentが行う。専用binaryチャネルは導入せず、既存SSH/外向きbridgeのJSON転送を利用する。登録の永続化、別principal ACL、helper自動起動、実アプリ/OS/browser横断性能試験は後続とし、初期実装の合格範囲と区別する。D6はP0時点の記録。
