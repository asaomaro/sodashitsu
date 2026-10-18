# デスクトップ共有の初回許可

接続先PCで環境変数JSONを作らずに、sodaの起動オプションまたは設定から共有を許可できるようにする。

- `soda serve --desktop` は閲覧のみ。`--desktop-input` / `--desktop-clipboard` / `--desktop-resize`は個別許可で、`--desktop`が必須。
- Windows / WSLは同梱のPS1とC#を自動検出。通常はPowerShellの実行コマンドを設定しない。配布物に2ファイルを含める。カスタム環境コマンドは維持し、実行パスをRPCから受け取らない。
- `desktop.settings.get/set`は一般prefsと分離。変更は認証済みでsameMachine、loopback Host/Origin、転送ヘッダーなしの接続だけ。machine bridgeは不可。公開URLの認証をPC全体の共有許可へ自動拡張しない。
- Web/TUI設定はサーバーの`desktop-permissions.json`へ原子的に保存。書き込みを直列化し、不正ファイルは共有無効。保存に失敗した場合は有効な設定を変えない。
- 優先順は、その起動でのCLI指定 > 保存済みローカル許可 > legacy環境の初期値 > 無効。起動後のUI変更は即時反映。起動フラグ付きで再起動するとそのフラグが再度初期値になる。
- 設定変更は有効化も含め、既存共有・companion・開始待ちを停止する。遅れてhelperが起動しないようpending cancellationとconfig identityを検査。
- 共有先originはカスタムコマンドとは独立して、`SODA_DESKTOP_ORIGINS`とオンライン操作委譲先から構成。Aブラウザにlocalhostを使うとBから到達できない点は文書化。
- 本変更は権限設定の導線。PCの実画面キャプチャ・入力の実機検証は行わない。

独立点検対象: 設定保存・プロトコル・ローカル権限境界・provider revoke・配布。レビューでbundled modeのSSH origin漏れを検出し修正、修正を別コンテキストで再レビュー済み。見た目・文書は全体点検に含める。
