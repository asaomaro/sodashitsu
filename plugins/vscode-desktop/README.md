# VSCode Desktop（CDP・実験版）

**起動済みデスクトップVSCodeのrendererを画像で共有する**アプリビュー。新しいVSCode Webや別のPJを起動しません。本体fork・patch、DOM selector、任意JavaScript実行を使いません。

Windows側Node 24のブリッジとSodashitsu側プラグインからなります。Nodeの標準APIだけを使うのでブリッジにnpm installは不要です。VSCode拡張への同梱はこの版にはありません。

## 前提

- この機能を含むSodashitsuを使うこと。プラグインだけを古いSodashitsuへ導入しても動きません。
- WindowsのVSCodeが**既にCDP有効で起動していること**。標準の接続先は `http://127.0.0.1:9222`。手動接続ではこのツールがVSCodeを起動しません。下記の自動起動設定を行った場合だけ、専用プロファイルのVSCodeを起動できます。既存VSCodeの終了・再起動は行いません。
- 未有効の場合は導入時の起動方法変更が別途必要です。既存端末プロセスを維持したまま後付けできると保証するものではありません。次回以降もCDP用オプションを維持して起動する必要があります。
- モバイル等から使う場合は、既存のHTTPS/WSS接続先と認証を使います。WindowsからそのURLへ接続できる必要があります。HTTPはloopbackでの確認のみです。CDPそのものを外部へ公開しないでください。

## 接続済みマシンのVSCodeを操作する

手元のWeb版Sodashitsuで対象マシンを選び、タブ行右端の［＋接続ビュー］から［VSCode］を選びます。開いたビューで［VSCodeを起動・接続］を押すと、そのマシン側のVSCodeへ接続します。候補が複数なら選択してください。［操作する］で操作し、［表示領域に合わせる］で描画領域を合わせられます。［閉じる］は共有とブリッジを終了し、VSCode本体は残します。通常のEscは操作中のVSCodeへ届き、最大化中のEscは元の表示へ戻す操作に使います。

接続元A・接続先Bの両方に、この機能に対応したSodashitsuが必要です。BがWindows/WSLなら、B自身の設定画面の［VSCode共有］で自動起動を許可します。同梱helperを使うため、通常はコマンドやファイル配置は不要です。従来の `SODA_VSCODE_CDP_COMMAND` も利用できます。helperの `--soda` は **B自身へ接続する固定origin** のままです。AのURLへ変更しません。BでCDP有効の既存VSCodeがあれば再利用し、無ければBの専用プロファイルで新規起動します。Bのhelper設定が無い場合は案内を表示します。

映像・入力は、既存のSSHまたはB発操作委譲のマシン接続に、専用の論理チャネルを開いて中継します。新しいインターネット公開ポートやB→Aの別HTTPS接続は不要です。CDPはBのWindows loopbackのままです。物理回線は既存マシン接続と共用するため、実回線での端末への影響・通信性能は別途計測が必要です。

画像は開いた窓の認証済み接続だけに送り、他のブラウザへ配信しません。マシン切断・無効化・削除・ブラウザ切断・ログアウトで共有を止め、操作とサイズ追従を解除します。再接続で共有・操作を自動復活しません。ローカルのVSCodeも別の接続として操作できます。

マシンを切り替えてリモート側のVSCodeアプリビューを開く場合も、そのマシン側へ接続します。この場合は接続先Bへのプラグイン導入に加え、接続元Aでスクリプト表示を許可する必要があります。リモート画面で手動コマンドを発行する導線は出さず、Bに固定設定した起動処理を使います。

実ブラウザ検証は、同じ検証環境内の2つのSodaをB発操作委譲で結び、実Chromium描画へCDP接続したものです。別PCの実Windows・実回線の動作は未検証です。

## 接続ボタンから起動する（Windows/WSL）

共有するPC自身のlocalhostから開いたWeb版、またはそのPCの端末版の設定で［VSCode共有］を開き、［接続ボタンからの自動起動を許可］を有効にします。必要なら操作とサイズ追従も許可します。設定はそのSodashitsuサーバーの状態ディレクトリに保存します。接続先マシン経由や外部ブラウザからは変更できません。

Windows側に通常版VSCodeとNode 24以降が必要です。同梱helperは起動ボタンを押した時だけ起動します。標準インストール先のVSCodeとWindowsのPATH上のNodeを探し、既定のCDPポート9222から候補を取得します。候補があれば選択し、なければ `%LOCALAPPDATA%/Sodashitsu/vscode-profile` の専用プロファイルでVSCodeを起動します。複数ポートを横断した探索は行いません。

［このPCのSodashitsu URL］が空なら自分のloopback URLを使用します。HTTPS構成ではWindowsから接続でき、証明書名が一致するそのサーバー自身のURLを指定してください。TLS証明書の検証は無効化しません。

許可を変更すると、その設定で自動起動した接続は停止します。手動登録した共有元には適用しません。手動共有の許可は登録解除・再登録で変更します。既存の環境変数による起動コマンドがある場合、その引数を維持し、設定画面では自動起動の許可だけを切り替えます。

### 独自のインストール先・起動コマンドを使う場合

管理者が `SODA_VSCODE_CDP_COMMAND` に固定の起動コマンドをJSON配列で設定し、Sodashitsuサーバーを起動します。起動先Windowsへ4ファイル（`cdp-launcher.mjs`、`cdp-bridge.mjs`、`cdp-client.mjs`、`resident-bridge.mjs`）を同じフォルダーに配置してください。Node 24を使用します。通常のプラグイン承認・スクリプト表示許可も必要です。

Windows上でSodashitsuを起動する設定例:

```powershell
$env:SODA_VSCODE_CDP_COMMAND = @(
  'C:/Program Files/nodejs/node.exe',
  'C:/SodaDesktop/cdp-launcher.mjs',
  '--code', 'C:/Users/USER/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  '--user-data-dir', 'C:/Users/USER/AppData/Local/Sodashitsu/vscode-profile',
  '--soda', 'https://soda.example.com',
  '--allow-input', '--allow-fit'
) | ConvertTo-Json -Compress
soda serve
```

WSL上では、同じ配列の先頭だけをWSLから実行できるWindows Nodeのパス（例 `/mnt/c/Program Files/nodejs/node.exe`）に変え、環境変数へ設定してサーバーを起動します。それ以外のパスはWindows側のパスです。`--soda` はそのWindowsから到達できる、このSodashitsuサーバーの固定originです。ローカル確認だけHTTP loopbackを使えます。ブラウザやHostヘッダーから接続先を決めません。CDPは既定のWindows loopback9222、変更時は固定引数 `--cdp http://127.0.0.1:PORT` を追加します。

設定後はアプリの［VSCodeを起動・接続］を押します。CDP有効のVSCodeがあれば再利用し、なければ指定した専用 `--user-data-dir` で新規起動します。候補が1つなら自動接続、複数ならタイトルを選んで［選択したVSCodeに接続］。接続コマンドやtokenのコピーは不要です。操作とサイズ追従は接続後に別途許可します。操作不要なら起動設定の `--allow-input --allow-fit` を外します。

通常起動の既存VSCodeへCDPを後付けする機能ではありません。専用プロファイルは通常のVSCodeプロファイルと別なので、元の拡張・ログイン・PJを自動移行しません。普段の既存セッションを共有する場合は、そのセッション自体をあらかじめCDP有効で起動してください。

自動起動は当該Sodashitsuサーバー側のWindowsを対象とします。Windowsで直接動くサーバーはWindows Nodeを直接、WSLサーバーはWindows実行経由を利用します。リモート側のURLを開いて使う場合も、そのリモートサーバーで同じ設定が必要です。ブラウザ側PCのVSCodeをリモートサーバーから起動するものではありません。Windowsサービス/別ログインセッションからのGUI起動は対象外です。

サーバー内で起動処理を1つずつ実行します。共有停止・ブラウザ切断・ログアウトでは所有するブリッジだけを終了し、VSCode本体は残します。入力解放・fit解除中は次の起動接続を待ちます。接続済みhelperは後始末を途中で打ち切らないため強制終了せず、異常なhelperが終了しない場合は起動処理が使用中のままになります。未設定環境は従来の手動接続を利用できます。

## 導入と接続

プラグインの導入操作はユーザー自身の状態ディレクトリを対象に実施します。

```sh
sodactl plugin pack ./plugins/vscode-desktop --out /tmp/vscode-desktop.sodaplugin
sodactl plugin install /tmp/vscode-desktop.sodaplugin
sodactl plugin enable vscode-desktop
```

Sodashitsuの設定で「スクリプトが動く表示」を有効にし、VSCode Desktopのアプリタブを開きます。既存タブの［ビューを追加］からも使えます。

1. `cdp-bridge.mjs`・`cdp-client.mjs`・`resident-bridge.mjs` を同じWindows側フォルダへ配置します。
2. ［共有元を登録する］をオンにして［共有元を接続］を押し、表示されたコマンドをWindows側で一度実行します。一回限りの初期tokenは5分で失効します。`--remember` が初回登録、`--allow-input --allow-fit` がローカル側の操作・サイズ追従許可です。閲覧専用で登録するなら両許可flagを外してください。
3. Windows側で共有する既存VSCodeを番号で選びます。登録後はブリッジを起動したままにします。
4. ［共有を停止］・ブラウザを閉じる・ログアウトで映像と操作を止め、ブリッジは待機へ戻ります。以後はSodashitsuの［登録済みの共有元］から選び［接続］を押すだけです。毎回tokenやCLIを入力する必要はありません。他の閲覧接続が使用中、または停止処理中の共有元は奪えません。
5. 各接続は閲覧から始まります。［操作する］と［表示領域に合わせる］でその接続の操作・追従を許可します。回線復帰やSoda再起動後、ブリッジは自動で待機接続へ戻りますが、共有・操作は自動再開しません。
6. ［登録を解除］で保存された接続資格を失効させます。Windowsブリッジがオンラインなら保存設定も削除して終了します。オフラインなら次回接続時に失効を通知して終了します。

初回登録の例（tokenは画面から取得）:

```powershell
node ./cdp-bridge.mjs --soda "https://soda.example.com" --token <初回token> --remember --allow-input --allow-fit
```

Windows再起動やブリッジ終了後に起動し直す場合は、保存設定があれば次だけで復帰します。Soda画面では［接続］を押します。

```powershell
node ./cdp-bridge.mjs
```

Windowsの既定保存先は `%LOCALAPPDATA%\Sodashitsu\vscode-cdp\bridge.json`。Sodaのorigin・限定された接続資格・CDP接続先・選択したtarget ID・許可を保存します。Nodeの `mode: 0600` はWindowsでUnix同様の所有者限定権限を保証しないため、Windowsのユーザー領域のACLに依存します。DPAPI暗号化は未実装です（[Node公式のfile modes](https://nodejs.org/api/fs.html#file-modes)）。ファイルは他人へ共有しないでください。Linuxは `$XDG_STATE_HOME/sodashitsu/vscode-cdp/bridge.json`（未設定なら `~/.local/state/`）です。

複数の共有元を別に登録する場合は、初回と再起動の両方で `--profile PATH` を指定します。登録済みprofileで許可や接続先を上書きするflagは受け付けません。変更時は登録解除・再登録を行います。選んだVSCodeが閉じた場合に別窓へ自動で切り替えません。ブリッジ起動時に対象IDが消えていれば、ローカルで選び直します。VSCode/CDPが停止したままの起動はエラーになります。

登録せず今回だけ接続する場合は［共有元を登録する］をオフにします。この場合は共有停止でCLIが終了し、次回は新しいtokenが必要です。Windowsログイン時の自動起動設定、VSCodeの自動起動や再起動、VSCode拡張の導入は行いません。

接続先のCDP portが異なる場合は `--cdp http://127.0.0.1:PORT`。一覧だけなら `node ./cdp-bridge.mjs --list`。`--target ID` で一覧のtargetを明示できます。Nodeが信頼するTLS証明書を使用し、検証無効化のフラグは使いません。WSLのURLへWindowsから接続する方法はネットワークモードによって異なります。

## 操作と限界

- 接続後は共有元の情報や設定を閉じ、［情報・設定］で必要なときに開きます。最大化中は映像領域をブラウザのタブ内全体へ広げ、操作ボタンと文字入力欄を映像に重ねます。
- ［最大化］でブラウザのタブ内全体へ広げます。アドレスバーやブラウザのタブは残り、ブラウザのFullscreen APIは使用しません。［元に戻す］またはEscで元の表示へ戻ります。最大化中も操作・共有停止のボタンを残し、接続設定欄は隠します。閲覧中でも使え、最大化により操作許可が有効になることはありません。［表示領域に合わせる］がオンなら寸法変更に追従します。オフなら等倍とスクロールを保ちます。共有切断・停止では最大化を解除します。
- ［表示領域に合わせる］は画像の拡縮ではなく、共有元VSCodeの描画領域を操作側の画面寸法へ変更します。端数のCSSピクセルは切り捨て、収まる整数寸法を指定します。追従中は旧画像によるスクロールバーを出さず、バーの出現・消失が次の解像度指定へ影響しないようにします。Windowsの物理モニター解像度を変更する機能ではありません。
- 表示は元VSCodeの1 CSS pxをブラウザの1 CSS pxへ対応させる等倍です。大きい場合はスクロールします。JPEGの画素数やWindowsのDPIとは区別し、ブラウザのズーム倍率にも影響されます。
- 画像はJPEG、最大1920×1200、送り出しは最大約10フレーム/秒。画面が変わらなければ新しいフレームが来ないことがあります。最新の画像だけを扱い、溜まった入力は再送しません。
- ホイールは短い間隔で同じ位置/方向の入力をまとめ、遅い接続で待機入力が増え続けないようにします。極端な連続入力は各軸±10000で飽和し、過剰分や混雑中の移動入力は破棄する場合があります。クリック/キー/文字入力の境界を跨いで合算しません。
- 画面をクリックして物理キーボードで入力します。日本語・emojiは下の入力欄で変換を確定して［文字を送る］を押します。Windows側IME候補をそのまま遠隔操作するものではありません。
- 操作許可中はCDPのfocus emulationを有効にし、非アクティブなElectronへのマウス入力に応答させます。閲覧へ戻す/停止時には解除を試みます。別のDevToolsが同じtargetへfocus emulationを設定している場合の併用は未検証です。
- 同じrendererのフォーカス・選択・カーソルをローカルと共有します。ブラウザ/OS予約キーとElectronのショートカットすべてを透過する保証はありません。
- HTMLのヘッダーメニューは配信対象ですが、今回のWindows実機では非アクティブ時にDOMが開いていても画像に描かれず、VSCodeを前面へ出すと映りました。focus emulationだけで全UIの描画を保証するものではありません。ブリッジが自動で前面化する機能はありません。
- Windows標準のフォルダー/ファイル選択や外部ブラウザの認証窓は、このrendererの配信対象外です。見えないダイアログが出た場合は閲覧へ戻しWindows側で処理してください。`files.simpleDialog.enable: true` はVSCode内の簡易選択UIを使う回避策ですが、見た目が変わるため、このプラグインが自動で設定することはありません。
- ［表示領域に合わせる］は、VSCode内部の描画領域をSodaの表示枠に合わせ、エディタ・サイドバー等を再配置します。枠の変更には約200msの集約後に追従します。同じrendererなのでWindows側で見えるレイアウトにも反映されます。Windowsの外枠・位置は変えません。
- 追従はローカルの `--allow-fit` とブラウザの操作許可の両方が必要です。追従オフ、閲覧への復帰、共有停止/切断では描画領域のoverride解除を試みます。別DevToolsや別ブリッジによる同じtargetへの同時overrideは非対応です。別クライアントが先に設定していたoverrideを保存・復元する機能はありません。
- サイズ切替中は、対応する新画像の描画ACKまで入力を破棄し、古い座標を後から再送しません。160×120未満の表示領域では追従を解除し、最大4096×2400 CSS pxを超える場合は比率を維持して収めます。配信画像自体は最大1920×1200です。
- Windows側での通常のウィンドウサイズ変更にも、新しい画像とCSS座標で追従する設計です。Sodaの面を変えたとき、追従オフなら等倍を保ち、収まらない部分はスクロールします。遠隔のWindows実外枠リサイズは未実装です。今回のElectronでは `Browser.getWindowForTarget` が未対応でした。
- 最小化・非表示・ロック、Windows実機でのIME/ターミナル/Webview、Safari/iOS、実回線の性能は未検証です。ロックを検知して自動停止する機能はまだありません。席を離れる前に共有を停止してください。
- 共有元rendererのreload/navigationではその共有を止めます。登録済みブリッジは待機へ戻ります。ブラウザ再読み込み後も［接続］から再開できます。クリップボード同期、ファイル転送、音声はありません。
- 非操作時、タブが非表示になったとき・ブラウザwindowがフォーカスを失ったときは閲覧へ戻します。切断時には保持中の修飾キーとマウスボタンを解放するよう試みます。

## 隔離と認証

プラグインは `soda.mount('desktop-cdp', element)` で**Sodashitsu管理の部品**を配置します。隔離iframeのCSPは緩めません。token・画面画像・入力はiframeへ渡しません。通常のログイン済みcookieとOrigin検査で閲覧用WSへ接続し、初回共有元はtokenでそのブラウザ接続へ結びつきます。登録を選ぶとserverの `desktop-cdp-devices.json` へ資格のhashだけを保存し、Windows側に限定資格とローカル許可を保存します。登録済み共有元はSodaの同じ認証範囲内のログイン済み利用者が接続できる扱いです。他の閲覧接続へ画像を配りません。招待tokenは保存しません。共有単位のIDで古い画像・入力を分離し、停止処理完了まで次の共有を開始しません。

共有元との通信は同じHTTP(S)サーバの `/desktop-cdp?role=bridge`、ブラウザは `/desktop-cdp?role=viewer` を使います。リバースプロキシがWSのパスを限定している場合はこのパスのupgrade対応が別途必要です。マシン委譲の全セッション操作権限を流用せず、`pane.sock`にも載せません。

## 検証

`packages/e2e/src/specs/vscode-cdp.spec.ts` はテスト用ChromiumへPlaywrightの既存pipeからCDP接続し、連続画像の**canvas画素**と、元rendererへの入力を確認します。テスト自身が画像を受信しただけでは成功にしません。Windows版VSCodeの実機検証を代用するものではありません。

### 開発用の一時サーバ（WSL/Linux）

リポジトリでビルド後、次のコマンドで実機確認用サーバを再作成できます。

```sh
node scripts/vscode-cdp-dev.mjs
```

既定はloopbackの `http://127.0.0.1:17883`。別ポートは `--port 17884` で指定します。毎回新しい一時stateとログインtokenを作り、名前付きsession `cdp-test` にプラグイン・script表示許可・アプリタブを準備します。既存のSodaのstateやWindowsのVSCodeは変更しません。ポートが使用中なら起動に失敗し、既存のサーバを止めたり置き換えたりしません。

ログに出る一時フォルダの `login-url.txt` を使ってブラウザを開きます。同じ場所の `connection.json` もtokenを含む秘密ファイルです。tokenそのものはログへ出しません。停止は `Ctrl+C`。同じ検証stateを保持して起動し直す場合は `node scripts/vscode-cdp-dev.mjs --state-root <ログに出た一時フォルダ>` を使います。元のログインtoken・登録・アプリタブを再利用します。新規起動は別stateなので登録も別になります。一時フォルダが消えた場合は再登録が必要です。CDPの有効化、Windowsへのブリッジ配置、HTTPSや外部公開の設定は行いません。

CDP仕様: [Page.startScreencast](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast)、[Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/)。experimental APIとElectron/Chromium版差の追従は必要です。

描画領域の追従は [Emulation.setDeviceMetricsOverride / clearDeviceMetricsOverride](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Emulation.pdl) を使い、元のdevice scale factorを使う `deviceScaleFactor: 0` と `mobile: false` を指定します。Windowsのネイティブダイアログは、この変更でも配信対象になりません。
