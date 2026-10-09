# 検証手順：3 OS・実機

AC16（Linux・WSL2・Windows ネイティブで AC1〜AC14 と AC18 を確かめる）・AC11（別のマシンから TLS で使う）・
AC12（モバイル。実機での検証）・AC17（性能。実機での計測と合否の判断）の実施手順。`packages/e2e` は Linux（chromium）で
のみ自動化されている——**この docs は、自動化できない残りの確認を人手でどう埋めるかをまとめたもの**。確かめる途中で
出会っても不具合ではないもの（今の版の限界）は「既知の制約」にまとめてある。

## 前提

各 OS で以下を用意する：

```sh
pnpm install
pnpm -s build
```

**`soda` というコマンドは PATH に無い**（`@sodashitsu/server` は公開していないワークスペースのパッケージで、上の手順では
どこにも入らない）。実体は `packages/server/dist/main.js` で、リポジトリの直下で `node packages/server/dist/main.js serve …`
のように起動する（使い方は `node packages/server/dist/main.js --help`）。**この docs の `soda …` は
`node <リポジトリ>/packages/server/dist/main.js …` の略**。同じように打てるようにするなら：

```sh
# bash / zsh（リポジトリの直下で実行する。~/.bashrc 等に書くなら $PWD ではなく実際のパスを書く）
alias soda="node $PWD/packages/server/dist/main.js"
```

```powershell
# PowerShell（Windows ネイティブ）。パスは自分の clone の場所に置き換える。関数は定義した窓でしか使えないので、
# 別の窓でも使うなら $PROFILE に書く（notepad $PROFILE で開いてこの行を足す）
function soda { node "C:\src\sodashitsu\packages\server\dist\main.js" @args }
```

`packages/e2e` の自動 E2E（Linux・chromium 前提）は、いずれの OS でも参考として実行できる
（Windows ネイティブでは `node-pty` の ConPTY 経由になるため、Linux の PTY 実装との違いが無いかの手がかりにもなる。
WSL2 ではサーバは WSL の中で Linux として動き、Linux と同じ Unix の PTY を使う——design「WSL2」）。初回は Playwright の Chromium を入れておく（`pnpm --filter @sodashitsu/e2e exec playwright install chromium`）。
spec は 1 つずつ走る（`playwright.config.ts` の `workers: 1`。並列にすると CPU を取り合って落ち、性能計測の値も汚れる。
decisions.md D104）ので、全体で数分かかる：

```sh
pnpm --filter @sodashitsu/e2e test
```

動かし方の注意（詳しくは `docs/tls-setup.md`「起動と運用の注意」）：

- **同じ状態ディレクトリの `soda serve` は 1 つしか動かせない**（ポートが違っても。`soda.lock`）。手元用（7780）と
  LAN 用（8443）を並行して動かすなら、LAN 用に `--state-dir` で別のディレクトリを渡す（または `--session lan` で
  名前付き session にする。下の項目）。2 つ目は
  `soda: the state dir … is already in use by another soda (pid …)` で止まる（終了コード 2）。
- **名前付き session**（`soda serve --session <名前>`。herdr の `--session` 相当。20260926-named-session）：状態は既定の状態
  ディレクトリの下の `sessions/<名前>/`。`--session` を付けなければ今までどおり。並行して動かすなら `--port` も分ける。一覧は
  `soda session list [--json]`、token の作り直しは `soda token reset --session <名前>`、消すのは（止めてから）
  `soda session delete <名前>`。名前は 1〜64 文字の ASCII の英数字と `.` `_` `-`（詳しくは `docs/tls-setup.md`
  「名前付き session」）。止めるのは `soda session stop <名前>`（既定の session は `default`。Ctrl+C と同じ正常な停止。
  Linux・macOS。20260927-session-stop）か、起動した端末で Ctrl+C。
  名前付き session はポートを覚え（`--port` 無しの起動で前回のポート）、`SODA_SESSION` で既定の session を選べ、画面のサイドバーの
  `session: <名前> ⇄` から別の session を新しいタブで開ける（20260926-named-session-ui。詳しくは `docs/tls-setup.md`「画面での session の表示と切り替え」）。
- **画面履歴**（`soda serve --pane-history`。既定は無効。20260926-screen-history-replay）：付けて動かしたサーバを止めて起動し直すと、
  pane に前回の画面と「前回のセッションの画面」の区切りの行が出る。付けずに起動すると `session-history.json` を消す（詳しくは
  `docs/tls-setup.md`「画面履歴の保存と再生」）。
- **更新時の引き継ぎ**（`soda handoff`。Linux・macOS。20260926-live-handoff）：新しい版をビルドしてから `soda handoff` を打つと、pane のプロセスを
  止めずに動いている `soda serve` がディスク上の soda に入れ替わる（詳しくは `docs/tls-setup.md`「更新時の引き継ぎ」。Windows は非対応・macOS は未検証）。
- **`soda token reset` は `soda serve` を止めてから**（動いている間は断る。終了コード 2）。
- **`soda serve` を起動した端末を閉じると soda も終わる**（SIGHUP。`nohup` でも同じ）。検証の途中で端末を閉じるなら
  tmux の中で動かす。
- **scrollback は既定の「自動」でデスクトップのブラウザが 5,000 行（`--scrollback` で変えられる。上限 10,000）、
  スマートフォン等のモバイルのブラウザが 1,000 行**。ブラウザごとに設定（`prefix+s` の「端末」、モバイルは上のバーの「設定」）で
  選べ、数を選んだときは `--scrollback` の値で頭を押さえる（サーバのミラーは `--scrollback` の行数を持つ。メモリの目安は `docs/tls-setup.md`
  「scrollback の行数とメモリ（`--scrollback`）」）。
- **`prefix+e` は、フォーカス中の pane のスクロールバックをサーバの `$EDITOR` で開く**（herdr の `edit_scrollback`。
  20260926-edit-scrollback）。エディタは **`soda serve` を起動したときの環境変数 `EDITOR`**（未設定・空なら `vi`。Windows ネイティブは
  `VISUAL`、無ければ `EDITOR`。どちらも無ければ開けずにトーストが出る）で、サーバの上の新しい pane に拡大表示で開く。エディタを
  終えると元の pane へ戻る。一時ファイルは OS の一時ディレクトリの下の `soda-scrollback-*`（本人だけが読める）に作り、閉じれば消える。
- **独自コマンド**（herdr の `[[keys.command]]`。20260927-custom-command-keys）：状態ディレクトリの `commands.json`（書き方・置き場所は
  `docs/custom-commands.md`。`chmod 600`）に書いたコマンドを、`prefix+s` の節「キー」の群「独自コマンド」で割り当てたキーで走らせる。
  書き換えたら `prefix+shift+r`（設定を読み直す）。コマンドはサーバの上で動く（ブラウザからコマンドの文字列は送らない）。
- **新しい workspace・tab・分割は、既定で「いま見ている pane の、いまの場所」で開く**（herdr の `terminal.new_cwd` の `follow`。
  20260921-new-terminal-cwd）。pane で `cd` してから作ると、その `cd` した先で開く。ブラウザごとの設定（`prefix+s` の「端末」の
  「新しく開く場所」）で、ホーム・サーバを起動した場所・指定した場所（絶対パスか `~/` で始まるパス。`~` だけならホーム。`~user` は
  使えない）に変えられる。選んだ場所が使えない（無い・ディレクトリでない・入れない。「指定した場所」が空・相対パスのときも）ときは
  以前と同じ場所（workspace はサーバを起動した場所、tab はその workspace の場所、分割は元の pane の場所。そこも使えなければサーバを
  起動した場所）で開いてトーストで知らせる。「引き継ぐ」で元の pane の場所が分からない・消えていたときは知らせない（利用者の誤りでは
  ないので）。worktree を開く操作は、方針に関わらず worktree の場所で開く。「いまの場所」の分かり方は OS で違う（Linux は前面の
  プロセスの cwd を読む。macOS と Windows ネイティブはシェルが OSC 7 で知らせた場所だけ——「既知の制約」）。
- **名前を付けていない workspace は、いまの場所から自動で名前が付く**（herdr と同じ規則。20260921-workspace-auto-label）：
  git のリポジトリの中ならその根のフォルダ名（worktree ならその worktree の根）、git の外ならその場所のフォルダ名、ホームなら `~`
  （リポジトリの判定が先——ホームが git のリポジトリ（dotfiles 等）なら `~` ではなくホームのフォルダ名になる）。git のコマンドは使わない
  （`.git` をたどる）。**名前とサイドバーの git の情報（ブランチ・ahead/behind）は、最初の tab の最初の pane（左上の pane）の
  いまの場所に追従する**（20260926-workspace-label-follow-cwd。herdr と同じ）：その pane で別のリポジトリへ `cd` すると、数秒のうちに名前と
  ブランチの両方がそのリポジトリのものになる。ほかの pane・ほかの tab で `cd` しても変わらない。その pane を閉じる・入れ替える・先頭の tab を
  閉じる・並べ替えると、新しい左上の pane の場所になる。右クリックメニューの worktree の操作（一覧・作成・削除）も同じ場所のリポジトリで行う。サーバを起動し直すと、止める前にいた場所から決め直す。「いまの場所」の分かり方は
  新しく開く場所と同じ（Linux は前面のプロセスの cwd。macOS と Windows ネイティブはシェルが OSC 7 で知らせた場所だけ——知らせなければ
  開いた場所のまま）。`Ctrl+B W`（workspace の名前を変更）で名前を付けるとその名前のまま残り、**名前を空にして確定すると自動の名前に戻る**。
  自動の名前のまま変えずに確定しても、名前は固定されない。worktree を開く・作ると、ブランチ名が付く（付けた名前として残る）。
  以前の版で保存した状態から起動すると、名前が「1」の workspace は自動の名前になる（自分で「1」と付けていた workspace も自動になる）。
- **はじめの案内**（herdr の onboarding。20260926-settings-onboarding）：このブラウザで初めて本製品を開いたとき（保存された設定・キー一覧の
  案内の印・エージェントの既読がどれも無いとき）だけ、接続が開いたあとに「soda へようこそ」の案内が 1 回出る。ふつうの画面ではマウスの操作と、prefix・
  キー一覧・設定を開くキー（いまの割り当て）を、1 列の画面（幅 768px 未満）では上のバーの［設定］を案内し、テーマ・キーのプリセット（指で操作する
  端末では出ない）・エージェントの知らせ（画面の中・OS の通知・音）を
  選べる。［この設定ではじめる］で選んだ分だけが設定画面と同じ値で保存され（OS の通知を選んだときはブラウザが許可を求める）、エージェントの知らせの
  あとに出る「OS の通知でも受け取れますか？」の問いかけも出なくなる。［スキップ］か Esc では何も変わらない（問いかけは今までどおり出る）。どちらでも二度と自動では出ない。**すでにこのブラウザで使っていた人には出ない**。自動操作されているブラウザ（Playwright 等。`navigator.webdriver` が true）でも自動では出ない。あとから設定（`prefix+s`）の末尾の
  ［はじめの案内を開く］でいつでも開き直せる（開き直したときの選択は、いまの設定から始まる）。
- **テーマはブラウザごとに選べる**（herdr のテーマ。20260921-theme-settings）：設定（`prefix+s`・サイドバーの［メニュー］→「設定」・
  モバイルの上のバーの［設定］）の「テーマ」で 17 種から選ぶと、画面の枠と開いている全 pane の端末の色がその場で替わる（既定は今までと同じ
  Dracula。ただしブラウザが描く入力欄・ラジオ・スクロールバー・ダイアログのボタンは暗く描くようになり、コントラストのため押された状態のボタンの背景と goto の一覧の
  補足の文字がわずかに変わり、ほかのテーマと規則をそろえるためサイドバーの「未検証」を薄めずに描くようになった（decisions D16））。
  「OS の明暗に合わせる」を入れると、OS（ブラウザ）の明暗に合わせて「明るいとき」「暗いとき」のテーマに切り替わる（既定は選んで
  いるテーマの対。対の無い Dracula・Nord・Vesper の明るいときは Catppuccin Latte）。選んだ内容はこのブラウザに残り、次に開いたときは最初の
  描画からそのテーマで出る。端末の中のアプリが色を問い合わせる（`OSC 11` 等。nvim が背景の明暗を調べる等）と、その tab の大きさを決めて
  いるブラウザのテーマの色で答える。
- **テーマの色を 1 つずつ上書きできる**（herdr の `[theme.custom]` 相当。20260922-theme-custom-overrides）：「テーマ」の
  末尾の折りたたみ「色の個別の上書き（上級者向け）」を開くと、本製品が実際に使う 19 個の色（画面地・メニュー・強調・
  状態アイコン等）それぞれについて、「明るいとき」「暗いとき」の色を入力できる。押した色がそのまま反映・保存される
  （既定のコントラスト調整はかからない）。妥当な色（16 進・`rgb()`・色名等）でなければ理由を示して拒否し、空欄で確定
  すると既定へ戻る。色ごと・すべてまとめて既定へ戻せる（すべては確認あり）。上書きは CSS 変数のキーで持つので、
  テーマを選び直しても・自動切替の入切に関わらず、いま画面に当たっている明暗にその上書きが効き続ける。
- **prefix と各操作のキーを、ブラウザごとに変えられる**（herdr のキー設定。20260921-keybinding-customization）：設定の節「キー」で、prefix と
  34 の操作の割り当てを、押したキーを取り込んで変える（Esc で取り消し）。1 つの操作に複数持てて、prefix の後のキーに加えて**直接のキー**
  （`ctrl+alt+d` のように prefix を押さない 1 打。`ctrl`・`alt`・`cmd` を含むか F キー。端末に入力が向いている通常の状態でだけ効く）も付けられる。
  すでに使われているキー・prefix と同じキー・貼り付け（`Ctrl+Shift+V`。直接のキーにも prefix の後にも）・AltGr で合成された文字は、理由を出して拒否する
  （取り込み待ちの Esc は取り消しで、割り当てにはならない）。AltGr で合成された文字は、実行時にも直接のキーに当てず端末へ通す。
  ［既定に戻す］は操作ごと・prefix・すべて（確認あり）。［herdr のおすすめの直接のキー（ctrl+alt）を足す］で herdr の文書の一式を足せる（環境で届かないキーがある——Linux のデスクトップの一部の `Ctrl+Alt+L`・AltGr で `[` `]` を打つ配列の `Ctrl+Alt+[` `]`。ボタンの脇に注記があり、［変更］で付け替える）。何も変えなければ
  今までのキーのまま（CapsLock を入れて Shift を押した文字キーだけは、shift 付きとして引く。20260921-keybinding-customization の decisions D8）。キー一覧（`prefix+?`）・最初のトースト・
  OS 通知の案内文・モバイルの Prefix ボタンは現在の割り当てに従う。同じブラウザの別のウィンドウで変えた割り当ては、再読み込みなしで（`storage` イベントで）こちらにも届く。**ブラウザ・OS が先に受けるキー（`Ctrl+T`・`Ctrl+N`・`Ctrl+W` 等）は画面に届かないので
  割り当てられない**。

## Linux（CI・手元）

**CI**：`pnpm -s typecheck && pnpm -s lint && pnpm -s test && pnpm -s build && pnpm -s smoke &&
pnpm --filter @sodashitsu/e2e test` が通ることを基準とする（`packages/e2e` はこの OS でのみ全 spec が
自動で走る）。

**手元の追加確認**（自動化していない項目）：

- [ ] `soda serve` を起動し、表示された `soda: open http://127.0.0.1:7780/…` の URL をブラウザで開いてログインできる。
      期待：その状態ディレクトリで初めての起動なら `#token=…` 付きの URL が出て、開くとそのままログインする（token は
      この 1 回だけ表示されるので控えておく）。2 回目以降の起動は `#token=` の無い URL と「token を忘れた場合は…」の行に
      なるので、開いたログイン画面に控えた token を入れる（控えていなければ、`soda serve` を止めて `soda token reset` で
      作り直してから起動し直す）。
- [ ] vim・htop（`terminal-app.spec.ts` は htop がこの検証環境に無いため `top` で代替している。
      decisions.md D90）を実際に起動し、崩れずに全画面表示されることを目視で確認する。
- [ ] 実際の IME（macOS の日本語入力・ibus 等）で変換候補窓の位置・見た目を確認する
      （自動テストは「合成中の文字が表示され、確定で PTY へ届く」までしか確認していない。
      `terminal-app.spec.ts`「IME の合成入力」参照）。
- [ ] 実際の色（256色・TrueColor）をブラウザで目視する（自動テストはバイト列の往復のみを確認しており、
      xterm.js の canvas/WebGL 描画結果そのものは DOM から読めないため検証できていない）。
- [ ] マウス報告（AC4・M11）：マウスを使うアプリ（htop の行のクリック・vim の `:set mouse=a` 後の
      クリックでのカーソル移動等）で、クリック・ホイールがアプリへ届くことを確認する。あわせて、
      マウス報告中でも Shift+クリック（macOS 以外）で報告を送らずに文字を選択できることを確認する
      （自動テストでは合成マウスイベントから SGR レポートを観測できず見送った。decisions.md D90）。
- [ ] 右クリックのアプリへの受け渡し（AC14・M7）の 1——既定の宛先：pane で `printf '\e[?1000h\e[?1006h'; cat -v` を実行し
      （マウス報告を求めるアプリの代わり。届いたマウスの報告が `^[[<…` の形で行に出る）、端末の上で右クリックする。期待：
      pane のメニューが開き、行には何も出ない（既定の右クリックの宛先はメニューなので、右ボタンの報告はアプリへ送らない。
      2026-09-20 に見つけた「メニューと一緒に `^[[<2;…M^[[<2;…m` も届く」不具合は D110 で直した）。Esc で閉じると、
      右クリックした端末へフォーカスが戻り、そのまま打てる。左クリックでは今までどおり `^[[<0;…M^[[<0;…m` が出る。
- [ ] M7 の 2——pane に送る：続けて、メニューの「右クリックを pane に送る」を選び、もう一度端末の上で右クリックする。期待：
      メニューは開かず、行に `^[[<2;<列>;<行>M^[[<2;<列>;<行>m`（`2` は右ボタン、`M` は押した・`m` は離した）が出る。
- [ ] M7 の 3——pane の枠から戻す：`cat -v` を動かしたまま、pane の枠（端末の外周の幅 4px の縁。選ばれている pane には 2px の線が付く。
      ポインタを重ねるとカーソルがメニューの形になる）を右クリックする。期待：行に何も出ずに pane のメニューが開き、項目が「herdr のメニューを使う」に
      替わっている（枠の右クリックは、宛先の設定やアプリのマウス報告に関わらず常にメニューを開く。design の M7・D110）。選ぶと
      既定に戻り、端末の上の右クリックでもメニューが開く（行に何も出ない）。
- [ ] M7 の 4——キーボードで pane のメニュー：`Ctrl+C` で `cat` を止め、`printf '\e[?1000l\e[?1006l'` でマウス報告を止めてから、
      `Ctrl+B v` で右へ分割し、`Ctrl+B h` で左の pane を、`Ctrl+B l` で右の pane を選ぶ（メニューを開きたい pane を prefix のキーで
      選ぶ）。端末の中では Tab・Shift+Tab は端末へ届くので、ブラウザのキーで端末の外へ
      出る（例：F6 か Ctrl+L でアドレスバーへ出て、F6 でページへ戻る。ブラウザの操作で、この手順の作成時には確かめていない）。
      ページの先頭から Tab を押していく。期待：サイドバー（ブラウザによっては止まらない）→ tab バーの tab → 分割の境界（選んだ pane
      より前にあるときだけ）→ **選んだ pane の枠**（焦点の線が出る）の順に止まり、選んでいない pane の枠・端末には止まらない。枠で
      Enter（Space・↓・Shift+F10・ContextMenu キーでも）を押すと、その pane のメニューが開き、↑↓ と Enter で選べる（「右クリックを
      pane に送る」はその pane にだけ効く。選んだら同じ手順で「herdr のメニューを使う」に戻す）。Esc で閉じると枠へ戻り、もう一度 Tab で
      その pane の端末へ入る。終わったら `Ctrl+B x` で分割した pane を閉じる。
- [ ] scrollback の行数（AC5・D107）：**このブラウザの設定の「端末」が「自動」（既定）のまま**確かめる（数を選んでいると、
      ブラウザの行数はその値になる）。pane で `seq 1 6000` を実行し、ホイールで一番上まで遡る。期待：先頭は `1` ではなく
      1000 の少し手前（例 `951`。5,000 行と画面の行数より古い行は消えるので、画面の行数で変わる）。ページを開き直しても
      同じ所まで遡れる（サーバのミラーも 5,000 行を持つ）。`--scrollback 2000` で起動し直したら、**ページを開き直してから**
      もう一度 `seq 1 6000` を実行する。期待：先頭が 4000 の少し手前（例 `3951`）。ブラウザの端末の行数は端末を作ったときに
      決まり、pane の id は起動し直しても同じなので、開いたままのページの端末は 5,000 行のまま（`docs/tls-setup.md`
      「scrollback の行数とメモリ（`--scrollback`）」）。
- [ ] 新しく開く場所（20260921-new-terminal-cwd）：設定の「端末」の「新しく開く場所」が「引き継ぐ」（既定）のまま、pane で
      `mkdir -p /tmp/soda-a && cd /tmp/soda-a` を実行してから `Ctrl+B c`（名前を尋ねるので Enter）で新しい tab を開き、`pwd` を実行する。
      期待：`/tmp/soda-a`。元の pane に戻り、`Ctrl+B v`（分割）と `Ctrl+B N`（新しい workspace）でも同じく `pwd` が `/tmp/soda-a`。
      pane の中で `bash` を入れ子に起動して `cd /tmp` してから作っても `/tmp`（いちばん外側のシェルではなく、前面のプロセスの場所を読む）。
      次に設定で「ホーム」「サーバを起動した場所」を選び、それぞれ新しい tab で `pwd` がホーム・`soda serve` を起動した場所になる
      （既に開いている pane の場所は変わらない）。「指定した場所」を選び、入力欄に `~/` を入れて Enter（保存されるだけでダイアログは
      閉じない）→ Esc で閉じて新しい tab を開く。期待：`pwd` がホーム。入力欄を `/nope` にして同じように新しい tab を開く。期待：
      「新しく開く場所が使えないため、代わりの場所で開きました（設定の「端末」で確かめてください）」のトーストが出て、その workspace の場所で開く。最後に「引き継ぐ」に戻す。worktree を開く操作（workspace のメニュー）は、どの方針でも worktree の場所で開く。
- [ ] はじめの案内（20260926-settings-onboarding）：**新しいプロファイル（またはシークレットウィンドウ）**でログインして開く。期待：端末が出たあとに
      「soda へようこそ」の案内が出て、見出しにフォーカスがある。Tab でテーマ・キーのプリセット・知らせの選択・［スキップ］・［この設定ではじめる］を
      順に辿れ、案内の外（サイドバー・pane）へは出ない。案内が出ている間に文字を打っても端末に入らない。テーマで Nord を、知らせで「音で知らせる」を
      選んで［この設定ではじめる］。期待：案内が閉じ、画面が Nord になり、**そのまま端末に文字を打てる**（フォーカスが端末へ戻る——起動確認が見るのは
      Esc で閉じる経路だけなので、［この設定ではじめる］で閉じる経路はここで見る）。ページを開き直す。期待：案内は出ない。`prefix+s` の末尾の［はじめの案内を開く］で開き直す。期待：テーマは
      Nord・音は入で始まる。Esc。期待：閉じて何も変わらない。**今まで使っていたブラウザ**（案内の足された版に上げる前から使っているプロファイル）では、
      上げたあとに開いても案内は出ない。**モバイル**（実機）では、新しいプロファイルで案内が画面からはみ出さずに出て、キーのプリセットの欄が無く、
      ［スキップ］・［この設定ではじめる］のタップで閉じる。
- [ ] テーマ（20260921-theme-settings）：`prefix+s` で設定を開き、Tab で「テーマ」の選択肢へ移って上下キーで選ぶ（Windows・Linux の Chrome では
      閉じたまま値が変わり、そのたびに画面の枠と端末の色が替わる。macOS では Space で一覧を開いて選ぶ——**macOS の操作は手で確かめる**）。
      期待：サイドバー・tab バー・pane の枠・ダイアログ・端末の文字と背景が選んだテーマになる。明るいテーマ（例 Solarized Light）では、
      設定ダイアログのラジオ・入力欄・スクロールバーも明るく描かれ、入力欄の枠とフォーカスの枠が背景から見分けられる
      （**Firefox・Safari の描き方は自動のテストで確かめていないので、ここで見る**）。ページを開き直す。期待：最初から選んだテーマで出る
      （暗い色が一瞬出ない）。別のブラウザ（別のプロファイル）では Dracula のまま。
- [ ] OS の明暗に合わせる（同）：「OS の明暗に合わせる」を入にし、OS の外観の設定（Windows：設定 → 個人用設定 → 色 → 「モードを選ぶ」。
      macOS：システム設定 → 外観。Linux：デスクトップの外観の設定）を明るい・暗いで切り替える。期待：再読み込み無しで「明るいとき」「暗いとき」の
      テーマに替わり、設定の「いま使っているテーマ」の文も替わる。**Linux ではデスクトップの設定がブラウザに届かない環境がある**（WSL2 の中の
      ブラウザ等）。期待：届かない・OS に明暗の設定が無い環境では、OS 側を切り替えても「明るいとき」のテーマのままで、文が「（OS の設定が
      明るいため）」になる（暗いときのテーマになったら控える）。ブラウザの開発者ツールの「レンダリング」→「prefers-color-scheme をエミュレート」
      でも切り替えを確かめられる。「テーマ」の選択肢でほかのテーマを選ぶと、自動の切替は切れる。
- [ ] 色の問い合わせの答え（同）：明るいテーマ（例 Gruvbox Light）を選んだブラウザで、pane の中（bash）で
      `printf '\e]11;?\a'; read -rs -t 1 -d $'\a' a; echo "${a#*;}"` を実行する（答えは入力として届くので、BEL まで読んで表示する）。
      期待：`rgb:fbfb/f1f1/c7c7` のように、そのテーマの背景（Gruvbox Light なら `#fbf1c7`）。テーマを替えてもう一度実行すると新しいテーマの背景に
      なる。nvim を起動すると、明るいテーマでは `:set background?` が `light` になる。
- [ ] 色の個別の上書き（20260922-theme-custom-overrides）：
      （1）`prefix+s` で設定を開き、「テーマ」で Dracula を選ぶ（暗いテーマ）。折りたたみ「色の個別の上書き（上級者向け）」を開く。
      「強調の色（フォーカスの枠等）」（`--soda-accent` の行）の「暗いとき」の欄に `#ff0000` を入れて確定（Tab で欄から外れる、または Enter）。
      期待：即座にダイアログの強調の色（フォーカスの枠など）が赤くなり、「「強調の色（フォーカスの枠等）」（暗いとき）を #ff0000 にしました。」と出る。
      （2）「テーマ」を Solarized Light（明るいテーマ）に替える。期待：さきほどの赤は消え、既定の色に戻る（「暗いとき」の上書きは
      明るいテーマには効かない）。「画面地の背景」の「明るいとき」の欄に `notacolor` と入れて確定。期待：「「画面地の背景」（明るいとき）：
      notacolor は色として読めません。」と出て、何も変わらない。
      （3）「テーマ」を Dracula に戻す。「強調の色（フォーカスの枠等）」の「暗いとき」に出ている「既定に戻す」ボタンを押す。期待：赤が消えて
      既定の色に戻り、ボタン自体も消える。ページを再読み込みする。期待：一瞬でも既定の色（赤くない）が見えたままである（上書きは
      既に外れているので、これは正常）。
      （4）もう一度「暗いとき」に別の色（例 `#00ff00`）を入れて確定し、ページを再読み込みする。期待：**読み込み直後から**緑になっている
      （一瞬既定の色が出てから緑に変わる、が起きない）。「すべての上書きを既定に戻す」→ 確認で「戻す」。期待：すべての上書きが消える。
- [ ] キーの割り当て（20260921-keybinding-customization）：
      （1）`prefix+s` で設定を開き、節「キー」の prefix の［変更］を押して `Ctrl+A` を押す。期待：「prefix を ctrl+a にしました。」が出て、取り込みの部品が消え、
      フォーカスが［変更］へ戻る。Esc で設定を閉じる。
      （2）pane で `cat -v` を起動する。`Ctrl+B` を押す。期待：`^B` が出る（旧い prefix は端末へ届き、prefix には入らない）。`Ctrl+A` を押す。期待：画面の下の中央に「PREFIX」の帯が出る。
      続けて `Ctrl+A` を押す。期待：帯が消えて `^A` が出る（2 度押しは prefix のキー自身を端末へ送る）。もう一度 `Ctrl+A` → `c`。期待：新しい tab の名前を尋ねるダイアログが出る（Esc で閉じる）。
      （3）`Ctrl+A` → `s` で設定を開き（prefix は ctrl+a になっている）、右へ分割の行を開いて［追加：直接］→ `Ctrl+Alt+D`。期待：「「右へ分割」に ctrl+alt+d を割り当てました。」
      （設定の中で押しているので、分割はされない）。Esc で閉じ、pane で `Ctrl+Alt+D` を押す。期待：prefix なしの 1 打で右へ分割され、`cat -v` に文字は出ない。
      （4）設定を開き直し、goto の行を開いて（行の見出しを押す）［追加：prefix の後］→ `v`。期待：「右へ分割」が使っていると理由が出て、goto の割り当ては変わらない。
      （5）［すべて既定に戻す］→［戻す］。期待：prefix が ctrl+b に戻る。
      （6）同じブラウザで 2 つ目のウィンドウを開き、片方で prefix を `Ctrl+A` に変える。期待：もう片方も再読み込みなしで `Ctrl+A` で prefix に入る（別のウィンドウの変更は `storage` イベントで届く。単体は合成のイベントまで）。
      **自動のテストは Linux の Chromium だけなので、次を環境ごとに手で確かめる**：
      **Firefox・Safari**——（1）の取り込み待ちで Esc を 1 回押し、取り込みだけが取り消されて**設定画面が閉じない**こと。［すべて既定に戻す］の確認が出ているときの Esc も、確認だけが閉じて設定画面が閉じないこと。
      **Windows（特に Firefox）**——`Ctrl+Alt+D` と `Ctrl+Alt+Shift+D`（大文字で届く）が取り込めること（Ctrl+Alt は AltGr と同じに見えるので、拒否されないこと）。［herdr のおすすめ］を足したあと `Ctrl+Alt+Shift+D` で下へ分割できること。ドイツ語などの AltGr の配列では `AltGr+Q`（`@`）が
      「AltGr で入力する文字は…」と拒否されること。［herdr のおすすめの直接のキー］を足したあとも、`AltGr+8`・`AltGr+9`（`[`・`]`）が端末に打てること。**Windows・Linux**——取り込み待ちで `Ctrl+T`・`Ctrl+W` を押しても何も取り込まれない（ブラウザが先に処理する）こと。
      **macOS**——`Option+D`（QWERTY 配列）が `alt+d` として取り込まれ、`∂` にならないこと。`Cmd+T`・`Cmd+W` はブラウザが先に受けるので取り込まれず、`Ctrl+T` は画面に届いて取り込める
      （`ctrl+t` として。端末のアプリが使うキーなので、割り当てる前に確かめる）こと。IME を有効にしたまま取り込み待ちに入り、変換中のキーが取り込まれないこと。
- [ ] キーバインドのプリセット（20260922-keybinding-presets）：
      （1）`prefix+s` で設定を開き、節「キー」の一括操作の `<select>` で「tmux 風」を選び、［足す］を押す。
      期待：案内文に「tmux 風を N 個足しました：…」（`prefix+%` 等を含む）が出て、右へ分割の行の割り当てに
      `prefix+v / prefix+%` が並ぶ。
      （2）Esc で閉じ、pane で `Ctrl+B` → `%` を押す。期待：`prefix+%` で右へ分割される（既存の `prefix+v` と同じ動作）。
      （3）設定を開き直し、`<select>` を既定（「herdr のおすすめの直接のキー（ctrl+alt）」）へ戻して［足す］を押す。
      期待：案内文に「herdr のおすすめの直接のキー（ctrl+alt）を … 個足しました」（まだ足していない分だけ）。
      （4）［すべて既定に戻す］→［戻す］。期待：tmux 風・herdr のおすすめ双方の追加分が消え、右へ分割は
      `prefix+v` だけに戻る。`<select>` は既定（先頭）のまま。
      **自動のテストは Linux の Chromium だけなので、次を環境ごとに手で確かめる**：
      **Firefox・Safari・Windows・macOS**——`<select>` の開閉・矢印キーでの選択が、既存のキー取り込み待ち
      （節「キー」の他の部分）や設定ダイアログの Esc 閉じと干渉しないこと（20260921-keybinding-customization
      で確かめた挙動が、この `<select>` を挟んでも変わらないこと）。
- [ ] キーの設定の使い勝手（20260922-keybinding-usability）：**AC1〜AC7・AC9・AC11・AC14・
      AC-I1〜AC-I12 は `packages/e2e` の `key-bindings.spec.ts` が自動で確かめている
      （Linux・Chromium）ので、ここでは自動で確かめられない AC8・AC12・AC13 だけを手で確かめる**。
      **macOS（AC8）**——非 US 配列（Dvorak・QWERTZ・AZERTY のいずれか）のキーボードで、
      Chromium 系ブラウザ（Chrome・Edge 等。Safari・Firefox は `getLayoutMap()` が無いので対象外）
      を開き、`prefix+s` → 節「キー」で `alt+…` を含む割り当て（例：右へ分割に
      ［追加：直接］→ `Option+D` を割り当てる）を作る。期待：一覧の表示が、実際に押した物理キーの
      字（配列上で `D` の位置にある字）に置き換わる（QWERTY の `d` のままではない）。取り込み・
      保存される chord 自体（`localStorage` の `soda.prefs.v1`）は `alt+d` のまま変わらないこと
      （表示専用。AC10 は自動で確かめ済みだが、実機の `localStorage` でも目視すると確実）。
      US 配列に戻す・`getLayoutMap()` の無いブラウザ（Firefox・Safari）で開き直すと、表示が
      QWERTY の位置の字（例 `alt+d`）に戻ること（AC9 の実機確認）。
      **全画面での Keyboard Lock（AC12・AC13）**——設定の switch（「全画面のとき、ブラウザ予約
      キーも使う」）を有効にし、節「キー」で `Ctrl+T` を右へ分割等の操作へ直接のキーとして
      割り当てようとしても、この時点（全画面でない）ではブラウザが先に受けて取り込まれないこと
      をまず確認する（AC-I12 の裏付け）。次にブラウザを全画面にし（F11 等）、`Ctrl+T` を押す。
      期待：新しいブラウザタブが開かず、画面に割り当てた操作が実行される（またはそのキーへ
      割り当てられる）。全画面を抜けると、`Ctrl+T` はまたブラウザが新しいタブを開く（AC13）。
      **この確認は `packages/e2e` では自動化できない**——ヘッドレス Chromium で `lock()`/`unlock()`
      の呼び出し自体は自動で確かめているが（`key-bindings.spec.ts`）、「実際にブラウザが
      `Ctrl+T` を横取りしなくなったか」という効果はブラウザの外側の挙動で、Playwright からは
      観測できない（`.aidev/works/20260922-keybinding-usability/decisions.md` D6）。
      switch が無効・API の無いブラウザ（Firefox・Safari）では、全画面でも `Ctrl+T` は今までどおり
      ブラウザが先に受けること（AC14 の「効果が無いことが分かる」側）。
- [ ] workspace の自動の名前（20260921-workspace-auto-label）：設定の「端末」の「新しく開く場所」が「引き継ぐ」（既定）で、ホームが git の
      リポジトリでないこと（`~` を見る手順のため）を前提に、
      `Ctrl+B v` で分割した右の pane で `mkdir -p /tmp/soda-repo/sub && git -C /tmp/soda-repo init -q && cd /tmp/soda-repo/sub` を実行してから `Ctrl+B N`
      （新しい workspace）。期待：サイドバーの新しい行が `soda-repo`（`sub` ではなくリポジトリの根の名前。「1」は一度も出ない）。
      同じサーバを別のブラウザ（別のタブでよい）で開いていれば、そちらにも再読み込みなしで `soda-repo` の行が出る。
      `Ctrl+B W` で名前を `mine` にして Enter → 両方のブラウザで `mine`。もう一度 `Ctrl+B W`（入力欄の下に「空にして確定すると、
      自動の名前…に戻ります」と出る）で名前を消して Enter → 両方で `soda-repo` に戻る。もう一度 `Ctrl+B W` を開くと「いまは自動の
      名前です。」と出る（何も変えずに Enter しても、自動のまま——固定されない）。
      `Ctrl+B v` で分割し、右の pane で `cd /tmp && mkdir -p soda-plain && cd soda-plain` → `Ctrl+B N` で `soda-plain`。もう一度 `Ctrl+B v` で分割し、
      右の pane で `cd ~` → `Ctrl+B N` で `~`（どちらも分割した pane で `cd` する——左上の pane で `cd` すると、その workspace の名前も移った先に
      追従する。20260926-workspace-label-follow-cwd）。サイドバーの `soda-plain` の
      行を右クリックして「名前の変更」で `keep` と付ける（`Ctrl+B W` は表示中の workspace——いまは `~`——が対象）。最後に `soda serve` を
      止めて `rm -rf /tmp/soda-repo/.git` してから起動し直す。期待：自動の名前だった `soda-repo` の workspace は `sub`（git の外になったので
      フォルダ名）になり、`keep` はその名前のまま戻る。
- [ ] workspace の名前と git の情報の追従（20260926-workspace-label-follow-cwd）：`mkdir -p /tmp/soda-a /tmp/soda-b/sub && git -C /tmp/soda-a init -q -b main
      && git -c user.name=soda -c user.email=soda@example.invalid -C /tmp/soda-a commit -q --allow-empty -m a && git -C /tmp/soda-b init -q -b other
      && git -c user.name=soda -c user.email=soda@example.invalid -C /tmp/soda-b commit -q --allow-empty -m b`
      を用意し、名前を付けていない workspace の左上の pane で `cd /tmp/soda-a`。期待：数秒のうちにサイドバーの行が `soda-a`・ブランチ `main`。
      `cd /tmp/soda-b/sub` → `soda-b`・`other`（同じサーバを開いたほかのブラウザでも再読み込みなしで同じ）。`cd /tmp` → `tmp` になりブランチの行が消える。
      `Ctrl+B v` で分割し、右の pane で `cd /tmp/soda-a` しても名前とブランチは変わらない。左の pane を閉じると、数秒のうちに `soda-a`・`main` になる。
      `Ctrl+B W` で `mine` と付けてから、残った pane で `cd /tmp/soda-b` → 名前は `mine` のまま、ブランチだけ `other`。`Ctrl+B W` で名前を消して Enter → `soda-b`
      （開いた場所の名前ではない）。最後に `soda serve` を止めて起動し直す → `soda-b`・`other` で戻る。
- [ ] claude・codex 以外のエージェント（AC6。実物で確かめたのは Claude Code と Codex だけ）：`soda serve` の起動時のログの行
      `{"ts":"…","level":"info","msg":"agent manifests loaded","ok":22,"total":22}` で、判定のルールが 22 種すべて読めている
      ことを確かめる。手元で使っているエージェントがあれば 2〜3 種（例：`gemini`（Gemini CLI）・`opencode`（OpenCode）・
      `copilot`（GitHub Copilot CLI）・`cursor-agent`（Cursor Agent）・`amp`（Amp）・`qwen`（Qwen Code）。全部の名前は
      `packages/server/src/agent/agents.ts` の `AGENTS`）を pane で起動し、ふだんどおりに使う。期待：サイドバーの agents の区画に
      行が出て、名前の横に「未検証」と出る。行の印は、動いている間は黄の ◐（working）、承認を求めると赤の ×（blocked）、止まって入力を
      待つと青灰の ○（idle）になり、別の pane を見ている間に終わると緑の ✓（done。その pane を表示すると idle に戻る）
      （既定は色と記号の併記。設定の「表示」で記号を切ると、以前の色の丸になる）。行のクリックで
      その pane へ移る。行が出ない・状態が違う（承認を求めているのに黄のまま等）ときは、エージェントの名前・版とその時の画面を
      控える（判定は herdr のルール `third_party/herdr/agent-detection/*.toml` のまま。直すのは後続「エージェント対応の拡充」）。
      Windows ネイティブで使うエージェントがあれば、そちらでも同じように確かめる（前面プロセスの見つけ方が違う。下の
      「Windows ネイティブ（WSL2 の母艦の Windows で直接）」）。
- [ ] 別のマシンからの TLS 接続（AC11）：下の「別のマシンからの TLS 接続（AC11）」の「Linux」。
- [ ] pane の枠・隙間の太さ（20260922-appearance-settings-rest。AC9・decisions.md D8）：pane を
      1つ以上右へ分割（`Ctrl+B v`）してから、設定の「表示」で枠・隙間の太さを「細い」→「太い」と
      切り替える。期待：pane の間の隙間・端末の周りの余白が目視で明確に変わり、コンソールに
      エラーが出ない（開発者ツールで確認）。`tput cols`/`tput lines` を分割前後・太さ変更前後で
      打ち比べ、実際に列・行数が変わることがあれば、それが PTY のリサイズが実際に飛んだ証拠
      （px の実測次第でセルの境界を跨がず列・行数が変わらないこともあるが、その場合もクラッシュ・
      エラーが起きていなければ問題ない。自動テスト`appearance-settings.spec.ts`は後者〔クラッシュ・
      エラーが起きないこと〕を軸に確認している）。
- [ ] pane の枠の表示・隙間（20260926-pane-frame-auto-mode。AC1〜AC5・AC-I5）：設定の「表示」で
      「pane の枠の表示」を「分割しているときだけ」にする。期待：pane が 1 つの tab では端末の周りの余白と
      選択の強調が消え、`Ctrl+B v` で分割すると両方の pane に枠が戻る（zoom しても枠は残る）。
      「表示しない」にすると外周の余白が消え、分割の境界の両側にだけ余白が残る。続けて「pane の間に隙間を
      空ける」を切ると、pane が境界の線に直接接する。どの組み合わせでも `tput cols`/`tput lines` を打ち比べ、
      コンソールにエラーが出ないこと（余白の変化は 1 辺 2〜6px なので、セルの境界を跨がず列・行数が変わらないことも
      ある。その場合もクラッシュ・エラーが無ければ問題ない）。枠の無い pane で、端末の外（サイドバーや tab バー）から Tab を
      押して選んでいる pane の枠へ移ると、端末の上に文字色の線が重なってフォーカスが見え、Enter でメニューが
      開くこと（単体テストは DOM・class・style まで。実画面の見え方と cols/rows の変化は未確認）。
- [ ] エージェントの会話の再開（20260923-agent-session-resume。AC1〜AC6）：実際に Claude Code
      （または Codex）がインストールされた環境で確認する（単体テストは hook のペイロード・
      非破壊マージ・復元時のコマンド投入を検証しているが、実物の CLI との結線は未検証）。
      設定の「エージェント連携」で対象を導入 → `~/.claude/settings.json`（Codex は
      `~/.codex/hooks.json`）に本製品のフックが1件追記されたことを確認 → pane で `claude`
      （`codex`）を起動し、何かひとこと話しかける → `soda serve` を Ctrl+C で止めて同じコマンドで
      起動し直す → その pane が自動で `claude --resume <id>`（`codex resume <id>`）を実行し、
      直前の会話が復元されることを確認する。あわせて：
      - 同じ cwd に Claude Code の pane を2つ以上開いた状態で確認し、両方が別々の会話として
        正しく再開すること（AC5。design D11 の前提——ID なし方式〔`--continue`〕では区別できない
        問題を、pane ごとに一意な会話IDで解決したはずの箇所）。
      - 会話を終えて（`exit`・Ctrl+D 等）プレーンなシェルに戻した pane は、再起動しても再開されない
        こと（design D9）。
      - 設定の「エージェント連携」で解除すると、書き込んだフックのエントリだけが消え、
        手動で足した他の hook（あれば）が残ること。
- [ ] エージェントの会話の再開・Claude Code・Codex 以外の7エージェント（20260923-other-agents-session-resume。6エージェント＋20261007-agent-hook-drift で Qoder CLI。
      AC1〜AC8。**この6エージェントとも本開発環境には実機が存在せず、この work のコーディング中は
      一度も実機確認できていない**——単体テストは各エージェントの公式ドキュメントの記述どおりに
      設定ファイル・hook エントリが書き込まれることだけを検証しており、実物の CLI との結線は完全に
      未検証）：Cursor Agent CLI・GitHub Copilot CLI・Devin CLI・Droid・Grok CLI・Qwen Code のいずれかが
      実際にインストールされた環境があれば、上の Claude Code・Codex と同じ手順（導入→設定ファイルへの
      書き込み確認→会話を進める→サーバ再起動→自動再開の確認→複数 pane での独立性→解除）で確認する。
      各エージェントの exact な設定ファイルパス・hook エントリの形は `.aidev/works/
      20260923-other-agents-session-resume/research.md` F4 の表を参照。
      - **Devin CLI**（20261007-agent-hook-drift で直した）: `~/.config/devin/config.json`
        （Windows は `%APPDATA%\devin\config.json`）の `hooks.SessionStart` に書く。2026-10-07 に公式文書
        （`docs.devin.ai/cli/extensibility/hooks/overview`）で確認。**文書だけで確認。実機は未確認**。
        コメントつきの `config.json` には導入できない（断る）。`XDG_CONFIG_HOME` は見ない。以前の版が書いた
        `~/.devin/hooks.json`（`DEVIN_CONFIG_DIR` も）は推測だったので、「導入済み（更新が必要）」と出て、
        ［更新］で新しい場所へ入れ直される（古いファイル・スクリプトは除かれる）。
      - **Grok CLI**: 入れ子の形（`{hooks:[{type,command,timeout}]}`、`matcher` なし）に替えた。以前の版の
        平らな形は、「導入済み（更新が必要）」と出て、［更新］で入れ子に入れ直される。平らな形を現行版が
        受けるか、古い版が入れ子を受けるかは未確認。実機は未確認。
      - **Qoder CLI**（`qodercli`）: `~/.qoder/settings.json`（`QODER_CONFIG_DIR` に従う）の
        `hooks.SessionStart`、`matcher` なし・`async:true`。再開は `qoder --resume <id>`。文書だけで確認。
        実機は未確認。
      - 手で確かめる: 以前の版で導入した Grok・Devin が「導入済み（更新が必要）」と出ること、［更新］の後に
        消えること。claude・codex 以外の報告も pane の会話 ID に記録されること（受け口の修正）。
      - 形の一覧の出どころ: `.aidev/works/20261007-agent-hook-drift/research.md`。
      - GitHub Copilot CLI・Grok CLI は本製品専用のファイル（`soda-agent-report.json`）を
        hooks ディレクトリへ新規作成する方式（他のエージェントは既存の設定ファイルへ追記する方式）。
        既存の他の hook 設定（あれば）が変更されないことも確認する。
- [ ] pane 名の legend 表示（20260923-pane-name-dnd-swap。AC1〜AC3）：設定の「表示」で
      「エージェント名」を有効にし、pane を2つ以上に分割する。期待：各 pane の枠に沿って名前が
      埋め込まれた見た目（legend 風）になり、フォーカス中の pane だけ強調色になる（名前の無い
      pane には枠自体が出ない——decisions.md D9）。名前ラベルの上での**右クリックでも従来どおり
      pane のメニューが開く**こと（review 指摘で見つかった回帰の確認）。枠のクリック・端末そのもの
      への操作には影響しないこと（AC-I5）も併せて確認する。`tput cols`/`tput lines` を有効化前後で
      打ち比べると、legend の余白ぶん行数が1行減ること（PTY のリサイズが実際に飛んだ証拠。
      decisions.md D7）。
      **ドラッグの本体は 20260924-pane-dnd-split-move で分割・分割解除に置き換わった（下の項目）
      ——「ドロップすると2つの pane の内容が入れ替わる」という以前の挙動はもう無い（decisions.md
      D4。review 指摘で見つかった記載漏れ）。**
- [ ] tab バーの tab のドラッグでの並べ替え（20261008-web-tab-dnd。AC1〜AC9・AC-I1〜AC-I5。ブラウザ版のデスクトップの画面）：
      tab を 3 つ以上作り、tab をつかんで別の位置で離すと、入る位置に線が出て（つかんだ tab は薄くなる）、離すとそこへ入り、
      つかんだ tab が選ばれて端末にフォーカスが戻ること。`Esc`・tab バーの外（端末の上）・つかんだ tab の上で離すと、順も選択も変わらないこと。
      クリック・右クリックのメニュー・ホイールでの切り替えは今までどおりであること（6px 未満の動きはクリック扱い）。tab が多くてあふれるときは、
      列の端へ近づけると自動でスクロールすること。別のブラウザの tab バーにも再読み込みなしで反映されること。tab バーを「下」にしても同じであること。
      ドラッグ中はキー操作が効かないこと。pane の名前を tab へ落とす移動は今までどおり（落とし先の tab が強調され、tab の順は変わらない）。
      タッチ（指のなぞり）とモバイルの 1 列の画面では並べ替えが始まらないこと。ペン（`pointerType: "pen"`）は未確認
      （横になぞるとブラウザのパンで `pointercancel` が出て取り消される見込み）。
- [ ] pane を別の workspace へ移せるのを同じ worktree の間だけにする（20261008-web-tab-dnd。AC11〜AC19。ブラウザ版・端末版）：
      同じリポジトリの本体と linked worktree の workspace、別のリポジトリの workspace、管理外のフォルダの workspace を 2 つ、同じフォルダを開いた workspace を 2 つ用意し、
      tab を 2 pane にして pane に名前を付け（設定で「エージェント名」を出す）、名前をつかんで動かす。ブラウザ版: ドラッグが始まると、別の worktree・別のリポジトリ・
      場所の違う管理外の行が薄くなり、同じフォルダの行と自分の行は薄くならない。落とせる行（同じフォルダの行と自分の行）には左の縁の線と淡い背景の印が付き、薄い行の上では何の枠も出ない（落とせるようには見えない）、落とせる行の上では破線の枠。離すと、
      薄い行へは動かず「別の worktree の workspace へは移せません」と出て、表示も変わらない。同じフォルダの 2 つ目の workspace の行へは、その新しい tab へ移る。
      管理外のフォルダを同じ場所で開いた 2 つの間は移り、git の workspace へは断られる。自分の workspace の行へ落とすと、新しい tab へ切り出される（今までどおり）。
      `Esc` で薄さが全部消える。端末版: 同じ操作で、別の worktree の行へ落とすと同じ文言が出て何も動かない（行の強調は出ない）。
      同じ workspace の別の tab へ落とす移動は今までどおり。畳んだグループの中にある行へは落とせない（広げてから落とす）。
- [ ] pane の D&D 分割・分割解除（20260924-pane-dnd-split-move。AC1〜AC11・AC-I1〜AC-I5）：
      名前ラベルをポインタで掴んで、別の pane の**縁**（上下左右のどれか。中心から見て外側30%）へ
      ドラッグ＆ドロップすると、ドロップ先がその方向に分割され、ドラッグした pane がそこへ移る
      こと（AC1〜AC4。ドラッグ中、縁に近づくとその方向のハイライトが出る）。別の pane の**中央**
      （残りの40%）へドロップすると、ドロップ先の pane が閉じられ、ドラッグした pane がその位置
      とスペースを引き継ぐこと（AC5・AC6。中央のハイライトは縁と違う色〔赤系〕になる——破壊的な
      操作であることの合図）。**ドロップ先が動作中（busy）のときは、確認ダイアログを経由してから
      閉じること**（既存の pane を閉じるときの busy 確認〔D23〕と同じ形。review 指摘 must）。
      いずれの操作後もフォーカスはドラッグした pane に残ること（AC8）。範囲外・自分自身への
      ドロップ、または Esc で取り消すと何も起きないこと（AC9・AC-I2）。複数のブラウザ（別タブ）で
      同じ tab を開いておくと、一方の分割・分割解除がもう一方にも反映されること（AC10）。
      既存のキーバインドでの分割・pane を閉じる操作は変わらず使えること（AC11・AC-I3）。
- [ ] 画面履歴の保存と再生（20260926-screen-history-replay。AC1・AC2・AC4・AC6 の手動確認。自動のテストは実 PTY の結合テストで同じ往復を見ている）：
      `soda serve --pane-history` で起動し、ブラウザで pane に `printf '\033[31mred-line\033[0m\n'; seq 1 200` を実行してから Ctrl+C で止める。
      `ls -l <状態ディレクトリ>/session-history.json` が `-rw-------`。同じく `--pane-history` を付けて起動し直してブラウザを開き直すと、
      その pane に赤い `red-line` と `1`〜`200`（上へスクロールして見える）、その下に薄い色の `--- 前回のセッションの画面（… に保存）---`、
      その下に新しいプロンプトが出る。pane で `vim` を開いたまま止めて起動し直すと、vim の画面ではなく vim を開く前の履歴が出る。
      続けて `--pane-history` を付けずに起動すると、`session-history.json` が消え、pane は空の新しいシェルになる。
- [ ] 更新時の引き継ぎ（20260926-live-handoff。AC1〜AC5・AC7・AC8 の手動確認。自動では smoke〔`node packages/server/dist/handoffSmoke.js`〕が同じ往復を見ている）：
      `soda serve` で起動し、ブラウザで pane に `sleep 1000 & echo $$ $!` と `seq 1 200` を実行し、別の pane で `vim` を開いておく。
      `pnpm build` の後に別の端末で `soda handoff` → `handoff complete: N pane(s) kept running`。ブラウザは「再接続中…」の後に同じ画面に戻り、
      `seq` の出力が上へスクロールして見え、`echo $$` が同じ pid を出し、`jobs` に `sleep` が残り、vim は描き直されて操作できる。
      `ps -o pid,stat,cmd --ppid <soda の pid>` で pane のシェルが同じ pid のまま。pane で `exit` すると pane が閉じる（その後の `ps` にそのシェルが
      `<defunct>` で残るのは既知の制約）。`ls <状態ディレクトリ>` に `handoff.json` が残っていない。
      新しい版の確かめが通らない状態（例: `packages/server/dist/handoff/HandoffManifest.js` の `HANDOFF_FORMAT_VERSION` を一時的に 2 にする）で
      `soda handoff` → 終了コード 1 で `the handoff format differs` が出て、サーバは同じ pid のまま pane も動き続ける（確かめたら元に戻す）。
- [ ] スクロールバックを `$EDITOR` で開く（20260926-edit-scrollback。AC1〜AC4・AC6・AC8。AC5・AC7 は単体テストで確かめる）：
      `EDITOR=vim soda serve …` で起動し、pane で `seq 1 3000` を実行してから `Ctrl+B e` を押す。期待：同じ tab に拡大表示の pane が
      開き、vim に 1〜3000 の行（スクロールバックに押し出された行を含む。末尾は `seq` の後のプロンプト）が色の制御列なしで出る。
      vim の中で `:!ls -ld "$(dirname %)" %` を実行すると、ディレクトリが `drwx------`、`scrollback.txt` が `-rw-------`
      （場所は OS の一時ディレクトリ。`TMPDIR` を設定していなければ `/tmp/soda-scrollback-*`）。`:q` で抜けると pane が閉じ、焦点が
      元の pane へ戻り（打った文字が元の pane に出る）、`ls -d /tmp/soda-scrollback-*` が何も見つけない。元の pane を `Ctrl+B z` で拡大表示にしてから同じ操作をすると、抜けた後も元の pane が
      拡大表示のまま。`vim` を開いた中（代替画面）で `Ctrl+B e` を押しても、vim を開く前の履歴が開く。`EDITOR='code -w'` のような
      引数付きの値でも開ける（VS Code の Remote 等で `code` が使える環境だけ）。エディタの pane を `Ctrl+B x` で閉じても一時ファイルは消える。
- [ ] 名前付き session の画面・ポートの記憶・`SODA_SESSION`（20260926-named-session-ui。E2E・実機のブラウザでは未検証。Linux・WSL2 の手順。
      Windows ネイティブは下の節）：`soda serve`（既定の session）と `soda serve --session work --port 7781` を並行して起動し、**同じブラウザ**で
      `http://127.0.0.1:7780/` と `http://127.0.0.1:7781/` の両方にログインする。`work` のタブのタイトルが `<ホスト名> [work]: …` で
      サイドバーの最上段に `session: work ⇄` が、既定の session のタブに `session: default ⇄` が出ること、**片方にログインしても他方が
      ログアウトされない**こと（両方のタブを再読み込みしてもログイン画面にならない）を確かめる。既定の session のタブで `session: default ⇄` を
      Tab で選んで Enter → 一覧が開き `work` が選ばれていること、Enter で新しいタブに `http://127.0.0.1:7781/` が開くこと（ポップアップとして
      止められない）、もう一度開いて Esc で閉じるとフォーカスがボタンに戻ること（続けて Enter でまた開く）を確かめる。`work` を Ctrl+C で止め、
      `soda serve --session work`（`--port` 無し）で起動し直すと 7781 で待ち受け `soda: session work が前回使ったポート 7781 …` の行が出ること。
      `work` を止めて `SODA_SESSION=work soda token reset` が `work` の token を作り直すこと、`SODA_SESSION=a/b soda serve` が何も作らずに
      止まり終了コード `2` で案内に `SODA_SESSION` が出ること、`work` の pane で `echo $SODA_SESSION` が `work` を、既定の session の pane では空を出すこと。
- [ ] `soda session stop`（20260927-session-stop。起動確認 `stopSmoke.js` で Linux の通しは確かめ済み。macOS は未検証。Linux・WSL2 の手順）：
      `soda serve --session work --port 7781 --pane-history` を tmux の別の窓等で起動し、ブラウザで pane に何か表示してから、別の端末で
      `soda session stop work` を打つ。`soda: stopped session work` が出て `echo $?` が `0`、起動した窓に
      `soda: stop requested (soda session stop), shutting down` が出てプロンプトに戻ること、`soda session list` の `work` が `stopped` で、
      もう一度の `soda session stop work` が `session work is not running` と終了コード `3` になることを確かめる。同じ引数で起動し直すと
      レイアウトと前回の画面が戻ること。`soda session stop work --json` の 1 行の JSON、`soda session stop nope` が終了コード `2`、
      `work` の pane の中で `soda session stop work` を打つとサーバとその pane のシェルごと止まる（結果の行が出なくてもよい）こと、`soda handoff --session work` の
      直後（引き継ぎの最中）に打つと「引き継ぎが終わってからもう一度」の案内（時機によっては入れ替わりの途中で `did not accept a stop request` の案内）で `1` になり、サーバは動き続けることも見る。
- [ ] Windows の named pipe の権限限定（`AgentReportSocket`。design D5）：Unix の `chmod 0600` に
      相当する対策が Windows では未実装（既知の制約。同 work の decisions.md 参照）。Windows
      ネイティブで確認する場合、同じホストの別ユーザーから report socket へ接続できないことを
      確かめてから使う。

## WSL2（手元）

Windows 上の WSL2 で `soda serve` を動かす構成。`docs/tls-setup.md`「手順3（WSL2 のみ）：LAN・スマートフォンへ出す」
の設定を先に済ませておく。

- [ ] WSL2 内で `soda serve` を起動し、**同じ Windows（母艦）のブラウザ**から表示された `soda: open http://127.0.0.1:7780/…`
      の URL で開ける（既定の NAT モードでもここは追加設定なしで届く。research.md F9.6）。token の扱いは「Linux」の
      最初の項目と同じ（初回だけ `#token=…` 付き。2 回目以降はログイン画面に token を入れる）。
- [ ] 別のマシンからの TLS 接続（AC11）：下の「別のマシンからの TLS 接続（AC11）」の「WSL2」（mirrored モードか
      NAT＋portproxy のどちらか）。
- [ ] `pane.cwd` の復元（AC18）を確認する：workspace を作り、`cd` してから `soda serve` を再起動し、
      `pwd` で同じディレクトリに戻ることを確認する（design「再起動後の復元」の「pane の cwd」：Linux は `/proc/<pid>/cwd`
      から追従するので WSL2 でも同じ経路のはず——ここは Windows ネイティブと違う点なので、両方で
      確かめる価値がある）。

## Windows ネイティブ（WSL2 の母艦の Windows で直接）

WSL2 を経由せず、Windows 上で直接 `node.exe` を実行して `soda serve` を動かす構成
（`node-pty` は `1.2.0-beta.15`。ConPTY 専用——winpty は使わない。`package.json`）。PowerShell で、リポジトリの直下から
`node packages/server/dist/main.js serve`（以下の `soda` は「前提」の PowerShell の関数）で起動する。

- [ ] `soda serve` を起動し、表示された `soda: open http://127.0.0.1:7780/…` の URL でログインし（token の扱いは「Linux」の
      最初の項目と同じ）、シェル（既定は `powershell.exe`。`--shell` で変えられる。design「起動オプション（`soda serve`）」）が
      実際に起動して入出力できる。
- [ ] pane の cwd 追従と、新しく開く場所の「引き継ぐ」（20260921-new-terminal-cwd・20260928-windows-pane-cwd）を確認する：**Windows は前面の
      プロセスの cwd を読めない**ので、「いまの場所」は**シェルが知らせた場所**（OSC 7、または Windows Terminal の場所の知らせ OSC 9;9）だけ
      （herdr も部分対応。`[H]windows-beta.mdx:62-70`）。そこで本製品は、対話の pane（新規・分割・再起動後の復元）のシェルが
      `powershell.exe`・`pwsh.exe`・`cmd.exe` なら、起動時にプロンプトのたびに今の場所を OSC 9;9 で知らせる設定を差し込む
      （PowerShell は末尾に `-NoExit -EncodedCommand …` を足して既存の `prompt` 関数を包む。cmd は環境変数 `PROMPT` の先頭に
      `$E]9;9;"$P"$E\` を足す。設定「端末 → シェルの場所を追う（Windows）」、既定は入）。**実機では未検証**——次を確かめたらここを更新する:
      - PowerShell 5.1・PowerShell 7（`--shell pwsh.exe`）・cmd（`--shell cmd.exe`）のそれぞれで、pane で `cd C:\Windows`（cmd は `cd /d C:\Windows`）
        してから数秒後に `sodactl pane current` の `cwd` が `C:\Windows` になり、サイドバーの workspace の自動の名前も追従する。
        空白・`#`・`%`・日本語を含むフォルダでも同じ。UNC パスは PowerShell だけ：`cd \\server\share` で `cwd` が `\\server\share` になる
        （cmd は UNC を今の場所にできない。`pushd \\server\share` で割り当てられたドライブ文字〔例 `Z:\`〕が `cwd` になることを確かめる）。
      - そのまま `Ctrl+B c` で新しい tab を開き `Get-Location`（cmd は `cd`）を実行すると `cd` した先になる（設定「新しく開く場所」が「引き継ぐ」のとき）。
      - `cd` した後に `soda serve` を止めて起動し直すと、その pane が `cd` した先のシェルとして開き直される（Claude Code の会話の再開もその場所）。
      - プロファイルの `prompt` 関数（oh-my-posh・starship を含む）と cmd の `PROMPT` の見た目が変わらず、知らせの文字列が画面に出ない。
        起動の遅れが体感できない（目安 +200ms 以内）。
      - 既定（同梱の ConPTY）に加え、`SODA_WINDOWS_CONPTY=system`（OS の ConPTY）で起動したときも場所が追従する（古い Windows 10 の OS の ConPTY は知らない OSC を落とす・順を変えることがある）。
      - 設定を切にした後に開いた pane は差し込まれない（`cd` しても `sodactl pane current` の `cwd` は開いた場所のまま）。既に開いている pane は変わらない。
      - 既知の制約：PowerShell で pane を開いた後に `prompt` を定義し直す（あとから oh-my-posh を初期化する等）と、包みが外れて新しい pane を開くまで追従が止まる。
        直前のコマンドが失敗したとき、oh-my-posh・starship の失敗の表示がそのまま出ることも確かめる（包みは `$?` を保つ）。
      独自コマンドの pane（`docs/custom-commands.md`）と `edit_scrollback` のエディタには差し込まない。ほかのシェル（Git Bash・nushell 等）は、プロンプトで
      OSC 7（`file://host/C:/…` の形を `C:\…` に直して使う。20260921-new-terminal-cwd の decisions D7）か OSC 9;9 を出せば追従する。
      設定を「ホーム」にした新しい tab が `%USERPROFILE%` で開くことも確かめる。
- [ ] workspace の自動の名前（20260921-workspace-auto-label）：起動時に作る最初の workspace が、`soda serve` を起動した場所の名前
      （リポジトリの直下から起動したならリポジトリの根の名前）になる。場所は設定の「新しく開く場所」で選ぶ：「ホーム」にして新しい workspace → `~`（ホームが git のリポジトリでなければ）。「指定した場所」に `C:\` を
      入れて新しい workspace → `C:\`（フォルダ名の無い根はパスそのもの）。「指定した場所」に大小を変えたホームのパス（例
      `c:\users\<名前>`）を入れて新しい workspace → `~`（本製品は大小を問わずホームと見る。herdr は `HOME` 環境変数との完全一致）。
      最後に「引き継ぐ」に戻す。**ホームと根は単体テスト（`path.win32`）で確かめたが、リポジトリの中の根の見つけ方は Windows では
      単体でも確かめていない**——確かめたらここを更新する。
- [ ] node-pty の既知の不具合（research.md F8.1）が実害として出ないか確認する：
      シェル終了ごとに `conhost.exe` が残らないか（#965）、pane を閉じた直後に不具合が起きないか
      （kill の競合 #952・#967）、閉じた pane の resize で例外にならないか（#827）。
      いずれも upstream の既知 issue で、本製品側での回避策は入れていない（decisions.md に記録が
      無ければ、その時点で未対応ということ——見つかったら decisions.md に追記する）。
- [ ] 前面プロセスの検出（AC6・AC7）が Windows でも動く：`node` や `python` 等、既知のエージェント名に
      該当しないプロセスを起動しても誤検出しない／該当するプロセス名なら検出されることを確認する
      （`ProcessMatcher` の Windows 実装は `/proc` の代わりに自前でプロセス走査する。
      `packages/server/src/platform/WindowsProcessInspector.ts`）。
- [ ] 同じ状態ディレクトリの二重起動を止める（`soda.lock`。D103）：上の `soda serve` を動かしたまま、別の PowerShell の窓で
      `soda serve --port 7781` を実行し（`soda` の関数は定義した窓でしか使えない。`$PROFILE` に書いていなければ、その窓でも
      「前提」の `function soda …` を実行してから）、続けて `$LASTEXITCODE` を見る。`soda token reset` も同じく。期待：どちらも何も起動・作成
      せずに止まり、`soda: the state dir …\sodashitsu is already in use by another soda (pid …)`（`token reset` は
      `soda: cannot reset the token: the state dir … is in use by a running soda (pid …)`）が出て、`$LASTEXITCODE` が `2`。
- [ ] 名前付き session（20260926-named-session。Windows ネイティブでは未検証）：`soda serve --session work --port 7781` を
      実行し、`soda: session work（状態ディレクトリ: …\sodashitsu\sessions\work）` の行と token 付きの URL が出ること、
      別の PowerShell の窓で `soda session list` を実行して `work` の行の status が `running`、行末に `(pid …)` と出ることを確かめる。
      続けて同じ窓で `soda session stop work` を実行すると、Windows では非対応の案内が出て `$LASTEXITCODE` が `2`、`work` の soda は
      動き続けること（`soda session list` で `running` のまま。20260927-session-stop）。`soda serve --session con`
      と `soda serve --session "work."` は何も作らずに止まり `$LASTEXITCODE` が `2`。`work` の soda を Ctrl+C で止めてから
      `soda session delete work` を実行し、`…\sessions\work` が消えること（`$LASTEXITCODE` が `0`）、既定の session
      （`soda serve`）の workspace・token がそのままであることを確かめる。
- [ ] 名前付き session の画面・ポートの記憶・`SODA_SESSION`（20260926-named-session-ui。E2E・実機のブラウザでは未検証）：
      既定の session（`soda serve`）と `soda serve --session work --port 7781` を並行して起動し、ブラウザで両方にログインする。
      `work` のタブのタイトルが `<ホスト名> [work]: …` でサイドバーの最上段に `session: work ⇄` が出ること、既定の session のタブにも
      `session: default ⇄` が出ること、**片方にログインしても他方がログアウトされない**こと（再読み込みしてもログイン画面にならない）を
      確かめる。`session: default ⇄` を押して一覧を開き、`work` を Enter で選ぶと新しいタブで `http://127.0.0.1:7781/` が開くこと、Esc で
      閉じるとフォーカスがボタンに戻ることを確かめる。`work` を Ctrl+C で止め、`soda serve --session work`（`--port` 無し）で起動し直すと
      7781 で待ち受け「前回使ったポート」の行が出ること。PowerShell で `$env:SODA_SESSION="work"; soda token reset` が `work` の token を
      作り直すこと（`work` を止めてから）、`$env:SODA_SESSION="a/b"; soda serve` が何も作らずに止まり `$LASTEXITCODE` が `2` で案内に
      `SODA_SESSION` が出ること、`work` の pane で `echo $env:SODA_SESSION` が `work` を出すこと。終わったら `Remove-Item Env:SODA_SESSION`。
- [ ] 落ちて残ったロックを取り直す（pid の生死の判定。D103）：`Get-Content "$env:LOCALAPPDATA\sodashitsu\soda.lock"`
      で中身（1 行目が soda の pid、2 行目がホスト名）を見て、`Stop-Process -Id <1 行目の pid> -Force` で soda を強制終了する
      （落ちたときと同じく、ロックを消さずに終わる）。`Test-Path "$env:LOCALAPPDATA\sodashitsu\soda.lock"` が `True`
      のままであることを確かめてから、もう一度 `soda serve`。期待：`already in use` にならずに起動し（ロックの pid がもう動いて
      いないので取り直す）、ロックの 1 行目が新しい pid になる。ブラウザで開き直すと構成が戻る。強制終了なので、pane のシェル
      （`powershell.exe`）・`conhost.exe` が残っていないかもタスク マネージャーで見る（上の node-pty の項目と同じ見方）。
- [ ] コンソールを閉じたときの終わり方（D103）：`soda serve` を動かしている PowerShell の窓（Windows Terminal ならそのタブ）を
      右上の × で閉じる。10 秒ほど待ってから、新しい PowerShell で `Test-Path "$env:LOCALAPPDATA\sodashitsu\soda.lock"`。
      期待：`False`——soda が閉じる合図（Node では SIGHUP）を受けて `session.json` を書き、ロックを放してから終わった（Windows は
      コンソールを閉じると、約 10 秒後にプロセスを強制的に終わらせる）。その新しい窓で（`soda` の関数を定義してから）起動し直し、
      ブラウザで開くと、閉じる前の構成が戻る。
      `True` なら片付けが間に合わずに終わっている（次の起動はロックを取り直すので使えるが、結果として控えておく）。
- [ ] 別のマシンからの TLS 接続（AC11）：下の「別のマシンからの TLS 接続（AC11）」の「Windows ネイティブ」。

## 別のマシンからの TLS 接続（AC11）

AC16 の 3 環境それぞれで AC11 を確かめる（「Linux」「WSL2」「Windows ネイティブ」の節を 1 つずつ）。**サーバを動かす
マシン**と、**同じ LAN の別のマシン**（PC。スマートフォンは下の「実機」）を用意する。例のポートは 8443、
サーバのマシン（WSL2・Windows ネイティブでは母艦の Windows）の LAN の IP は `192.168.1.50`（自分の環境の値に読み替える）。
どの環境も最後に「共通：AC1〜AC9 の一巡（別のマシンのブラウザで）」と「共通：AC10・AC13・AC14・AC18（AC16）」を行う（Tailscale・リバースプロキシを
使うなら「任意：Tailscale・リバースプロキシ（使う構成だけ）」も）。うまくいかないときは、この節の最後の「うまくいかないとき」。

この節で使う場所（どの環境でも同じ形にそろえる）：

| | Linux・WSL2（bash） | Windows ネイティブ（PowerShell） |
|---|---|---|
| 証明書（`soda.pem`・`soda-key.pem`） | `~/soda-cert` | `$HOME\soda-cert` |
| LAN 用の状態ディレクトリ（`--state-dir`） | `~/.local/state/soda-lan` | `$env:LOCALAPPDATA\soda-lan` |

LAN 用の状態ディレクトリを手元用（既定の状態ディレクトリ）と分けるので、手元用の `soda serve` を止めずに並行して動かせる
（同じ状態ディレクトリの 2 つ目は `already in use by another soda` で起動しない）。**token の表示は、その状態ディレクトリで
初めて起動したときの 1 回だけ**：初回は `soda: open https://…/#token=…` の行が出て、開くとそのままログインする（token を
控えておく）。2 回目以降（同じ環境で起動し直す・WSL2 で mirrored の後に NAT＋portproxy を試す等）は `soda: open https://…/`
と「token を忘れた場合は…」の行になるので、開いたログイン画面に控えた token を入れる。控えていなければ、その `soda serve` を
止めて `soda token reset --state-dir ~/.local/state/soda-lan`（Windows ネイティブは
`soda token reset --state-dir "$env:LOCALAPPDATA\soda-lan"`）で作り直し（`soda: new token: …` と出る）、起動し直す。

### 共通の準備

- [ ] サーバのマシン（WSL2 は WSL2 の中、Windows ネイティブは PowerShell）で、ブラウザが開く IP を SAN に入れた証明書を
      上の場所に作る（`docs/tls-setup.md`「手順1」）。WSL2 では SAN に**母艦の** LAN の IP を入れる（WSL の 172.x ではない）。
      - Linux・WSL2：`mkcert -install`、続けて
        `mkdir -p ~/soda-cert && cd ~/soda-cert && mkcert -cert-file soda.pem -key-file soda-key.pem 192.168.1.50 localhost 127.0.0.1`
      - Windows ネイティブ：`mkcert -install`、続けて
        `New-Item -ItemType Directory -Force "$HOME\soda-cert" | Out-Null; Set-Location "$HOME\soda-cert"; mkcert -cert-file soda.pem -key-file soda-key.pem 192.168.1.50 localhost 127.0.0.1`

      期待：その場所に `soda.pem`・`soda-key.pem` ができる。
- [ ] 別のマシンに mkcert の CA（サーバのマシンで `mkcert -CAROOT` が示すディレクトリの `rootCA.pem` だけ。
      `rootCA-key.pem` は渡さない）を入れる。入れ方は OS・ブラウザごとに違う（`docs/tls-setup.md`「手順1」の mkcert の節：
      PC は `rootCA.pem` を置いたディレクトリを `CAROOT` に指定して `mkcert -install`、Firefox は独自の証明書ストア、iOS はプロファイルを
      入れてから「証明書信頼設定」でオン、Android は利用者の CA として入れる）。WSL2 では、母艦の Windows のブラウザ
      （AC9 で使う）にも同じように入れる（CA は WSL2 の中の mkcert が作ったもので、Windows の信頼ストアには入っていない）。
      期待：後の手順で証明書の警告が出ない（自己署名で代えるなら警告が出るので、例外を承認して進む）。
- [ ] 証明書なしでは LAN へ出せないことを確かめる：`soda serve --host 0.0.0.0 --port 8443`。
      期待：`soda: cannot bind to non-loopback host "0.0.0.0" without a certificate` で終わる（終了コード 2）。

### Linux

- [ ] ファイアウォールを動かしていれば 8443/tcp を開ける（`docs/tls-setup.md`「手順4」の「Linux（ufw・firewalld）」）。
      期待：`sudo ufw status`（または `sudo firewall-cmd --list-ports`）に 8443/tcp が並ぶ。
- [ ] 起動する：
      `soda serve --host 0.0.0.0 --port 8443 --cert ~/soda-cert/soda.pem --key ~/soda-cert/soda-key.pem --state-dir ~/.local/state/soda-lan`。
      期待：`soda: listening on 0.0.0.0 port 8443 (https)`、続けて `soda: open https://localhost:8443/…` と
      `soda: open https://192.168.1.50:8443/…`（LAN の IPv4 ごと）の行が出る（初回だけ `#token=…` 付き。この節の冒頭）。
- [ ] 別のマシンのブラウザで `soda: open https://192.168.1.50:8443/…` の行の URL を開く。
      期待：証明書の警告なしで開き、端末が表示される（初回の `#token=…` 付きの URL ならそのまま。2 回目以降の URL なら
      ログイン画面に token を入れてから）。
- [ ] 平文では入れないことを確かめる：別のマシンで `http://192.168.1.50:8443/` を開く。期待：開けない（エラーの画面）。
- [ ] 下の「共通：AC1〜AC9 の一巡（別のマシンのブラウザで）」と「共通：AC10・AC13・AC14・AC18（AC16）」。

### WSL2

mirrored モード（`docs/tls-setup.md`「方法A」）か NAT＋portproxy（「方法B」）の、使える方の手順を行う。

**mirrored モード**

- [ ] `.wslconfig` に `networkingMode=mirrored` を書き、`wsl --shutdown` の後に WSL2 を起動し直す。
      期待：WSL2 の `ip addr` に母艦の LAN の IP（例 192.168.1.50）が見える。
- [ ] Hyper-V ファイアウォールで 8443 を開ける（管理者の PowerShell。`docs/tls-setup.md`「手順4」の
      「WSL2 の mirrored モード」）：`New-NetFirewallHyperVRule -Name "soda-8443" -DisplayName "soda (8443)" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8443`。
      期待：`Get-NetFirewallHyperVRule -Name "soda-8443"` で規則が表示される。
- [ ] WSL2 で起動する：
      `soda serve --host 0.0.0.0 --port 8443 --cert ~/soda-cert/soda.pem --key ~/soda-cert/soda-key.pem --state-dir ~/.local/state/soda-lan`。
      期待：`soda: open https://192.168.1.50:8443/…`（母艦の LAN の IP）の行が出る（初回だけ `#token=…` 付き。Windows の
      仮想アダプタの 172.x 等の行も並ぶことがある）。
- [ ] 別のマシンのブラウザで `soda: open https://192.168.1.50:8443/…` の行の URL を開く。期待：警告なしで開き、端末が
      表示される（2 回目以降の URL ならログイン画面に token を入れてから）。
- [ ] 下の「共通：AC1〜AC9 の一巡（別のマシンのブラウザで）」と「共通：AC10・AC13・AC14・AC18（AC16）」。

**NAT＋portproxy**

- [ ] 母艦（管理者の PowerShell）で portproxy を張る（`listenport` と `connectport` はどちらも 8443）：
      `netsh interface portproxy add v4tov4 listenport=8443 listenaddress=0.0.0.0 connectport=8443 connectaddress=172.29.160.5`
      （`172.29.160.5` は WSL2 のシェルの `ip addr show eth0` で見た WSL2 の IP に置き換える）。
      期待：`netsh interface portproxy show v4tov4` に 0.0.0.0:8443 → WSL2 の IP の 8443 が並ぶ。
- [ ] Windows のファイアウォールで 8443 を開ける（`docs/tls-setup.md`「手順4」の「WSL2 の NAT＋portproxy」）：
      `New-NetFirewallRule -DisplayName "soda (8443)" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Private`。
      期待：`Get-NetConnectionProfile` の LAN の接続が `Private`（パブリックなら規則が効かない）。
- [ ] WSL2 で起動する：
      `soda serve --host 0.0.0.0 --port 8443 --cert ~/soda-cert/soda.pem --key ~/soda-cert/soda-key.pem --state-dir ~/.local/state/soda-lan --origin https://192.168.1.50:8443`。
      期待：最初の `soda: open` の行が `https://192.168.1.50:8443/…`（`--origin` の URL。初回だけ `#token=…` 付き）。
      続く 172.x の行は母艦からしか開けない。
- [ ] 別のマシンのブラウザで、最初の `soda: open` の行の URL を開く。期待：警告なしで開き、端末が表示される
      （2 回目以降の URL ならログイン画面に token を入れてから）。
- [ ] 下の「共通：AC1〜AC9 の一巡（別のマシンのブラウザで）」と「共通：AC10・AC13・AC14・AC18（AC16）」。

### Windows ネイティブ

- [ ] PowerShell で起動する（`soda` は「前提」の PowerShell の関数）：
      `soda serve --host 0.0.0.0 --port 8443 --cert "$HOME\soda-cert\soda.pem" --key "$HOME\soda-cert\soda-key.pem" --state-dir "$env:LOCALAPPDATA\soda-lan"`。
      期待：`soda: listening on 0.0.0.0 port 8443 (https)` と `soda: open https://192.168.1.50:8443/…` の行が出る
      （初回だけ `#token=…` 付き。`vEthernet (WSL)` 等の Hyper-V の内部スイッチのアドレスは出ない）。`EACCES` で止まったら、そのポートは
      除外ポート範囲にある（`netsh interface ipv4 show excludedportrange protocol=tcp` で確かめ、範囲外のポートにする）。
      `EADDRINUSE` なら、WSL2 の portproxy（NAT＋portproxy の手順）や mirrored モードの WSL2 の soda が同じポートを使っていないか
      確かめる（`netsh interface portproxy show v4tov4`）。
- [ ] 初回の起動で出る Windows のファイアウォールのダイアログ（node.exe）で「プライベート ネットワーク」を許可する
      （`docs/tls-setup.md`「手順4」の「Windows ネイティブ」）。期待：`Get-NetConnectionProfile` の LAN の接続が
      `Private` で、node.exe にブロックの規則が無い。
- [ ] 別のマシンのブラウザで `soda: open https://192.168.1.50:8443/…` の行の URL を開く。期待：警告なしで開き、端末
      （PowerShell）が表示される（2 回目以降の URL ならログイン画面に token を入れてから）。
- [ ] 大文字のホスト名で開ける（D101。ホスト名の大文字・小文字を区別せずに比べる）：PowerShell で `hostname` を実行し
      （例 `DESKTOP-ABC1234`）、サーバのマシン（か、その名前で届く別のマシン）のブラウザで `https://DESKTOP-ABC1234:8443/` を
      開く（証明書の SAN にその名前が無ければ警告が出るので、例外を承認して進む——ここで確かめるのは名前の許可で、証明書では
      ない）。期待：ブラウザは名前を小文字にして送るが、ログイン画面に token を入れるとログインでき、端末が出る（「このページの
      アドレス（https://desktop-abc1234:8443）からのログインを、サーバが許可していません」の 403 にならない）。
- [ ] 下の「共通：AC1〜AC9 の一巡（別のマシンのブラウザで）」と「共通：AC10・AC13・AC14・AC18（AC16）」。

### 共通：AC1〜AC9 の一巡（別のマシンのブラウザで）

キーは prefix（`Ctrl+B`）の後の 1 キー（design「既定のキー」）。

- [ ] AC1 workspace：`N` で作成・`W` で名前変更・`w`（↑↓・Enter）で切替・`D` で閉じる（確認のダイアログが出る）。
      期待：サイドバーの行が増減し、名前が変わる。
- [ ] AC2 tab：`c` で作成（名前を尋ねる）・`T` で名前変更・`1`〜`9`・`n`/`p` で切替・`X` で閉じる。期待：tab バーが追従する。
- [ ] AC3 pane：`v`（右）・`-`（下）で分割・境界をドラッグしてリサイズ・`h`/`j`/`k`/`l` で焦点の移動・`P` で名前変更・
      `x` で閉じる。期待：分割・リサイズが画面に出て、打った文字が焦点の pane に入る。
- [ ] AC4：vim（か htop）が崩れずに全画面で動く。日本語の表示と IME での入力ができる。窓の大きさを変える・サイドバーを
      折りたたむ（`b`）・サイドバーの境目をドラッグして幅を変えると、PTY の大きさも追従する（D107）：`tput cols`（Windows
      ネイティブの PowerShell は `[Console]::WindowWidth`）の値が変わり、vim は新しい大きさで描き直される。
- [ ] AC5：`[` の copy モードで `k` 等で遡り、`V` で行を選んで `y` でコピーし、`Ctrl+Shift+V` で貼り付けられる。期待：HTTPS
      （secure context）なのでクリップボードが使える（平文の HTTP では使えない）。
- [ ] AC6・AC7：Claude Code 等のエージェントを動かし、サイドバーに状態が出て、行のクリックでその pane へ移る。**状態の印が
      × ✓ ◐ ○ ·（入力待ち・完了・作業中・待機中・状態不明）として出て、豆腐（□）や絵文字にならず、5 つを形で見分けられる**こと（20260921-herdr-settings-gaps。字形のフォントは
      環境で違うので、この 3 環境で目で確かめる。崩れる環境が見つかったら `StateIcon.vue` の中だけで差し替える——design D4）。
      ふだんの操作では状態不明や完了をすぐには出せないので、**5 つそろって見える場所として `prefix+s` の「表示」の注記**を見る
      （字形と名前が優先度の順に組で並ぶ。書体は印と同じ system-ui だが、注記は小さく太字でも色付きでもないので、豆腐や絵文字に
      ならないかはここで、太さと色はサイドバーの入力待ち・作業中・待機中の印で見る）。
- [ ] AC8：ブラウザを閉じて開き直す。期待：workspace・tab・pane の構成と画面（scrollback を含む）が戻る。サイドバーの幅と
      折りたたみも、閉じる前のまま戻る（20260921-herdr-settings-gaps）。あわせて、ページを
      開いたまま `soda serve` を止めて同じコマンドで起動し直す。期待：「再接続中…」が重なった後に消え、workspace・tab・pane の
      構成が戻り、各 pane に新しいシェルのプロンプトが出る（起動し直すと pane のシェルは新しく起動し直されるので、前の画面と
      scrollback は戻らない。design「再起動後の復元（AC18・D7）」）。打った文字とその出力が出る（同じページのまま繋ぎ直しても、表示中の
      pane の出力が届く。D107）。
- [ ] AC9：サーバのマシンのブラウザ（`https://localhost:8443/`。ログイン画面が出たら控えた token を入れる）と別のマシンの
      ブラウザで同じ pane を開き、どちらからも入力できる。PTY の大きさは、最後に操作した（打った・クリックした等）方の窓に合う
      （もう一方の窓は、縮めるか余白をつけて表示する。`tput cols` で確かめる）。スマートフォンで「この端末に合わせる」を押さずに
      同じ pane を開いても、PTY の大きさは変わらない（D106。「実機（iOS Safari・Android Chrome。AC12）」）。

### 共通：AC10・AC13・AC14・AC18（AC16）

AC16 は AC1〜AC14 と AC18 を 3 環境で確かめる。上の一巡に無い分のうち、AC11 はこの節、AC12 は
「実機（iOS Safari・Android Chrome。AC12）」（それも 3 環境それぞれで行う）、AC17 は「性能の計測（AC17）」で、残りをここで
確かめる（Linux では `packages/e2e` が自動で確かめている。WSL2・Windows ネイティブでは必ず行う）。キーは prefix（`Ctrl+B`）の後の
1 キー。

- [ ] AC10：シークレット（プライベート）ウィンドウで `https://192.168.1.50:8443/` を開く。期待：ログイン画面だけが出て、token を
      入れるまで workspace・端末は何も見えない。違う token では「token が違います。…」と出て入れない。
- [ ] AC13：`?` でヘルプ（キーの一覧）が開き、`/` で絞り込める。上の一巡で使わなかったキーも一覧どおりに動く：`H`/`J`/`K`/`L`
      （pane の入れ替え）・`Tab`/`Shift+Tab`（pane の巡回）・`z`（拡大表示。もう一度で戻る）・`r`（resize モード。`h`/`j`/`k`/`l` で
      境界が動き、Enter で抜ける）・`g`（goto。文字で絞り込み、Enter で移る）・`b`（サイドバーの折りたたみ）・`q`（このブラウザだけを
      切り離す。「再接続」で戻る）・`Ctrl+B` の二度押し（`Ctrl+B` そのものを端末へ送る。`cat -v` を動かして `Ctrl+B` を 2 回押すと
      `^B` が出る。ブラウザの側の処理なので、Windows ネイティブの PowerShell（`cat -v` が無く、PSReadLine が `Ctrl+B` に何も割り
      当てていないことがある）では確かめず、Linux・WSL2 で確かめれば足りる）・`e`（スクロールバックをサーバの `$EDITOR` で開く。
      エディタを終えると元の pane へ戻る。Windows ネイティブは `VISUAL` か `EDITOR` を設定して `soda serve` を起動したときだけ開き、
      どちらも無ければ「スクロールバックをエディタで開けませんでした」のトーストが出るのが正しい。20260926-edit-scrollback。
      「未対応（後続: …）」と出るキーはもう無い）。`s` は設定を開く。
- [ ] 独自コマンド（20260927-custom-command-keys。Linux・WSL2 で確かめれば足りる。Windows ネイティブの `cmd.exe` の引用は未検証）：
      `docs/custom-commands.md` の例（`popup` の `scratch`〔`exec "${SHELL:-sh}"`〕・`pane` の `htop`・`shell` の `touch-ok`〔`touch /tmp/soda-cmd-ok`〕）を
      `commands.json` に書き（`chmod 600`）、`prefix+shift+r` で読み直す。`prefix+s` の節「キー」の群「独自コマンド」に 3 つが出て、
      それぞれにキーを割り当てられる。期待：popup のキーで画面の中央に浮いた端末が開き、`Esc`・`ctrl+b` も popup のシェルに届き
      （下の pane・prefix は反応しない）、`exit` で閉じて元の pane にフォーカスが戻る。見出しの × でも閉じる。`pane` のキーで拡大表示の
      htop が開き、`q` で閉じると元の pane・拡大表示に戻る。`shell` のキーで「走らせました」と出て `/tmp/soda-cmd-ok` ができる。
      `chmod 666 commands.json` にして読み直すと「書き込めます」の理由のトーストが出て群が案内に変わる。
- [ ] AC14：マウスで、pane・tab・サイドバーの行のクリックで移る（M1）・pane の境界のドラッグ（M2）・右クリックのメニュー（M3。
      pane・pane の枠・tab・サイドバーの workspace）・文字を選ぶとコピーされ「コピーしました」と出る（M4）・ダブルクリックで単語を
      選ぶ（M5）・ホイールで scrollback（M8）・スクロールバー（M9）。
- [ ] AC14 のリンク（M6・D110）：`echo https://example.com/` を実行し、出た URL をただクリックする。期待：何も開かない。Ctrl
      （macOS は Cmd）を押しながらクリックすると新しいタブで開く。Ctrl を押したまま URL に重ねると下線と指のカーソルが出て、Ctrl を
      離すと消える（出力の直後にポインタが同じ行の上にあると、xterm.js がその行を判定し直さず出ないことがある——いったん別の行へ
      動かしてから重ねる）。Linux・WSL2 では OSC 8 のリンクも同じ：`printf '\e]8;;https://example.com/\e\\example\e]8;;\e\\\n'`
      の `example`（表示の文字は URL でなくてよい）。http/https 以外（`printf '\e]8;;mailto:a@example.com\e\\mail\e]8;;\e\\\n'`
      等）はリンクにならず、Ctrl＋クリックでも開かない。
- [ ] M7・M11（マウス報告）は「Linux（CI・手元）」の手元の項目と同じ手順（WSL2 は同じ bash で行う。Windows ネイティブの
      PowerShell には `printf`・`cat -v` が無いので、Linux・WSL2 で確かめれば足りる——ブラウザの側の処理で、サーバの OS に
      依らない）。
- [ ] テーマ（20260921-theme-settings）：**macOS のブラウザ（Safari・Chrome）と Firefox で**、「Linux（CI・手元）」の手元の項目の
      「テーマ」「OS の明暗に合わせる」を行う（Chromium 以外のブラウザが描く入力欄の枠とフォーカスの枠・macOS の `<select>` の操作は、自動の
      テストで確かめていない）。
- [ ] AC18：workspace・tab を作って名前を付け、分割し、pane で `cd` してから、`soda serve` を Ctrl+C で止めて同じコマンドで
      起動し直し、ブラウザで開き直す。期待：構成・名前・レイアウト・フォーカスが戻り、Linux・WSL2 では `pwd` が `cd` した場所に
      なる（Windows ネイティブの cwd は「Windows ネイティブ（WSL2 の母艦の Windows で直接）」の cwd の項目の制約のとおり）。

### 共通：クリップボードの画像の貼り付け（20260927-clipboard-image-paste・H44）

別のマシンのブラウザ（HTTPS）で行う。自動のテストはサーバの受け取り・保存と、ブラウザの部品を偽のクリップボードで確かめただけで、
**実物のブラウザのクリップボード・許可の画面・本物のエージェントでは確かめていない**。画像は `<状態ディレクトリ>/clipboard-images/`
（既定の状態ディレクトリは Linux・macOS で `${XDG_STATE_HOME:-~/.local/state}/sodashitsu`、Windows ネイティブで `%LOCALAPPDATA%\sodashitsu`。
名前付き session は `sessions/<名前>/` の下）に置かれる。
**状態ディレクトリは自分だけが書ける場所に置く**（`--state-dir` を他人も書ける場所にすると、画像のディレクトリを確かめてから書くまでの間に
差し替えられうる。decisions D9）。

- [ ] Chromium（Chrome・Edge）：スクリーンショットをクリップボードに取り、pane で `cat -v` を動かして `Ctrl+V` を押す。期待：初めてなら
      「クリップボードの表示」の許可の画面が出る（2 秒以内に答えないと、その回は画像無しとして `^V` が送られる——許可してからもう一度 `Ctrl+V`）。許可すると `^[[200~/…/clipboard-images/soda-image-….png^[[201~` ではなく（`cat -v` は
      bracketed paste を有効にしないので）パスがそのまま出る。サーバでそのファイルが画像として開け、Linux・macOS・WSL2 では `ls -l` で `-rw-------`、ディレクトリは `drwx------`（Windows ネイティブでは
      権限を絞らず、利用者のディレクトリの権限に依る）。
- [ ] 同じく、クリップボードにテキストだけがあるとき・許可を拒否したとき：`Ctrl+V` がそのまま届く。端末の行の規律は `Ctrl+V` を「次の 1 文字をそのまま通す」に
      使うので、先に `stty lnext undef` を実行してから `cat -v` を動かす（終わったら `stty lnext ^V` で戻す）。期待：`^V` が出る。`Ctrl+V` の直後に続けて `abc` を打つと `^Vabc` の順。
- [ ] Claude Code（`claude`）を pane で動かし、`Ctrl+V` で画像を貼る。期待：`[Image #1]` のように添付として扱われる。
- [ ] Vim で `Ctrl+V`（矩形選択）を使う人は、節「キー」の「クリップボードの画像を貼り付け」を外す（または別のキーにする）と、`Ctrl+V` が
      クリップボードを読まずにそのまま Vim へ届く。
- [ ] macOS の Safari・Firefox・Chrome：画像をコピーして pane で `Cmd+V`。期待：許可の画面なしで画像のパスが貼られる。テキストなら今までどおり。
- [ ] Firefox（Linux・Windows）：`Ctrl+V` は画像があっても `^V`（読まない）。右クリックの「貼り付け」か `Ctrl+Shift+V` で「ペースト」のメニューを選ぶと
      画像のパスが貼られる（テキストがあればテキスト）。
- [ ] 保存した SSH のマシン（`docs/machines.md`）の pane で `Ctrl+V`。期待：パスは**リモートのマシン**の状態ディレクトリの下。
- [ ] 16 MiB を超える画像：「画像が大きすぎます（16MB まで）」のトーストが出て、pane には何も入らない（Chromium の `Ctrl+V` は BMP 等も PNG にして渡すので、
      形式で断られることは通常無い。Cmd+V 等の貼り付けでは PNG・JPEG・GIF・WebP 以外の画像は画像として扱わず、今までどおりの空の貼り付けになる）。
- [ ] 画像を送っている間（大きな画像で 1 秒ほど）に打ったキーは、パスが貼られた後に届く（送り終わるまで表示されない。最長 20 秒で先に流れる）。

### 共通：表示の面（`sodactl display`。20261007-soda-extensions・`docs/display.md`）

自動のテストは、プロトコルの検査・サーバの台帳・受け口と `/ws`・`sodactl`（PR1）と、画面（PR2）の取り除き（`sanitize.js`）・`/display-view/*` のヘッダ・枠の部品（合い札・`load` の回数・見回り）・パネルと帯・幅のつまみ・キーの操作・モバイル。
実ブラウザの E2E（Chromium。`packages/e2e/src/specs/display*.spec.ts`）で、出す・更新する・閉じる・操作（`display-flows`）・隔離（`display-isolation`）・幅のつまみ（`display-resize`）・モバイル（`display-mobile`）を確かめた。
実機の iOS Safari・Android Chrome・Firefox・Safari・別のマシンのブラウザ・保存した SSH のマシンは確かめていない（下の手順）。

実測した前提（Chromium・Playwright）:

- `MessagePort` は、sandbox（`allow-same-origin` なし）の不透明 origin の枠へ、`postMessage` の transfer で渡せる。
- Playwright の `frame.evaluate` は、`script-src 'self'` の枠の文書の中でも式を評価できる（枠の `self.origin` は `"null"`・`localStorage`/`parent.document` は `SecurityError`。`location.origin` は URL から出る値なので不透明 origin の証拠にならない）。
- sandbox に `allow-forms` があると、枠の中の `form` の `submit` のイベントが起き、`preventDefault()` により実際の送信は起きない（外への要求 0・枠は移らない）。
- marked は Markdown の中の HTML（`<button data-soda-action>`）をそのまま通す。
- 枠が同じ origin の別の文書へ移ると、親から見た iframe の `load` が 2 回目として起きる（`frame.goto`。移った瞬間に親が iframe を外すので、Playwright の `goto` の待ちは `Frame was detached` で終わる）。

手順（実機・実ブラウザで）:

- [ ] pane の中で `sodactl display set p --kind panel --html-file x.html` と `--kind band --text hi`。期待：パネルが端末の右、帯が端末の上に出て、端末の列数が減る。
- [ ] パネルの左の縁をドラッグ。期待：離すまで幅は変わらず（案内の線だけ動く）、離すと 1 回だけ端末が縮む。再読み込みの後も幅が残る。ダブルクリックで元の幅。
- [ ] 置き場所とたたみ（20261008-display-layout）：パネルの［▸］を押す。期待：パネルが外れて端末の列数が戻り、帯の行（帯があればその左、無ければ高さ 24px の行）にその面のボタンが出る。ボタンを押すと戻る。再読み込みの後も、たたんだ・開いた状態が残る。別のブラウザでは既定のまま。
- [ ] 帯の［⋮］→「下に置く」。期待：帯が端末の下に出る。「たたむ」で行が消えて端末が高くなり、ボタンから戻せる。`prefix+shift+i` → 矢印 → `Enter` で、マウス無しでたためる。「プログラムの指定に戻す」で戻る。
- [ ] `script-html` の面を載せたまま、キーボードで［▸］→ トレイのボタン → … を `Enter` で 3 秒に 16 回以上繰り返す。期待：スクリプトの面が止まらない（［再開］・「繰り返し外しています」が出ない）。
- [ ] パネルの置き場所（20261008-display-layout PR-B）：パネルの見出しのつかむ場所（印とラベルのところ）を押して pane の縁へ動かす。期待：6px 動かすと、その pane の上に落とせる場所（上・下・左・右。中央は「ここには置けません」）が文言つきで出て、ポインタのある場所だけ強調される。離すとその側へ移り、端末の列数・行数が 1 回だけ変わる。`Esc`・pane の外で離す・ダイアログを開く、では変わらない。面のメニューの「右に置く／左に置く／上に置く／下に置く」・設定の「表示のパネルの既定の置き場所」でも同じ。
- [ ] 各側のつまみ：上・下・左・右のパネルの、端末に面した縁をドラッグ。期待：離すまで大きさは変わらず（案内の線だけ）、離すと 1 回だけ端末が変わる。`Esc` で取り消し、ダブルクリックで戻る。つまみに `Tab` で届き、端末の側へ向く矢印で広がる。再読み込みの後も大きさが残る。
- [ ] 狭い pane・低い pane：左右（上下）の両方に置いて、ウィンドウを狭める（低くする）。期待：端末が 40 列・10 行を下回らず、両側が縮み、それでも入らないと左（上）が先にトレイの押せないボタンになる。広げると戻る。
- [ ] 帯を下に置いて知らせ（トースト）を出す。期待：知らせが見出し・帯の行・ボタンに重ならない。
- [ ] `<button data-soda-action="go">` を押す。期待：待っている `sodactl display wait` に 1 行届く。
- [ ] `prefix+i` で枠へ移る。期待：縁が強調色・「入力はこの表示に届きます（Esc で端末へ）」・端末が薄くなる。`Esc` で戻り、続けて打ったキーが pane に届く。
- [ ] iPhone・Android（幅 767px 以下）：パネルは端末の横に出ず、バーの［表示N］から重ね表示が開く。帯は端末の上。
- [ ] `soda handoff`／再起動の後、面が消える（`events` は `display.reset`／`display.end`）。出し直すと出る。

スクリプトが動く形式（`script-html`。`docs/display.md`「スクリプトが動く形式」）。自動の確かめは、`packages/e2e/src/specs/display-script*.spec.ts`（Chromium 153。結果は `.aidev/works/20261007-soda-extensions/test-result.md`）。実測した前提:
差し込みで親から見た枠の `load` が 1 回のまま／ふつうの HTML・埋め込んだ marked・Chart.js が動く／スクリプトが枠のフォーカスを取っても、アプリが元の場所へ戻せる（`document.activeElement` を親が見る）／枠が外の origin・`localhost` の別のポート・204 の宛先へ移ろうとするのを、アプリの CSP が止める／
WebRTC（UDP）は止まらない・利用者の操作の後の `execCommand("copy")` と音は止まらない・`window.name` は移った先へ運べる・兄弟の枠への `postMessage`/`MessagePort` は届く・兄弟の枠の `location` は書き換えられない（`SecurityError`）。

- [ ] `sodactl display set g --kind panel --script-html-file g.html`（スクリプトで DOM を書き換える中身）。期待：見出しに印「スクリプト」と［操作する］が出て、枠は覆いの下にある。覆い・枠を押しても操作中にならず、［操作する］が 1 秒強調される。
- [ ] ［操作する］（または `Tab` で届いて `Enter`、または `prefix+i`）。期待：縁の強調色・「入力はこの表示に届きます（Esc で端末へ）」・端末が薄くなり、枠の中の欄に打てる。`Esc` で端末へ戻り、覆いと［操作する］が戻る。
- [ ] 端末にフォーカスを置いて、中身が `setInterval(() => { window.focus(); input.focus() }, 50)` で取り続ける。期待：フォーカスは端末へ戻され、3 回で面が閉じ、トースト「…キー入力を取ろうとし続けたので閉じました…」。5 分は `script-html` の `set` が `display_busy`、静的な形式は出せる。
- [ ] `sodactl display send g --json '{"n":1}'`。期待：`soda.onMessage` に届く（枠は作り直されない）。ブラウザを再読み込みすると、あとからは届かない（保存されない）。
- [ ] 中身が `location.href = '/display-view/frame.html?moved'`。期待：すぐ面が閉じて「別のページへ移ろうとしたので閉じました」。その pane は 5 分、`script-html` を出せない。

### 共通：質問のフォーム（`sodactl ask`。20261002-sodactl-ask・`docs/sodactl.md`「質問のフォーム」）

自動のテストは、プロトコルの検査・回答の集め方（ask-form と共通の規則。20261003-ask-form-component からは、共通の試験データ `third_party/ask-form/fixtures/` で ask-form の側と同じ結果になることを見る）・サーバの台帳・実物の `/ws` と中継越しの結合・ダイアログの部品・実物の Chromium での一巡（ビルドした `sodactl` を子プロセスで起動。
決定・キャンセル・時間切れ・ブラウザなし・2 つのブラウザ・再読み込み・SIGINT・サーバの再起動・別の tab・キーボードだけ・キーとホイールが漏れない・設定のダイアログとの重なり・`<script>` が動かない・モバイルの
エミュレーション）を確かめた。**別のマシンのブラウザ（ループバックでない接続）・実機のスマートフォン・Firefox・Safari・保存した SSH のマシン・ask-form 本体（実物の `ask.py` のウィンドウ）と同じ定義で同じ回答になることの突き合わせ・画面のキーボードが出たときの高さは
確かめていない**。

- [ ] 別のマシンのブラウザ（HTTPS。`docs/tls-setup.md`）で pane を開き、pane の中で `sodactl ask < spec.json`（`spec.json` は
      `python3 <public_docs>/docs/ClaudeCode/skills/other/md-to-doc/generate.py <任意の.md> --ask-spec` の出力）。期待：そのブラウザの画面の上にフォームが出る（サーバ側の画面にウィンドウは開かない・新しいタブも開かない）。
      13 件のテーマを最後までスクロールして選び、［決定］で `{"status":"answered",…}` が 1 行返る。出どころの行に pane の名前・workspace・tab が出る。
- [ ] 同じマシンのブラウザ（`http://127.0.0.1:7780`）でも同じ（別ウィンドウは開かない）。
- [ ] ask-form 本体との同じ結果: 同じ定義・同じ操作（既定のまま決定・`showIf` を外す・「その他」・補足・質問ごとの自由記述）を `python3 <ask-form>/ask.py - < spec.json`（同じマシンのブラウザ）と `sodactl ask < spec.json` で行い、`answers`・`custom`・`note`・`comments` が同じ。
      質問が 1 つだけ・`single`・`note: false` の定義では、どちらも矢印キーで移っただけでは決定せず、クリック・`Space`・`Enter` で決定する（同じ部品 `<ask-form>` を使う。`docs/sodactl.md`「画面の操作」）。
- [ ] 2 つのブラウザ（PC とスマートフォン等）で同じ session を開く。両方にフォームが出て、片方で決定するともう片方が閉じる。再読み込みすると出し直される。`sodactl ask` を Ctrl+C で止めると両方閉じる。
- [ ] pane を表示していないブラウザ（別の tab・workspace を見ている）でも出て、閉じたら表示は切り替わらず、いまの tab の端末へフォーカスが戻る。設定のダイアログ（`prefix+s`）を開いている間に質問が来ても、
      両方操作でき、閉じると設定のダイアログへ戻る。
- [ ] スマートフォン（iOS Safari・Android Chrome）の実機: フォームが画面に収まり（はみ出さない）、選択肢をタップで選べて、最後までスクロールできる。入力欄へフォーカスしても画面が拡大しない。画面のキーボードが
      出ても［決定］が隠れない（隠れるなら記録する。ダイアログの高さに画面のキーボードを反映していない）。
- [ ] 保存した SSH のマシン（`docs/machines.md`）: リモートのマシン（Linux・macOS。受け口を含む版の `soda`）で **`sodactl login` をしないまま**、そのマシンを表示した手元のブラウザで、リモートの pane の `sodactl ask`。期待：手元のブラウザに出て、答えが返る
      （リモートの `pane.sock` で動く）。受け口を持たない古い版のリモートでは、リモートのマシンで `sodactl login` を済ませてから行う。
      ローカルを表示している間は `unavailable`。
- [ ] 端末版（引数なしの `soda`）だけをつないだ session で `sodactl ask`。期待：待たずに `{"status":"unavailable",…}`。
- [ ] ブラウザを 1 つも開いていない session で `sodactl ask`。期待：待たずに `unavailable`。同じ pane で 2 つ続けて打つと 2 つめは `ask_busy`（終了コード 1）。
- [ ] Claude Code（`claude`）を pane で動かし、ask-form のスキルで質問させる（ask-form 側が `sodactl ask` に対応した後）。期待：ブラウザの画面の上に出て、答えが Claude Code に戻る。

### 共通：質問のフォームの画像・音・コード・成果物・edit/rank/table（20261004-ask-media-popup・`docs/sodactl.md`「画像・音・コード」「成果物（view）」）

自動のテストは、定義の検査と上限（`packages/protocol/src/ask.test.ts`）・種類の確認（先頭バイト。`packages/server/src/ask/mediaSniff.test.ts`）・ファイルの読み出しと上限の境界（`AskMedia.test.ts`）・外部 URL の取得と SSRF の拒否
（アドレスの表・リダイレクト・ヘッダ・時間・サイズ・実物の `https.request` で接続先が固定されること。`RemoteImageFetcher.test.ts`）・台帳（準備中・閉じる 5 経路でメディアの合計が戻る・全体の上限。`AskService.test.ts`）・実物の `/ws`・`pane.sock`・
保存した SSH のマシンの中継越しの結合（`ask.media.integration.test.ts`・`machines.integration.test.ts`）・応答ヘッダ（アプリ本体の CSP が `media-src data:` だけの追加・`/ask-view/*` の専用ヘッダと許可リスト。`HttpServer.integration.test.ts`）・
同梱ライブラリの sha256（`scripts/ask-view-vendor.test.ts`）・画面（メディアの取得と `resolveMedia`・成果物の枠の `sandbox` 属性・`postMessage` の `event.source` の検査・取り次ぐキー。`packages/web`）・`sodactl ask`（絶対化・事前確認・機能確認）、
実物の Chromium での一巡（`ask-media.spec.ts`・`ask-types.spec.ts`・`ask-view.spec.ts`。画像の `naturalWidth`・`currentSrc`、CSP 違反、`Audio` の包み〔音は聞けないので `src` と `play()` の呼び出しを観測〕、SVG のスクリプトが動かないこと、SSRF の宛先、
`sandbox` 属性・枠の中の `parent.document` の SecurityError・`fetch` の拒否・枠の中のキーが親へ届くこと・Markdown のインラインが動かないこと・モバイルの縦積み）を確かめた。**確かめていないもの**: 実際の音が鳴ること・実物のインターネット上の画像の取得・
別のマシンのブラウザ・実機のスマートフォン・Firefox・Safari・動画・実物の ask-form（`ask.py`）の改修後の連携・mermaid の全図種・社内プロキシ越しの環境。

- [ ] 画像付きのフォーム: `sodactl ask` に、画面案の PNG（数 MB）を `image` に持つ質問を渡す。期待：Edge などの別ウィンドウは開かず、画面内のダイアログに画像が出る（拡大表示もできる）。`https://` の画像（公開の画像）を渡すと、画像が出る
      （ブラウザの開発者ツールのネットワークに画像の取得先へのリクエストが無い＝取得はサーバがした）。`https://127.0.0.1/x.png` を渡すと、画像なしで出て、最上部に「画像 1 件を取得できませんでした」が出る。
- [ ] 音: `audio` に短い wav を渡し、［▶ 試聴］で**実際に鳴る**（自動のテストは聞けない）。
- [ ] 成果物: md-to-doc で作った HTML（スクリプト付き）と Markdown（mermaid の図つき）を `view` に渡す。期待：左に枠（モバイルは上）、枠の上に「pane『…』の成果物（隔離表示）」。HTML が動き（外の CDN を読む部分は崩れてよい）、
      Markdown が整形されて図が出る。枠の中をクリックしてから `Esc`（取り消し）・`Ctrl+Enter`（決定）が効く。
      Markdown に `[例](https://example.com/)` を書き、押すと**新しいタブ**で開き、元のダイアログは開いたまま回答も変わらない（ポップアップブロッカーに止められないか・ユーザー操作なしの `window.open` が開かないかは実機で確かめる）。HTML の枠のリンク・`window.open` は開かない。mermaid の図の中のリンクは開かない。
- [ ] `edit`・`rank`・`table` を実機のブラウザで操作し、結果の JSON の形（`edited`・並べた配列・`{行: 値}`）を確かめる。
- [ ] 別のマシン（保存した SSH のマシン）の pane から、そのマシンにある画像・Markdown を渡して、手元のブラウザに出る。
- [ ] `sodactl ask --features` の出力（`server` が null でない）。古いサーバでは、新しい項目のある定義が `unavailable` になる。
- [ ] 巨大な HTML（ローカル起動。`docs/sodactl.md`「ローカル起動では大きさの上限が無い」）: `soda serve`（既定の `127.0.0.1`）の pane で、50 MiB・200 MiB の HTML を `view` に付けて `sodactl ask`。期待：画面内のダイアログに出て、末尾まで描かれ、枠の中のスクリプトが動く。
      自動の実測（Chromium・`SODA_E2E_HUGE=20,50,100 pnpm exec playwright test ask-local-limit -g 実測`。節の多い `dom` と節の少ない `light` の 2 種）。チャンクごとの復号に替えた後、200 MiB（安全弁を決める前に測った値）は
      dom で表示まで 24.9 秒・ブラウザ全体 3280 MiB（開く前 608 MiB）、light で 8.3 秒・1976 MiB。20 MiB は dom 2.2 秒・920 MiB、light 1.4 秒・766 MiB。50 MiB は dom 5.9 秒・1282 MiB、light 2.3 秒・842 MiB。
      ブラウザ側のメモリは元の大きさの 7〜13 倍で、メモリの少ない端末では遅い・タブが落ちうる。
      実機のブラウザ（Firefox・Safari・スマートフォン）・101 MiB（安全弁を超える。終了コード 2。E2E で確認済み）・`--origin` つきで起動した同じ構成（8 MiB 超が終了コード 2）・保存した SSH のマシンの pane（従来の上限）は未確認。

### 共通：質問のフォームの目次と部品（20261003-ask-form-component・`docs/sodactl.md`「目次」「画面の操作」「画面の部品と同期」）

画面の中身は、ask-form と同じ部品 `<ask-form>`（`third_party/ask-form/ask-form.js`）が描く。質問は 1 枚に並んだまま、高さに収まらないとき（または `page` を書いた・`paging: true`）に左に質問の目次が出る。
自動のテストのうち、単体テストは次を確かめた: 定義の検査（`paging`・`page`・`filter`・`showValue`・値が `__other__`／空文字の選択肢。
`packages/protocol/src/ask.test.ts`）、ask-form の側と同じ結果になること（共通の試験データ。`packages/protocol/src/ask.fixtures.test.ts`）、写したファイルが `SOURCE.json` と一致すること（`scripts/sync-ask-form.test.ts`）、
部品の読み込みと値の扱い（`packages/web/src/ask/askFormElement.test.ts`）、枠（`packages/web/src/components/AskDialog.test.ts`: 固定の行が部品の外にある・
固定の行での `Ctrl+Enter`／`Alt+PageDown`／`Alt+PageUp` の取り次ぎ・即確定・描けない定義の取り消し）。単体テストの環境（happy-dom）は大きさが取れないので、**高さで目次が出るか・ダイアログの幅の広がり・実物のブラウザでのキーとフォーカスは、
単体テストでは確かめていない**。下は実物で確かめる。

- [ ] `page` を書いた定義（例: 6 問のうち 1・3・5 問目に `"page": "基本"`・`"page": "見た目"`・`"page": "出力"`。高さに収まる数）で `sodactl ask < spec.json`。期待：質問は 1 枚に全部並び、左に目次が出て、題の見出し（基本・見た目・出力）の下に質問の題の項目が並ぶ。
      目次の幅の分だけダイアログが広がる。下までスクロールすると、今見ている質問の項目に印が付く。最後の項目は「補足」（補足の欄がある定義）。
- [ ] 質問が多い定義（`page`・`paging` を書かず、画面の高さに収まらない数。例: 選択肢 4 つの質問を 12 問）。期待：目次が出る。スクロールに合わせて印が移る。ブラウザのウィンドウを十分高くして出し直すと、目次は出ず 1 枚で出る。
      開いた後にウィンドウの高さを変えても、目次を出すかは決め直されない。
- [ ] 目次の項目を押す。期待：その質問へ移り、その質問の入力にフォーカスが移る。選んだ・書いた内容は残っている。
- [ ] `Alt+PageDown`／`Alt+PageUp`。期待：次・前の質問へ移る（端では何もしない）。開いた直後（フォーカスは最上部の「どの pane からの質問か」の行）でも効く。背面の端末へ届かない。
- [ ] 質問のどれかを未回答にして（`required` の `text` か、既定の無い `single`）、先頭の質問から［決定］。期待：決定されず、最初の未回答の質問へ移って、その質問が強調され、その入力にフォーカスがある。目次のその項目の色が変わっている。
      下の行に「未回答 1 件 — 答えてから決定してください」。答えて決定すると、全質問の回答が `answers` に入った `{"status":"answered",…}` が 1 行返る。
- [ ] 上の質問が多い定義に `"paging": false` を足す。期待：目次が出ず、ダイアログの中をスクロールして最後の質問まで答えられる。`"page"` を書いた定義に足しても出ない。`"paging": true` では、高さに収まる短い定義でも目次が出る。
      `"paging": "many"`・`"paging": 0`・質問の `"page": 2` は、ダイアログを出さずに終了コード 2（stderr に理由）。
- [ ] ブラウザのウィンドウの幅を 768px 未満に狭める。期待：目次が消え、ダイアログの幅が目次の分だけ戻る（ダイアログは画面の幅 − 16px を超えない）。広げ直すと目次が戻る。
- [ ] `showIf` の条件の質問と対象の質問を置く。期待：条件の答えを変えると、対象の質問が出る・消え、目次の項目も出る・消える。消えた質問は `answers` に入らない。まとまりの質問が全部消えると、その見出しも消える。
- [ ] キーだけで完結する: `Tab` で選択肢へ移って選び、`Alt+PageDown` で次の質問へ → 選ぶ → `Ctrl+Enter`（macOS は `Cmd+Enter` も）で決定。
      目次が出ているとき、1 行の入力欄で `Enter` → 次の質問へ、最後の質問の 1 行の入力欄で `Enter` → 決定（短くて目次が出ていないフォームでは `Enter` で決定）。開いた直後の `Ctrl+Enter` でも決定できる（既定がそろっているとき）。どのキーも背面の端末へ届かない・ブラウザの既定の動き（ページのスクロール等）をしない。
- [ ] 選択肢が 12 件以上の質問（上の 13 件のテーマ）に絞り込みの欄が出る。文字を打つと選択肢が絞られ（選択中の選択肢は残る）、**その欄に文字がある間の `Esc` は絞り込みを消すだけ**でダイアログは閉じない。もう一度 `Esc` で `cancelled`。
      `"filter": false` を足すと欄が出ない。表示名と値が違う選択肢に値が横に出て、`"showValue": false` で消える。
- [ ] 質問が 1 つ・`single`・`note: false` の定義: 矢印キーで選択を移しても決定しない。`Space`・`Enter`・クリックで決定する（既に選ばれている選択肢でも）。
- [ ] モバイル（スマートフォンの実機か、幅 767px 以下の画面）: 質問が多い定義でも目次は出ず、質問を最後までスクロールして答えて決定できる。下のボタンにキーの表示が出ない。
      画面のキーボードが出て高さが縮んでも、入力中の欄を見失わない。
- [ ] Firefox・Safari で、`Alt+PageDown`／`Alt+PageUp`・`Ctrl+Enter`／`Cmd+Enter` がブラウザの既定の動きに取られずに効く。
- [ ] テーマを切り替えて、フォームの地・文字・枠・選択中の選択肢の色がテーマに合う（読めない組み合わせが無い）。
- [ ] 部品の同期: `node scripts/sync-ask-form.mjs --check --from <public_docs の clone>` が終了コード 0（写した先・`SOURCE.json`・元のコミットが一致）。

### 共通：設定画面のサイドメニュー（20261004-settings-side-menu。`prefix+s`・全体メニューの「設定」）

設定画面は、幅 768px 以上のとき左に節の一覧（通知・テーマ・表示・端末・エージェント連携・キー。画面の節の見出しから作る）を出す。スクロールの入れ物は今までどおり設定のダイアログ自身で、メニューはその中で上に貼り付く。
**自動で確かめた範囲**: 単体テスト（`packages/web/src/settings/sectionSpy.test.ts`: 今の節の式・選んだ節を保つ条件・次／前・移る位置。`packages/web/src/components/SettingsDialog.test.ts`: 項目が見出しから作られる・印・移る操作・矢印／`Home`／`End`・`Tab` の停止位置・`Alt+PageDown`／`PageUp`・幅をまたぐときのフォーカス・閉じたときの後始末）と、
E2E（`packages/e2e/src/specs/settings-menu.spec.ts`。Chromium。幅 1280・800・767・700 と、開いたまま 768 をまたぐ場面、高さ 320px・1400px。メニューが見えたまま・題名の行の固定・押して移る位置とフォーカスと枠・ホイールでの印・`Alt+PageDown` 5 回で 6 節・`<select>` の値が変わらず端末へ漏れない・取り込み待ち中の動き・メニューの中のスクロール・「すべて既定に戻す」の確認中にメニューを押す場面・キーの節の下の帯の固定）。
下は、**自動では確かめていない範囲**を実物で確かめる。

- [ ] 設定を開く（`prefix+s`）。期待：左にサイドメニューが出て、6 節の名前が並ぶ。開いた直後のフォーカスは通知の最初の switch のまま。中身をいちばん下までスクロールしても、メニューと題名の行（［閉じる］）は見えたまま。**Firefox・Safari でも同じ**（`position: sticky` の固定は、E2E の Chromium でだけ確かめている）。キーの節の下の帯（結果の文）も見える範囲に固定される。
- [ ] メニューの項目をマウスで押す。期待：その節の見出しが題名の行のすぐ下に来て（動きはアニメーションなし）、見出しにフォーカスの枠が出る。続けて `Tab` で、その節の最初の部品へ移る。見出しにフォーカスがある間に `Space`／`Enter` を押しても、設定は何も変わらない。いちばん下の「キー」は、スクロールしきれる所まで。
- [ ] ホイール・タッチ・スクロールバーで中身をスクロールする。期待：印（太字と左の線。`aria-current`）が、題名の行のすぐ下に掛かっている節に移る。いちばん上は「通知」、いちばん下は「キー」。印は常に 1 つ。
- [ ] `Alt+PageDown`／`Alt+PageUp`。期待：どこにフォーカスがあっても（メニュー・節の中の部品・テーマなどの選択欄）次・前の節へ移る。最後・最初では何も起きない。**Firefox・Safari で、選択欄（`<select>`）の値が変わらず、ブラウザの既定の動きに取られない**（Chromium は自動で確認済み）。背面の端末へ届かない。
- [ ] キーだけで: 開く → `Shift+Tab` でメニューへ → 上下の矢印で項目を移る（移っただけでは節は移らない）→ `Enter` でその節へ → `Tab` で節の中の部品へ。メニューの中で矢印を押した後の `Tab` はメニューの外へ出る。
- [ ] ブラウザのウィンドウの幅を 768px 未満に狭める（開いたままでよい。ブラウザの拡大でも同じ）。期待：メニューが消えて、ダイアログの幅が今までに戻る。メニューにフォーカスがあったなら今の節の見出しへ移る。`Alt+PageDown` は効く。広げ直すとメニューが戻る。
- [ ] ウィンドウの高さを低くする（例: 400px 以下）。期待：メニューの中だけがスクロールし、今の節の項目が見える位置に保たれる。メニューの上でのホイールは本文を動かさない。
- [ ] 画面の文字を大きくする（ブラウザの文字サイズ・拡大）。期待：ブラウザの拡大では、画面の幅（CSS px）が減るので本文の列が縮み、768px を割るとメニューが消える。文字サイズだけを上げると、メニューの幅（`13em`）も文字に合わせて広がり、本文の列が縮む。どちらもダイアログは画面からはみ出さない。
- [ ] テーマを切り替える（明・暗を含む）。期待：メニューの項目・印・フォーカスの枠が読める。
- [ ] キーの節で、取り込み待ち（［変更］）にして `Alt+PageDown` を押す。期待：節は移らず、割り当ての候補として取り込まれる。取り込み待ちのままメニューの項目を押すと、取り込みは元のまま終わって節へ移る。
- [ ] タッチ（スマートフォンの実機）: 幅 767px 以下ではメニューが出ず、設定は今までと同じに使える。幅の広いタブレットではメニューの項目をタップして移れる。
- [ ] 読み上げ（スクリーンリーダー）: メニューが「設定の節」というナビゲーションとして読まれ、今の節の項目が「現在の項目」と伝わる。

### 共通：質問ごとの自由記述（20261004-ask-form-comments・`docs/sodactl.md`「質問ごとの自由記述」）

自動のテストは、定義の検査（`comments`・`comment` は `false` のときだけ残す）・回答の集め方と検査（共通の試験データ・サーバの上限〔1 つ 10,000 文字・合計 100,000 文字〕・不正な回答の断り）・実物の `/ws` と受け口（`pane.sock`）と中継越しの結合・枠の送信と高さの読み直し・
実物の Chromium での一巡（開閉・文言・結果の `comments`・隠れた質問・HTML が動かない・キー・フォーカス・高さ・キーとホイールが端末へ漏れない・モバイルのエミュレーション）を確かめた。**実機のスマートフォン・Firefox・Safari・別のマシンのブラウザ・保存した SSH のマシン・
ask-form 本体と同じ定義で同じ結果になることの突き合わせは、実物では確かめていない**。

- [ ] 各質問（`single`・`multi`）の下に「＋ 自由記述」が出る。押すと欄が開き（フォーカスが欄に移る）、もう一度押すと閉じる。書いて閉じると文言が「自由記述（入力あり）を開く」になる。`text` の質問には出ない。
      `"comments": false` の定義ではどの質問にも出ない。`"comment": false` の質問にだけ出ない。質問が 1 つ・`single`・`note: false` の定義には出ず、選んだ時点で決定する。
- [ ] 書いて決定する。期待：`sodactl ask` の結果に `"comments":{"<質問の id>":"<書いた文>"}`（前後の空白なし。閉じた欄の内容も入る。空白だけの欄・`showIf` で隠れた質問の欄は入らない）。何も書かなければ `comments` が無い。
- [ ] ask-form 本体との同じ結果: 同じ定義で `ask.py` のウィンドウと `sodactl ask` の両方に同じ自由記述を書き、`comments` が同じ。
- [ ] 欄の中で `Enter`（改行になり決定しない）・`Ctrl+Enter`（決定）・`Esc`（取り消し）。欄の上でキー・ホイールを操作しても、背面の端末へ届かない。
- [ ] 欄を開くと、ダイアログの高さが増える（画面いっぱいのフォームでは、はみ出さず欄が見える位置までスクロールする）。スマートフォンの実機でも、タップで開いて書ける（画面のキーボードで欄が隠れないか確かめる）。
- [ ] 別のマシンのブラウザ・保存した SSH のマシン（リモートの `soda` が新しい版）の pane の `sodactl ask` でも、`comments` が届く。リモートの `soda` が古い版だと `comments: false`・`comment: false` が効かず、書いた文が届かない（`docs/machines.md`）。

### 共通：ログインなしの `sodactl ask`（`pane.sock`。20261003-sodactl-ask-socket・`docs/sodactl.md`「ログイン不要の受け口（pane.sock）」）

自動のテストは、受け口のやりとり（検査の順・上限・引き継ぎの間の `pane_socket_busy`・接続が切れたら取り消し）・sodactl の経路の選択（受け口 → `/ws` へ落ちる条件・落ちない条件）・実物のサーバと実物の socket での結合・
実物の pane の `SODA_PANE_SOCKET` がそのサーバの実在する `pane.sock`（0600）と一致し、pane の環境に token・cookie の秘密が現れないことを Linux で確かめた。
**macOS・別の OS 利用者から繋げないこと・版を上げた `soda handoff` を跨いだ pane・保存した SSH のマシン・Windows で今までどおりであることは、実物では確かめていない**。

- [ ] Linux・macOS・WSL2：`sodactl login` のキャッシュが無い状態（`~/.sodactl` を別の名前へ退かす。終わったら戻す）で `soda serve` を起動し、ブラウザで pane を開いて、pane の中で `sodactl ask < spec.json`。
      期待：`unauthenticated` にならずにフォームが出て、［決定］で `{"status":"answered",…}` が 1 行返る（終了コード 0）。出どころの行に、その pane の名前・workspace・tab が出る。
- [ ] 同じ pane で `echo "$SODA_PANE_SOCKET"` と `ls -l "$SODA_PANE_SOCKET"`。期待：状態ディレクトリの `pane.sock` で、権限が `srw-------`・持ち主がサーバを起動した利用者。`env | grep -i -e token -e cookie` に soda の token・cookie が出ない。
      状態ディレクトリに `.p-` で始まる一時ディレクトリが残っていない。
- [ ] 別の OS 利用者から繋げない：`sudo -u <別の利用者> node -e 'require("net").connect(process.argv[1]).on("connect",()=>console.log("connected")).on("error",(e)=>console.log(e.code))' <pane.sock のパス>`。
      期待：`EACCES`（`connected` と出たら不合格）。
- [ ] 受け口を使えないときは今までどおり：キャッシュが無いまま、pane の中で `sodactl ask --url "$SODA_SERVER_URL" < spec.json`（接続先を明示）。期待：stderr に `unauthenticated`・終了コード 1（`/ws` の経路へ落ちている）。
      `sodactl login` してから同じコマンドを打つと、フォームが出て答えが返る。ログインなしの `sodactl snapshot` は今までどおり `unauthenticated`（受け口に載っているのは ask だけ）。
- [ ] `sodactl ask` が待っている間に `soda serve` を Ctrl+C で止める。期待：`connection_closed`・終了コード 1 で、ブラウザのダイアログが閉じる。`pane.sock` のファイルが消えている。
- [ ] `soda handoff` の後の、前から動いている pane：受け口を含まない版の `soda serve` で pane を開いておき（その pane で `echo "$SODA_PANE_SOCKET"` は空）、受け口を含む版へ入れ替えて `soda handoff`。
      キャッシュが無いまま、その pane で `sodactl ask < spec.json`（sodactl も新しい版）。期待：フォームが出て答えが返る（`SODA_AGENT_REPORT_SOCKET` と同じディレクトリの `pane.sock` を使う）。
      `soda handoff` の後に開いた pane には `SODA_PANE_SOCKET` が入っている。
- [ ] `sodactl ask` が待っている間に `soda handoff`。期待：待っていた `sodactl ask` は `connection_closed`・終了コード 1 で、ダイアログが閉じる。入れ替えの後に打ち直すと、フォームが出て答えが返る。
- [ ] 名前付き session（`soda serve --session lan`）：その pane の `SODA_PANE_SOCKET` が `…/sessions/lan/pane.sock` で、既定の session のものと別。ログインなしの `sodactl ask` の質問は、その session を開いたブラウザにだけ出る。
- [ ] Windows（ネイティブ）：pane の中で `echo $env:SODA_PANE_SOCKET` が空。キャッシュが無い状態の `sodactl ask` は今までどおり `unauthenticated`・終了コード 1 で、`sodactl login` の後は答えが返る。

### 共通：ファイルのリンクとドロップ（`docs/file-links.md`）

自動のテストは、サーバの `file.*`（実物の `/ws`）・ブラウザの部品（偽のサーバ）と、実物の Chromium での「パスのリンク → ダウンロード」
「ドロップ → 送って置いた先のパスを貼る」「元のパスが分かるドロップ → そのパスを貼る」（ドロップはページの中で組み立てた `DataTransfer`）を確かめた。
**OS のファイルマネージャからの実物のドラッグ・Firefox・Safari・サーバのマシンのアプリで開く動作（`explorer.exe`・`open`・`xdg-open`・`wslview`）は
確かめていない**。

- [ ] 同じマシンのブラウザ（`http://127.0.0.1:7780`）・設定は「自動」：pane で `ls` し、出たファイル名に Ctrl（macOS は Cmd）を押しながら重ねる。
      期待：下線と指のカーソルが出て、クリックするとサーバのマシンの既定のアプリで開く（ブラウザのダウンロードにはならない）。
      `echo src/none.ts`（無いパス）は下線が出ない。`grep -n` の `ファイル:行:` の形もファイルの部分がリンクになる。
- [ ] 同じく、フォルダのパス（`echo ~/`）を Ctrl＋クリック。期待：ファイルマネージャで開く。
- [ ] 同じく、実行になる種類（Windows の `.bat`・macOS の `.command`・Linux の `.desktop`）のパス。期待：開かず、
      「実行できる種類のファイルは、サーバのマシンのアプリでは開きません」のトースト。
- [ ] 画面の無いサーバ・コンテナ（Dev Container 等）へ、転送したポートで繋いだブラウザ・設定は「自動」：パスを Ctrl＋クリック。
      期待：ブラウザのダウンロードになる（サーバに開く手段が無いので切り替わる）。
- [ ] 別のマシンのブラウザ（HTTPS）：パスを Ctrl＋クリック。期待：ブラウザのダウンロードになり、中身が元のファイルと同じ。
      256 MB を超えるファイルは「ファイルが大きすぎます（256MB まで）」。フォルダは「フォルダはダウンロードできません」。
- [ ] `ls --hyperlink=always`（OSC 8 の `file:` のリンク。空白を含む名前のファイルを置いておく）：Ctrl＋クリックで、上と同じ扱いになる。
- [ ] 別のマシンのブラウザで、OS のファイルマネージャから pane へファイルを 2 つ（1 つは空白を含む名前）ドロップする（pane で `cat -v` を
      動かしておく）。期待：ドラッグ中は pane に破線の枠が出て、落とすとブラウザはそのファイルを開かず、
      `'/…/dropped-files/soda-drop-…/名前 1.txt' /…/dropped-files/soda-drop-…/名前2.txt ` が入力される。サーバでそのパスに同じ中身があり、
      Linux・macOS・WSL2 では `ls -l` で `-rw-------`。
- [ ] 同じく、フォルダをドロップ。期待：「フォルダは送れません（ブラウザが中身を渡さないため）」のトーストが出て、何も入力されない。
- [ ] 同じく、ファイルをサイドバー・tab バーへドロップ。期待：何も起きず、画面はそのまま（ブラウザがそのファイルを開かない）。
- [ ] 同じマシンのブラウザで、OS のファイルマネージャから pane へドロップ。**Chrome・Edge** の期待：`dropped-files/` の下のコピーのパスが
      入力される（元のパスはブラウザが渡さない）。**Firefox** の期待：ドラッグ元が `file:` の URI を渡していれば、元のパスが入力される
      （渡していなければ Chrome と同じ）。どちらになったかを記録する。
- [ ] 設定（`prefix+s`・「端末」）の「ファイルのリンクとドロップ」を「別のマシンとして扱う」にして、同じマシンのブラウザでパスを Ctrl＋クリック。
      期待：ダウンロードになる。「同じマシンとして扱う」に戻すと、サーバのアプリで開く。別のブラウザ・別の端末の設定は変わらない。
- [ ] 保存した SSH のマシン（`docs/machines.md`）の pane で、パスの Ctrl＋クリックとドロップ。期待：ダウンロードになるのは**リモートのマシン**の
      ファイルで、ドロップしたファイルはリモートのマシンの状態ディレクトリの下に置かれる。
- [ ] 大きなファイル（数十 MB）をドロップし、送っている間にキーを打つ。期待：「サーバへ送っています…」のトーストが出て、打ったキーは
      パスが貼られた後に届く（最長 20 秒で先に流れる）。

### 共通：エージェントが起動したエージェントの自動載せ（20261003-graph-auto-nodes・`docs/agent-graph.md`「エージェントが起動したエージェントの自動載せ」）

自動のテストで確かめた範囲: `AgentLineage` の単体（`packages/server/src/graph/AgentLineage.test.ts`・`AgentLineage.attach.test.ts`。親の決め方・1 回だけ・重複・別の監督役・逆向き・上限・競合・閉じた pane）、
`callerPaneId` の受け渡し（`packages/protocol/src/messages.test.ts`・`packages/cli/src/callerPane.test.ts`・`packages/server/src/surface/methods/lineage.test.ts`）、
実物のサーバでの一巡（`packages/server/src/composeServer.lineage.integration.test.ts`。`pane split`・`workspace create`・`tab create`・`agent start`・打ち込みの起動・外した子と親・`graph.changed` の配信）、
偽の `claude` を実 PTY で検出させる `packages/cli/src/agentStart.integration.test.ts`。**実物のエージェント（Claude Code 等）が自分で `sodactl` を打つ一巡・実物のブラウザの画面・Windows のサーバ・別のマシンは確かめていない**。
新しい状態ディレクトリか名前付き session で始め、利用者の本物のグラフを汚さない。

```sh
pnpm --filter @sodashitsu/server exec vitest run src/graph/AgentLineage src/composeServer.lineage.integration.test.ts   # 自動で確かめた範囲
```

- [ ] ブラウザでグラフ（`prefix+a`）を開いたまま、pane の中の Claude Code に「`sodactl` で別のエージェントを起動して、README の 1 行目を要約させて」と頼む。期待：Claude が `pane split` と `agent start` を打つと、
      グラフに子と親（この Claude の pane）のノードが現れ、子→親の「監督」と「承認・通知」の線が引かれる（チップの回数は `0/10`）。親に監督役への知らせが届く。
- [ ] 子に承認の要る操作（ファイルの書き込み等）をさせる。期待：子が承認待ちになって約 1 秒後、親へ画面の末尾と「返答は利用者が行います」が届く（「返答まで任せる」にはなっていない）。
- [ ] グラフ画面の子のノードを外す（確認が出て、その線も消える）。期待：同じ子が、その後に作業しても・エージェントを終わらせて起動し直しても、グラフに戻らない。
- [ ] 親のノードを外してから、Claude にもう 1 つ別のエージェントを起動させる。期待：新しい子と一緒に親のノードが戻り、新しい子の線だけが引かれる（前の子は戻らない）。
- [ ] 自動で載ったノードを動かし、線を一時停止する。期待：次の子が載っても、動かしたノードの位置・一時停止の状態は変わらない。別のブラウザ・`sodactl graph show` にも追加が届く。
- [ ] 載らない場合: ブラウザの端末で手で `claude` を起動した pane・`sodactl --machine <名前> agent start …` で別のマシンに起動した pane は、グラフに出ない。
- [ ] 打ち込みの起動: Claude に「`sodactl pane split` で pane を作って、そこに `sodactl pane run` で `claude` を打ち込んで」と頼む。期待：`agent start` を使わなくても、検出されたときに載る。
- [ ] 閉じた子の pane を `sodactl pane close` で閉じる。期待：その pane のノードがグラフから自動で外れる（線も一緒に消える。pane の id は UUID で再利用されない）。
- [ ] `soda serve` を再起動する。期待：グラフに載った子と線は残る。再起動の前に作った pane に後からエージェントが現れても、新たには載らない。
- [ ] Windows ネイティブの `soda serve`: `agent start` は `unsupported_agent_shell`。`pane split` で作った pane に、手で `claude` を打ち込んだときに載る。

### 共通：サブエージェントの表示（20261004-subagent-display・`docs/agent-graph.md`「サブエージェントの件数と一覧」「サブエージェントの表示の仕組みと制約」）

自動のテストで確かめた範囲（実物の Claude Code は使っていない）:

- フックのスクリプト（`packages/server/assets/agent-hook-report.test.ts`。イベントごとの電文・送らないもの・切り詰め）、受け口（`AgentReportSocket.test.ts`）、数える部品（`SubagentTracker.test.ts`）、`SessionService.test.ts`（引き継ぎ）、インストーラ（`AgentIntegrationInstaller.test.ts`。旧版の導入済み → 更新・削除）。
- **実物のスクリプトを子プロセスで動かす結合試験**（`packages/server/src/composeServer.subagents.integration.test.ts`。スクリプト → 実 socket → `SubagentTracker` → `SessionService` → 2 つの接続と snapshot。偽の `claude`）。
- ブラウザ・端末版・グラフ・設定画面の単体（`Sidebar.test.ts`・`SubagentListDialog.test.ts`・`GraphView.subagents.test.ts`・`TuiApp.subagents.test.ts`・`SettingsDialog.test.ts` ほか）と、**E2E**（`packages/e2e/src/specs/subagents.spec.ts`。偽の `claude` に、テストが `agent-report.sock` へ電文を送る）。
- 実物の Claude Code（2.1.289）の `claude -p --settings <一時の設定>` で確かめた事実: 実行前 → 起動の順序・同期と非同期を混ぜたときの順序・`SessionEnd` の発火・フックの所要・matcher・スクリプトが無いときの見え方（`.aidev/works/20261004-subagent-display/decisions.md` D4）。

```sh
pnpm --filter @sodashitsu/server exec vitest run assets src/agent src/composeServer.subagents.integration.test.ts   # フック・受け口・数える部品・結合
pnpm --filter @sodashitsu/e2e exec playwright test src/specs/subagents.spec.ts                                       # E2E（先に pnpm build）
```

**自動のテストでは確かめていない（実機で）**。利用者の本物の `~/.claude/settings.json` を書き換えるので、導入の確認は `CLAUDE_CONFIG_DIR` で別の場所を指した Claude Code か、バックアップを取ってから行う。新しい状態ディレクトリか名前付き session で始める。

- [ ] 導入: 設定画面の「エージェント連携」で Claude Code を［導入］。期待: `settings.json` の `hooks` に `SessionStart`・`PreToolUse`（matcher `Agent|Task`）・`SubagentStart`・`Stop`・`SubagentStop`・`SessionEnd` の 6 つが入り（ほかのフックは変わらない）、すでに動いている Claude Code は起動し直すと効く。
- [ ] 更新: 旧版（`SessionStart` だけ）の導入済みの環境で設定画面を開く。期待: 「更新が必要」と［更新］が出る。押す前は設定ファイルが変わらない。押すと足りない 5 つだけが足りる（重ならない・ほかのフックが残る）。
- [ ] 前面のサブエージェント: pane の Claude Code に「Agent ツールで 2 つのサブエージェントを並行に動かして、それぞれ 20 秒待ってから終わって」と頼む。期待: サイドバーの行（と、グラフを開いていればそのノード）に件数 `2` が出て、一覧に種類・短い説明・経過時間が並び、終わると 0 になってボタンが消える。
- [ ] バックグラウンドのサブエージェント: 「バックグラウンドで 1 つ動かして、すぐ次の話をして」と頼む。期待: 親の作業が終わった後も件数が残り（バックグラウンドの印つき）、サブエージェントが終わると消える。
- [ ] 並行・入れ子: 1 つのメッセージで複数のサブエージェントを起動させる。期待: 件数が同じだけ増え、それぞれに短い説明が付く（付かないものは種類だけ）。サブエージェントの中のサブエージェントは、フックが出す範囲だけが数に入る（出さなければ数えない）。
- [ ] 取りこぼし: Claude Code を強制終了（`kill -9`）した後、`soda` の画面の件数は残りうる（既知の制約）。pane のエージェントが居なくなる・入れ替わると消える。
- [ ] 更新と解除は、その後に起動した Claude Code から効く: 解除した後、動いたままの Claude Code が、フックのスクリプト（何もしない中身になっている）を呼び続けても、エラーを出さずに動く。
- [ ] 別のマシン: 別のマシンのノードの件数が、そのマシンにフックを入れていれば出る。入れていなければ出ない。
- [ ] 端末版: エージェントの行の末尾の `⤷n` が、使っている端末のフォントで 1 桁に見え、桁がずれない（ずれたら記号を替える。`decisions.md` D11）。
- [ ] Windows ネイティブ: フックの導入・更新・解除と、サブエージェントの表示が動く。

### 共通：境目と区画の見え方・操作（20261004-ui-interaction-polish・`docs/herdr-parity.md` H19・`docs/tui.md`「マウス」）

自動のテストで確かめた範囲: 境目の見え方の単体（`uiTokens.test.ts`＝17 のテーマで線の色が両方の背景に 3:1 以上・`useResizeDrag.test.ts`・`Sidebar.test.ts`・`Splitter.test.ts`）と、E2E（`resize-handles.spec.ts`・`sidebar-sections.spec.ts`。Chromium の hover・ドラッグ・キー・「動きを減らす」の emulation・読み込み直し）、端末版の単体（`sidebar.test.ts`・`mouse.test.ts`）。

```sh
pnpm --filter @sodashitsu/e2e exec playwright test src/specs/resize-handles.spec.ts src/specs/sidebar-sections.spec.ts   # 先に pnpm build
```

**自動のテストでは確かめていない（実機で）**:

- [ ] 17 のテーマの線の見え方: 設定の「テーマ」を 17 通り切り替え、サイドバーの幅・pane の間・spaces と agents の境目に乗せたときの強調の線が、背景に対して見分けられる（特に dracula・tokyo-night-day・solarized-light・rose-pine-dawn。線の色は設定の色の上書き「境目の線」で変えられる）。
- [ ] タッチ: タブレット等で、3 か所の境目を指でドラッグして大きさを変えられる（掴みやすさ。画面のスクロールが誘発されない）。1 列のモバイルの画面は対象外。
- [ ] OS の「動きを減らす」: 入れると、線の出入りが一瞬になる（Chromium の emulation は自動のテストで確認済み。実際の OS の設定で）。
- [ ] 端末版: 使っている端末で、spaces の見出し・agents の区切りの行の `▾`／`▸` が 1 桁に見え、桁がずれない。見出しの行の押下と、区切りの行の「動かさずに離す」「動かして離す」が意図どおりに分かれる。

### 開発者向け：画面の見た目を、変更の前後で画素まで比べる（20261008-ui-style・`scripts/ui-style-compare.mjs`）

見た目を変えない変更（部品の `<style>` の数値の置き換えなど）で、**画面が 1 画素も変わっていないこと**を確かめる道具。

```sh
node scripts/ui-style-compare.mjs                       # 元は origin/main。いまの作業フォルダと比べる
node scripts/ui-style-compare.mjs <コミット>             # 元を指定する（HEAD どうしで、道具そのものの確かめもできる）
node scripts/ui-style-compare.mjs --style modern        # いまの作業フォルダを modern の様式で撮る（元は、いつも classic）
node scripts/ui-style-compare.mjs --out <dir> --keep    # 画像の置き場所を指定・元の作業フォルダを残す
```

- **何を比べるか**: `packages/e2e/src/specs/ui-style-shots.spec.ts` が撮る画面（暗い・明るいテーマで 16 枚ずつ、計 32 枚）: 起動のヒントのトースト・基本画面（pane 2 つ・tab 2 つ・サイドバーにグループ）・右クリックのメニュー・設定のダイアログの各節（7 枚）・ヘルプ・確認のダイアログ・グラフの画面・表示の面（パネル 4 つの側と帯 2 つ）・ログインの画面・モバイルの 1 列の画面。画像は 1 枚ずつ、画素で比べる。**許す差は 0 画素**。差のある画像の名前・差の画素の数・差の画像（赤い画素）の場所を出し、1 枚でも差があれば終了コード 1。
- **同じ機械の上の、変更の前後の比較**: 元のコミットを `git worktree` で一時の場所へ出し、`pnpm install --frozen-lockfile`・`pnpm build` して、いまの作業フォルダと**同じ機械で**撮る。文字の描画は機械で違うので、基準の画像をリポジトリに入れたり、別の機械の画像と比べたりしない。一時の作業フォルダは、終わると片づける。
- **撮り方の決まり**（揺れないように）: 端末（`.xterm`）の文字は描かない（`visibility: hidden`）・トーストが消えるのを待つ・`animations: "disabled"`・`caret: "hide"`・`document.fonts.ready` と `client.view` の落ち着きを待つ・workspace の場所は git の外の一時のフォルダ（作業フォルダの枝名・変更の数が、サイドバーに出ないように）・サーバの一時のフォルダ名が出る場所（拡張の設定の置き場所）は隠す。
- **spec だけを流す**: `UI_STYLE_SHOTS_DIR=<dir> UI_STYLE=classic|modern` を渡すと、`packages/e2e` で `env -u DISPLAY -u WAYLAND_DISPLAY pnpm exec playwright test ui-style-shots --workers=1` が画像を撮る（渡さないふだんの E2E では飛ばす）。
- **時間**: 全体でおよそ 2 分（元の install・build に十数秒、撮影が元・いまの各 45 秒ほど）。メモリが少ない環境では、ほかの E2E と同時に流さない。
- **いまの作業フォルダも、撮る前に `pnpm build` する**（元と対称。古いビルドのまま撮って「差 0」と誤らないため。+十数秒）。元は `git fetch` しないので、`origin/main` が古ければ古い元と比べる。元が古すぎると、spec が使う `support/` の部品が無くて撮れずに失敗する（偽の差 0 にはならない）。**逆に、元が新しすぎても（main が動いて、画面の作りが変わったとき。例: グラフが重ねるダイアログから主な領域の画面になった）、spec の手順が合わず、撮れずに失敗する**（これも偽の差 0 にはならない）。そのときは、spec を新しい画面に合わせるか、元に「その変更の親」のコミットを指定する。初回は pnpm のストアが冷えていて、install・build がもっと長い。
- **終了コード**: 0 = 全部差 0 ／ 1 = 差あり・画像の枚数が期待（32 枚。スクリプトの `EXPECTED_SHOTS`）と違う ／ 2 = 道具の失敗（引数・build・撮影・例外）。失敗・中断（Ctrl-C）のときも、一時の作業フォルダは片づける。`--out` は、空か無いフォルダだけ（中身を消さないため）。
- **描画の揺れ**: 1 枚の中の差が、すべて「各色の成分の差が 1 以下」の画素で、かつ 16 画素以下なら、差ありにせず「揺れ」として別に数え、名前を出す（角の丸みの縁の描画が 1 段階ずれる、など）。それを超える差は差あり。`--strict` を付けると、揺れも差ありにする。
- **道具の自己テスト**: `node scripts/ui-style-compare.mjs --selftest`（わざと 1 画素変えた画像・大きさの違う画像・片方にしか無い画像・読めない画像が、差あり・失敗になる）。比較の関数を直したときに流す。
- **様式が当たったことの確認**: spec は、撮る前に `<html data-ui-style>` が `UI_STYLE` と同じことを確かめる（当たっていなければ失敗。「モダンが当たらないまま差 0」を防ぐ）。
- **撮れない所**: 端末（`.xterm`）の中のスクロールバー・選択の見た目。
- **差が出たら**: 撮り方（待ち・隠し）を疑う前に、まず変更の側を疑う。撮り方を直すのは、同じコミットどうし（`HEAD` と `HEAD`）で差が出たときだけ。

### 任意：Tailscale・リバースプロキシ（使う構成だけ）

どちらもこの検証環境では実機で確かめていない（`docs/tls-setup.md` の手順は公式の docs に合わせて書いた）。使うなら、最後に
「共通：AC1〜AC9 の一巡（別のマシンのブラウザで）」を行う。**先に、手元用（127.0.0.1:7780・既定の状態ディレクトリ）と、この節の
AC11 の LAN 用（8443・`~/.local/state/soda-lan`）の `soda serve` を止めておく**——下の 2 つはポート 7780 と `~/.local/state/soda-lan`
を使うので、止めずに起動すると、同じ状態ディレクトリは `already in use by another soda`（終了コード 2）、同じポートは `EADDRINUSE`
（`--host 0.0.0.0` の 7780 も、127.0.0.1 の 7780 と重なる）で起動しない。`~/.local/state/soda-lan` は 2 回目以降の起動なので、
ログイン画面に控えた token を入れる。

- [ ] Tailscale：`docs/tls-setup.md`「tailscale cert（Tailscale ネットワーク内。Let's Encrypt 由来）」の手順で、鍵の権限の方法1か2の
      とおりに証明書を作り、`soda serve --host 0.0.0.0 --port 7780 --cert <名前>.crt --key <名前>.key --origin https://<machine>.<tailnet>.ts.net:7780 --state-dir ~/.local/state/soda-lan`
      で起動する。期待：`cannot read --key` で止まらず、最初の `soda: open` の行が `https://<machine>.<tailnet>.ts.net:7780/…`。
      tailnet の別の端末でその URL を開くと、証明書の警告なしで開き、ログインできる。
- [ ] リバースプロキシ：`docs/tls-setup.md`「リバースプロキシの後ろに置く」の nginx の例のとおりにプロキシを置き、soda を
      `soda serve --host 127.0.0.1 --port 7780 --origin https://soda.example.com --state-dir ~/.local/state/soda-lan` で動かす。期待：
      `https://soda.example.com/` でログインでき、端末が出て入力できる。何も打たずに 2 分ほど置いてから打っても、すぐに届く（途中で
      「再接続中…」が出ない。`/ws` の `proxy_read_timeout` が効いている）。`~/.local/state/soda-lan/server.log` に `origin rejected`
      が出ない（出るなら、プロキシが `Host` を書き換えていないか。同じ節の `Host` の項目）。

### うまくいかないとき

- **ログインが 403 で断られる**（Origin の不一致）：ログイン画面に「このページのアドレス（…）からのログインを、サーバが
  許可していません」と、写せる形の `--origin <このページの Origin>` の行が出る——その行を今の起動オプションに加えて起動し直す
  （サーバのログにも `origin rejected` が出る。`docs/tls-setup.md`「手順2：Origin の許可（別マシンから繋ぐ場合の注意）」）。
  この拒否は token とは関係ない（token はまだ確かめていない）ので、`soda token reset` はしない。
- **ログイン済みのまま、端末の画面に「接続できません（このアドレスは許可されていません）」の枠が出る**（D106・D107）：ログイン
  （Cookie）は有効だが、このページのアドレスをサーバが許可していない（ページを開くときの確認 `/api/session` と WebSocket の `/ws`
  がどちらも 403。`--origin` で許可していた名前で開いたまま `--origin` を付けずに起動し直した・同じ名前の別のポート（転送した
  ポート）で開き直した等）。自動では繋ぎ直さない。枠の `--origin <このページの Origin>` の行を起動オプションに加えて起動し
  直してから、枠の「再試行」を押す（token の作り直しは要らない）。端末は枠の後ろに出たままで、scrollback は読める。
- **「再接続中…」の下に「つながらない状態が続いています。…」と `--origin` の行が出る**（D107）：ログインは有効で
  `/api/session` も通るのに、WebSocket だけが 3 回続けてつながらなかった（つながっていた接続が切れた後なら、1・2・4 秒の
  間隔で約 7 秒。ページを開いた直後なら約 3 秒）。リバースプロキシが `Host` を許可された名前で
  渡しているのに、`--origin` が無い場合等。サーバのログに `origin rejected` が出ていれば、その行を加えて起動し直す。サーバが起動の
  途中（保存された pane のシェルを起動し直している）なら、しばらく待てばつながって消える（繋ぎ直しは続けている）。
- **ログインの後に「接続中…」から進まない**：サーバが起動の途中なら少し待つ。続くなら、リバースプロキシが `/ws` の WebSocket の
  Upgrade を転送しているか（`docs/tls-setup.md`「リバースプロキシの後ろに置く」）。「ログインはできましたが、接続の確認でサーバが
  ログインを受け付けませんでした」と出たら、ブラウザが Cookie を保存していないか、その間に token が作り直された——もう一度
  ログインする。
- **開けない（タイムアウト）** ならファイアウォール（`docs/tls-setup.md`「手順4：ファイアウォール（構成ごと）」）。**証明書の警告**
  なら SAN と CA（「手順1：証明書を用意する」）。
- **token を 1 分以内に 5 回間違えた**：その接続元からのログインが最大 1 分（1 時間に 20 回に達したら最大 1 時間）429 で断られる（画面にも
  「ログインの失敗が続いたため、…」と出る。この間は正しい token でも入れない。soda の再起動で数え直し。portproxy・リバース
  プロキシの後ろでは全員で共有。`docs/tls-setup.md`「リバースプロキシの後ろに置く」）。
- **画面の下に短く出る通知（エラー）は日本語**で、何が起きたかを示す（D107）。たとえば 1 回で 1MB を超える貼り付けは
  「送った内容をサーバが受け付けませんでした（1 回の貼り付けが 1MB を超えた等）。その分は端末に届いていません。」——分けて貼る。
  pane のプログラムが入力を読まずに固まっている（サーバに溜まった入力と新しい入力の合計が 16 MiB を超える）ときに打つと、
  「この pane のプログラムが入力を読んでいないため、送った入力を捨てました（サーバに溜まった入力が上限に達しています）。」が 2 秒に 1 回出る
  ——その pane のプログラムを止める（Ctrl-C 等が届かないなら pane を閉じる）。
- **打った文字が画面に出ない（「再接続中…」も出ていない）**：スマートフォンのスリープ・回線の切り替えの後等で、接続が黙って
  切れているのに、ブラウザがまだ気づいていない（「既知の制約」の 1 つ目）。ページを開き直す。

## 実機（iOS Safari・Android Chrome。AC12）

`packages/e2e/src/specs/mobile.spec.ts` は Playwright の chromium ベースのモバイルエミュレーション
（`devices["iPhone 13"]` の viewport・タッチ・UA を chromium で再現したもの）でしか確認していない。
**実際の Safari（WebKit）・実機のタッチ操作・ソフトキーボードは未検証**——以下を実機で確認する。

**AC16 は AC12 も 3 環境で求める**ので、この節は「別のマシンからの TLS 接続（AC11）」の「Linux」「WSL2」「Windows ネイティブ」の
3 つのサーバそれぞれに対して一通り行う（例 `https://192.168.1.50:8443`）。ただし「準備とログイン」のログイン画面の文言は
ブラウザの側だけの処理なので、どれか 1 つの環境で確かめれば足りる。比べるために、PC のブラウザ（サーバのマシンの
`https://localhost:8443/` か別のマシン）でも同じ pane を開いておく。

以下のコマンドは pane のシェルが bash（Linux・WSL2）の形。Windows ネイティブ（PowerShell）では次に置き換える（PowerShell の形は
この検証環境では未確認）：

| 用途 | Linux・WSL2（bash） | Windows ネイティブ（PowerShell） |
|---|---|---|
| PTY の大きさ（行数 列数） | `stty size` | `"$([Console]::WindowHeight) $([Console]::WindowWidth)"` |
| 1 秒ごとに出し続ける | `while sleep 1; do stty size; done` | `while ($true) { "$([Console]::WindowHeight) $([Console]::WindowWidth)"; Start-Sleep 1 }` |
| 時刻 | `date` | `Get-Date` |

- PTY の大きさは、pane で `stty size` を実行すると「行数 列数」（例 `40 120`）で出る。
- 「この端末に合わせる」は上部のバーのボタン。押すと PTY をスマートフォンの画面の大きさにする（サイズの権限を取る）。押して
  いない間は PTY の大きさを変えず、PC のブラウザが決めた大きさを画面の幅に縮めて表示する（D106）。
- スマートフォンから `Ctrl+C` を送るには、追加キーの列（上部のバーの ⌨ で出し入れ）の `Ctrl` を押してから `c`。prefix の
  キーは `Prefix` を押してから 1 キー。

### 準備とログイン

- [ ] mkcert の CA をスマートフォンに入れる（`docs/tls-setup.md`「手順1：証明書を用意する」の mkcert の節の「iOS・iPadOS」
      「Android」。iOS は「証明書信頼設定」でオンにするのを忘れない）。期待：スマートフォンのブラウザで
      `https://192.168.1.50:8443/` を開くと、証明書の警告なしでログイン画面が出る。HTTPS でつなぐこと（Clipboard API 等が
      secure context を要求するため、HTTP では M4 の自動コピー・`Ctrl+Shift+V` 相当の貼り付けが機能しない。research.md F9.4）。
- [ ] ログイン画面の理由ごとの文言（D105）の 1——token の誤り：違う token を入れて「ログイン」。期待：「token が違います。…」。
      この項目から下のログイン画面の項目では、どの文言も画面の幅で折り返され、ソフトキーボードを開いたままでも読めて、
      「ログイン」を押せること。
- [ ] ログイン画面の 2——失敗の続きすぎ：1 分以内に、違う token（1 文字等の短い誤りでよい）を続けて計 5 回入れた後の 6 回目
      （数えるのは接続元ごとの 1 分の間の失敗）。期待：「ログインの失敗が続いたため、
      サーバがログインを一時的に止めています（この間は正しい token でも入れません。…）」。1 分ほど待ってから次へ（待たずに
      進むなら、soda を起動し直すと数え直しになる）。
- [ ] ログイン画面の 3——サーバが止まっている：サーバを止めて（Ctrl+C）から「ログイン」。期待：「サーバに接続できません。…」。
      起動し直す。
- [ ] ログイン画面の 4——ログインできる：正しい token（32 文字。PC の画面を見ながら打つ）を入れる。期待：「接続中…」が出て
      から端末の画面に替わる。
- [ ] ログイン画面の 5（任意。スマートフォンが `<ホスト名>.local` の名前を引ける環境だけ）——許可されていないアドレス：
      `https://<サーバのホスト名>.local:8443/` で開き（証明書の警告は承認して進む）、token を入れる。期待：「このページの
      アドレス（https://<ホスト名>.local:8443）からのログインを、サーバが許可していません。…」と
      `--origin https://<ホスト名>.local:8443` の行が出る（`.local` の名前は自動では許可されない。`docs/tls-setup.md`
      「手順2：Origin の許可（別マシンから繋ぐ場合の注意）」）。

### 1 列のレイアウトと入力

- [ ] 1 列のレイアウト：期待：上部のバー（「<workspace> / <tab>」・「この端末に合わせる」・⌨・「設定」）の下に pane が 1 つだけ出て、
      デスクトップのサイドバー・tab バーは出ない。端末をタップするとソフトキーボードが出て、`echo hello` を打つと `hello` が出る。
- [ ] 追加キーの列：⌨ を押す。期待：画面の下に `Esc`・`Tab`・`Ctrl`・`Alt`・`↑`・`↓`・`←`・`→`・`PgUp`・`PgDn`・`Prefix` の
      11 個が並ぶ。`↑` で前のコマンド（`echo hello`）が出る。途中まで打ってから `Ctrl` → `c` で、その行が取り消される。
- [ ] prefix のキー：`Prefix` → `c`。期待：新しい tab の名前を尋ねるダイアログが出る。名前（例 `t2`）を入れて Enter で、バーが
      「<workspace> / t2」になり、新しい tab のシェルが出る。
- [ ] pane ピッカー：バーの「<workspace> / <tab>」を押す。期待：全画面の一覧が出て、上に workspace とその tab の行（状態の
      印つき）、下にエージェントの動いている pane の行（あれば）が並ぶ（エージェントの居ない pane そのものの行は無い——tab を選ぶと
      その tab の焦点の pane が出る）。前の tab の行を押すと、一覧が閉じてその tab の pane の表示に替わり、先に打った `hello` が
      見える。もう一度開き、× で閉じられる。行の印が × ✓ ◐ ○ · の字形で出て、豆腐や絵文字にならないことも見る（端末のフォントが
      デスクトップと違う）。上のバーの「設定」から設定を開き、「閉じる」で閉じられる。
- [ ] 縦スワイプでの scrollback（`mobile/TouchScroll.ts`。decisions.md D83：xterm.js 6.0.0 の
      ネイティブなタッチスクロールは壊れているため自前実装で補っている）が実機でも自然に動くか。モバイルで遡れるのは、既定の「自動」では
      1,000 行まで（D107。デスクトップの 5,000 行より少ない）。上のバーの「設定」の「端末」で行数を選べる（`--scrollback` の値まで）。
- [ ] ソフトキーボードの開閉で表示領域が追従するか（`mobile/useVisualViewport.ts`。visual viewport の
      高さの変化への追従は実機のソフトキーボードでのみ確認できる）。期待：開くと、上部のバーから追加キーの列までが
      キーボードの上に収まる（「この端末に合わせる」を押していれば、端末もその中に収まる。下の節）。
- [ ] リンク（M6・D110）：`echo https://example.com/` を実行し、出た URL をタップする。期待：何も開かない（リンクは Ctrl・Cmd を
      押しながらのクリックで開く仕様で、タップには修飾キーが無い。「既知の制約」）。

### 「この端末に合わせる」とサイズ（D106・D108）

- [ ] 押していない間は PTY の大きさを変えない（D106）：PC のブラウザで pane を開き、`stty size` を実行する（例 `40 120`）。
      スマートフォンで同じ pane を開いて `stty size` を実行する。期待：同じ値で、スマートフォンでは画面の幅に縮めて表示される。
      PC のブラウザを閉じてからスマートフォンでページを開き直しても、`stty size` は変わらない。
- [ ] 押すと画面いっぱいになる（D108）：「この端末に合わせる」を押す（押された表示になる）。期待：端末が等倍で、表示領域
      （上部のバーと追加キーの列を除いた所）いっぱいに出る——右や下にはみ出さず、大きな余白も無い。`stty size` がスマート
      フォンの大きさになる（縦長なら 50 列前後。画面と文字の大きさで変わる）。PC のブラウザは、その大きさを縮めるか余白を
      つけて表示する。
- [ ] 回転・ソフトキーボード・追加キーの列に追従する（D108）：押したまま、`while sleep 1; do stty size; done` を動かしておく。
      期待：横長にすると、数秒のうちに列が増えて行が減った値が出て、端末が画面いっぱいに描き直される。縦に戻すと元の値に
      戻る。ソフトキーボードを開くと行が減り、閉じると戻る。⌨ で追加キーの列を出し入れすると行が増減する。
- [ ] ピンチで拡大・縮小しても PTY の大きさは変わらない（D108）：同じループを動かしたまま、**上部のバーか追加キーの列の上で**
      ピンチして拡大・縮小する（端末の上は縦のスワイプを scrollback に使うため `touch-action: pan-x` にしてあり、そこで始めた
      ピンチはブラウザが拡大しないことがある）。バーの文字が大きくなる等、ページが実際に拡大されたことを確かめてから判断する。
      期待：出る値が変わらない（拡大は見た目だけ）。終わったら縮小して戻し、`Ctrl` → `c` でループを止める。
- [ ] もう一度押すと手放す：期待：押されていない表示に戻り、画面の幅に縮めた表示になる。PC のブラウザが同じ tab を開いて
      いれば、何もしなくても PTY はすぐ PC の窓の大きさに戻る（手放した大きさの権限は、その tab を見ている大きさを決められる
      クライアントへ移る。`stty size` で確かめる）。
- [ ] 隠れた pane の大きさ（D105）：「この端末に合わせる」を押したまま、最初の pane で `while sleep 1; do stty size; done` を
      動かし、`Prefix` → `v` で分割する（スマートフォンは新しい pane を表示し、最初の pane は隠れる）。10 秒ほど待ってから
      `Prefix` → `h` で最初の pane に戻る。期待：最初の pane に出ている値が、隠れている間もずっと同じ（`1 1` のような値が一度も出ない）。
      PC のブラウザでも最初の pane の表示が崩れない。

### 再接続（D95・D107・D108）

- [ ] 再接続の後もソフトキーボードが閉じず、画面が動き続ける（D95・D107）：端末をタップしてソフトキーボードを出し、`date` を
      打てることを確かめる。キーボードを出したまま、サーバを止めて（Ctrl+C）、数秒後に同じコマンドで起動し直す。期待：
      「再接続中…」と「つながるまで入力できません」が重なり、その間に打った文字は端末に出ない（届かない。溜めて後から送る
      こともしない）。つながると重ね表示が消え、**ソフトキーボードは開いたまま**で、タップし直さずに打てる。`date` の結果が
      画面に出る（新しい接続でも出力が届く）。起動し直すと pane のシェルは新しく起動し直される（AC18）。
- [ ] 再接続の後も「この端末に合わせる」が効く（D108）：押して `stty size` の値を控え、サーバを止めて同じコマンドで起動し直す
      （その間、PC のブラウザには触らない。触ると PC が大きさを取る——「既知の制約」）。期待：つながった後、ボタンは押された
      表示のまま、端末は画面いっぱいで、`stty size` が控えた値と同じ。

### 既知の未解決課題

- [ ] xterm.js のモバイルの未解決課題（decisions.md D83 の対象外一覧。製品側では対応しない）：
      Android Chrome＋Gboard の文字入力の乱れ（xterm.js upstream #3600）、タッチ端末でのコピー＆
      ペースト不可（xterm.js upstream #3727）。実機で再現するか確認し、再現しても既知の upstream
      課題として扱う（本製品のコードでは回避しない）。

## 確認の通知の右上の積みと、先送りした通知のベル（20261005-notify-bell）

エージェントの入力待ち・完了の知らせ（トースト）は画面の**右上**に積まれ、応答せずに閉じた知らせは**ベル**（件数のバッヂ）から見返せる。
ブラウザの DOM で確かめられる範囲（位置・件数・ポップアップ・一括削除・解消・再読み込み・モバイルの幅）は `packages/e2e/src/specs/notification-history.spec.ts`
が自動で見る。下は**自動では見えない実機の項目**。

### 実機の手順

- [ ] デスクトップ（Chrome・Edge・Firefox）で、別の tab へ移してエージェントを入力待ちにする。期待：知らせが画面の右上に出て、端末の入力位置（プロンプト）に被さらない。
      3 件以上たまっても縦に並んで重ならず、古いものが上・新しいものが下。長い呼び名は 1 行に切れ、［移動］と［×］が見えている。
- [ ] 知らせを×で閉じる。期待：サイドバーの下端のベルに件数のバッヂが付く（畳んだサイドバーでも見える）。0 件のときはバッヂが無い。
- [ ] ベルを押す（またはキー `prefix+shift+o`。設定の「キー」の `open_notification_history`）。期待：「判断を先送りした通知」のポップアップが開き、新しい順に
      種類（入力待ち・完了）・呼び名・時刻・［移動］・［×］が並ぶ。↑↓・Home・End で行を移れ、Enter でその pane へ移って行が消え、Delete で 1 件消え、Esc で閉じてベルへフォーカスが戻る。
- [ ] ［すべて削除］を押す。期待：同じ場所が「n 件をすべて削除しますか？」に変わり、［やめる］で取り消せる（Esc は確認だけを取り消す）。［削除する］で 0 件になりバッヂが消える。
- [ ] 閉じた入力待ちの知らせについて、その pane で応答して入力待ちから戻す／pane を閉じる／エージェントを終える。期待：画面を開いたまま、ベルの件数が自動で減る。
      完了の知らせは、その pane を見る（見えていてウィンドウにフォーカスがある）と消える。
- [ ] ブラウザを再読み込みする。期待：まだ解消していない知らせは残り、閉じている間に解消した知らせは復活しない。別のブラウザには共有されない（このブラウザだけ）。
- [ ] OS の「視覚効果を減らす（動きを減らす）」を入にして知らせを出す。期待：右からのスライドが付かない。
- [ ] 実機のスマホ（iOS Safari・Android Chrome）。期待：知らせは上部バーの**下**に出て、［連携］［設定］［ベル］を隠さない。ノッチの下にも入らない。ベルが押せ、ポップアップを指で操作できる。

## 端末版（20260927-cli-mode）

引数なしの `soda` で開く端末版（`docs/tui.md`）を、3 つの OS と SSH 越しの実物の端末で確かめる手順（20260927-cli-mode の AC16。対象は AC1〜AC14 と AC18）。
機能ごとの扱いは `docs/tui-parity.md`。

### 自動で確かめられる部分（Linux・WSL2）

```sh
pnpm -s build
node scripts/tui-pty-verify.mjs            # 疑似端末（node-pty）で soda を一巡。数秒。成功で終了コード 0・「tui-pty-verify: OK」
node packages/tui/dist/bench/latency.js    # 性能（AC17）。十数秒。--json で 1 行の JSON
```

- `scripts/tui-pty-verify.mjs` は、一時の状態ディレクトリ・空いているポートで、起動と描画 → はじめの案内が出て Enter で閉じ案内済みが `prefs.json` に残る → pane への入力 → `prefix+q` で終了コード 0・サーバは動き続ける
  → 再接続で同じ画面とスクロールバック（ホイールで遡る）→ 端末版 2 つの同時接続 → ブラウザ相当のクライアント（ローカルログインの cookie で `/ws`）との
  同時接続を確かめ、最後にサーバを止めて一時ディレクトリを消す（AC1・AC2〔描画。大きさの追従は含まない〕・AC3・AC11〔構成の変更と入力の反映。設定と pane の大きさは含まない〕・AC12・H25b）。ビルドはしないので先に `pnpm -s build`。Windows では何もせず成功で終わる。
- `packages/tui/dist/bench/latency.js` は入力から描画までの遅延（1 pane・大量出力の隣・16 pane）とエージェントの表示の反映を測る。目安と、手で測る残り
  （本物のエージェントの 5 状態の遷移）は `packages/tui/src/bench/README.md`。共有のマシンでは 1 回だけ走らせる。
- 単体・結合のテスト（`pnpm test`）は偽の外側の端末で画面の文字を確かめる。**実物の端末エミュレータでの見え方・マウス・IME・通知・貼り付けは下の手作業で**確かめる。

### 対象の端末

| 環境 | 確かめる端末 |
|---|---|
| Windows ネイティブ | Windows Terminal（PowerShell）・VS Code の統合端末 |
| WSL2 | Windows Terminal・VS Code の統合端末 |
| Linux | VS Code の統合端末（Remote/devcontainer を含む）・tmux の中（任意の端末の上） |
| SSH 越し | 上のいずれかから SSH で入った先 |

デスクトップ通知（OSC 9/99/777）は上の端末のうち対応するもの（Windows Terminal の OSC 777）だけを見る。kitty・WezTerm・Ghostty は判定の単体テストで扱い、実機は任意。

### 各端末での一巡

新しい状態ディレクトリで始める（利用者の本物の session を汚さない）。**既定の session は、状態ディレクトリを替えてもポート 7780 を使う**ので、
自分の `soda` が 7780 で動いていると裏での起動が失敗する（`soda serve exited before it became ready`）。そのときは名前付き session で、
最初に 1 回だけ `soda serve` を別のポートで起動してポートを覚えさせる（名前付き session は `serve.json` のポートを次から使う）。

```sh
d=$(mktemp -d)
soda --state-dir "$d"                                        # 7780 が空いているとき（Linux・WSL2）
# 7780 が使われているとき: 1 回だけ別のポートで起動して token を控え、Ctrl+C で止める。以後は --session check を付ける。
soda serve --state-dir "$d" --session check --port 7790
soda --state-dir "$d" --session check
```

```powershell
$d = Join-Path $env:TEMP "soda-tui-check"; soda --state-dir $d   # Windows ネイティブ（7780 が使われていれば上と同じく --session check と --port）
```

以下の `<ポート>` は起動時の案内の URL のポート（既定の session なら 7780、上の回避なら 7790）。終わったら
`soda session stop default --state-dir "$d"`（名前付きなら `soda session stop check --state-dir "$d"`）で止めて消す。

1. **起動（AC1・AC2）**: 裏でサーバが起動し、標準エラーに初回の token が出てから、サイドバー（Spaces）・tab バー・pane の枠が描かれる。
   新しい状態ディレクトリでは、はじめの案内が出る（Enter・→・`l` で設定画面の「エージェント連携」の節へ移る。Esc・外側のクリックでは閉じない。次に開いたときは出ない）。
   端末の大きさを変えると追従する。幅 64 桁未満で 1 列表示になる。もう 1 つ端末を開いて `soda --state-dir <同じ場所>` を打つと、起動せずに同じサーバへ繋ぐ。
2. **pane（AC6）**: `vim`・`htop`（Windows は `edit`・`winget` 等の全画面のもの）が崩れない。`printf '\e[38;2;255;100;0mTRUE\e[0m\n'` が橙色（24 ビット色の端末）。
   全角の文字・絵文字の幅がずれない。IME で日本語を入れると候補窓が pane のカーソルの位置に出る。`vim` の `:set mouse=a` でクリックが vim へ届く。
   複数行を貼り付けると 1 回で入る（ブラケットペースト）。
3. **操作（AC5・AC8・AC-I1〜AC-I5）**: `docs/tui.md`「キー」の表を上から一通り。名前変更は Enter で確定・Esc で元のまま。実行中のプロセスがある pane を閉じると確認が出る。
   設定（`prefix+s`）の「キー」でプリセット「tmux」に替えるとブラウザでも替わる。
4. **マウス（AC7・AC9）**: `docs/tui.md`「マウス」を一通り（境界・サイドバーの幅・区画の境界・tab と workspace の並べ替え・pane の名前のドラッグで分割/置き換え/移動・
   右クリックのメニュー・ホイール・スクロールバー・選択とコピー・ダブルクリック・Ctrl+クリックのリンク）。選択してコピーした文字を、外側の端末の貼り付けで別の場所に貼れる。
5. **切り離しと再接続（AC3）**: pane で `seq 1 500` を出してから `prefix+q`。終了コード 0 で元の画面に戻る（`echo $?`）。端末の窓ごと閉じる・SSH を切る場合も試す。
   もう一度 `soda --state-dir <同じ場所>` で、同じ構成・同じ画面に戻り、ホイールで 1 まで遡れる。**Windows では、端末の窓を閉じてもサーバが残る**
   （`soda session list --state-dir $d` が running）ことを確かめる（WMI の起動。失敗して普通の起動に落ちたときは起動時に知らせが出る）。
6. **ブラウザとの同時接続（AC11・AC12）**: 1. の token でブラウザからも同じサーバ（`http://127.0.0.1:<ポート>`。起動時の案内の URL）を開く。
   片方で分割・名前変更・入力・設定（テーマ）を変えると、もう片方にすぐ出る。同じ tab を見ているとき、最後にキーを打った側の大きさに pane が合い、
   もう片方は左上合わせで切り取られる（右下に `⋯`）。端末版を 2 つ同時に開いても壊れない。
7. **エージェント（AC10）と通知（AC13）**: pane で Claude Code 等を動かし、サイドバーの Agents に名前と状態が 2 秒以内に出る。入力待ち・完了で
   トースト（右下）が出て、音の設定が入ならベルが鳴る（ブラウザ版のトーストは右上。上の「確認の通知の右上の積み」）。Windows Terminal では設定「端末版 → 通知の出し方」を OSC 777 にしてデスクトップ通知が出る
   （端末側で受ける設定が要る版がある）。`prefix+o` で対象の pane へ移る。
8. **複数ホスト（AC14）**: 登録したマシン（`docs/machines.md`）がサイドバーにマシンの見出しで並び、クリックで切り替えて操作できる。
9. **認証（AC18）**: 状態ディレクトリの `local-auth.json` を別の利用者から読めない（Linux・WSL2 は `ls -l` で `-rw-------`）。
   `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:<ポート>/api/local-login -H 'content-type: application/json' -d '{"secret":"x"}'` が 401 か 403。
   cookie なしの `/ws` は繋がらない（ブラウザのログアウト後に端末版を開き直すと、端末版は秘密を読み直して繋がる）。
10. **入れ子と tmux**: pane の中で `soda` を打つと終了コード 1 で断る（`--allow-nested` で開く）。tmux の中で開き、`Ctrl+B Ctrl+B` で端末版の prefix が効く。
11. **SSH 越し（AC4）**: SSH で入った先で 1.〜7. を行う。コピーは OSC 52 で手元の端末のクリップボードへ届く。通知と 24 ビット色は設定・`SODA_TRUECOLOR=1` で指定する。

12. **背景の透過（20261008-tui-transparent-bg）**: 端末のエミュレータで背景の透過を設定し（暗い透過なら暗いテーマ）、`soda` を開く。設定「端末版 → 背景を透過する（この端末だけ）」を入にする。
    サイドバー・tab バー・pane の空いた所から背景が透けて見え、選択した行・今の tab・メニュー・設定の画面は塗られたまま読める。切に戻すとテーマの背景に戻り、`vim` など背景を塗るプログラムの背景は入のままでも塗られる。

### うまくいかないとき

- 起動しない・案内が出て終わる: `docs/tui.md`「起動できないとき」。
- 色が 256 色になる: `SODA_TRUECOLOR=1 soda …` か設定「色の出し方（この端末だけ）」。
- マウスが効かない: 設定「端末版 → マウスを使う」が入か。外側の端末がマウスの報告に対応しているか。
- キーが効かない: 外側の端末が先に取っている（`docs/tui.md`「外側の端末との衝突」「区別できないキー」）。

## 連携のグラフ（20260927-agent-graph）

グラフ画面と連携の実行（`docs/agent-graph.md`）を、実物のエージェント・実物のブラウザ・別のマシンで確かめる手順。自動の試験（`pnpm test`）は
エージェントの状態をサーバの中から偽って出し、送られる側を `cat` にして確かめている（`packages/server/src/composeServer.graph.integration.test.ts`・
`packages/server/src/graph/remote.integration.test.ts`・`packages/cli/src/graph.integration.test.ts`）。ここでは、その外側を手で見る。
新しい状態ディレクトリか名前付き session（上の「端末版」と同じ）で始め、利用者の本物のグラフを汚さない。

### 性能（自動・AC17）

```sh
pnpm --filter @sodashitsu/server exec vitest run src/graph/perf.integration.test.ts   # 実物のサーバで 16 pane・32 本
pnpm --filter @sodashitsu/web exec vitest run src/components/graph/GraphView.perf.test.ts  # 画面の描画（happy-dom の目安）
```

出力の `[graph-perf]` の行が測った値（`toStartMs` は状態の変化から先の画面に文面が現れるまで、`toSentMs` は Enter まで送り終えるまで〔`agent.prompt` は 300ms 後に Enter〕、
`blocked` は承認待ちになってから承認待ちのトリガ・承認の代理の先に届き始めるまで〔1 秒の継続を含む〕、`burst` は 16 の元が同時に完了したとき、
`web-render` は画面を開いて描く・全ノードが動いた変更を描き直す時間）。サーバの `toStartMs`・`burst`、`blocked` の 1 秒の継続を除いた時間が 2 秒を超えれば試験が落ちる（`toSentMs` は記録だけ）。
画面の描画は happy-dom の目安で、10 秒を超えたときだけ落ちる。共有のマシンでは 1 回だけ走らせる。

### 実物のエージェントで（Linux・WSL2・Windows ネイティブ）

1. pane を 3 つ用意し、`sodactl agent start impl --kind claude --pane <p1>`・`reviewer`（`<p2>`）・`lead`（`<p3>`）でエージェントを起動する（Windows ネイティブのサーバでは
   `agent start` が使えないので、pane の中で手で起動して `sodactl agent rename` で名前を付ける）。
2. ブラウザで `prefix+a`（手元の pane は自動でノードになっている）。impl → reviewer にトリガ（完了した・受け渡し 40 行）を結ぶ。
   impl に短い作業（「README の 1 行目を読んで要約して」）を頼み、終わると reviewer に文面が 1 回だけ届き、線が光り、チップが `1/10`、履歴に「送った」が出る。
3. reviewer に長い作業を頼んでいる間に impl をもう一度完了させ、reviewer の手が空いてから 1 通だけ届く（履歴は「待っている」→「送った」）。「見送る」に変えると `busy` で見送る。
4. impl → lead に監督の線を結ぶ。lead の手が空いていれば、配下（impl の pane・種類・手元）と sodactl の使い方の短い文面が届く。lead に「impl に 〜 を頼んで結果を教えて」と頼み、
   lead が `sodactl agent prompt/wait/read` で impl を動かせる。
5. impl → lead に承認の代理（知らせるだけ）を結び、impl に承認の要る操作（ファイルの書き込み等）をさせる。承認待ちが 1 秒続くと lead に画面の末尾と
   「返答は利用者が行います」が届き、ブラウザの通常の通知も出る。impl は人が答えるまで承認待ちのまま。
6. 同じ線を「返答まで任せる」に変える（⚠ の注意が出る）。次の承認待ちで lead に `sodactl agent send-keys` の案内が届き、lead の返答で impl の承認待ちが解ける。
   **取り消せない操作を承認させないこと**（確かめるのは無害な操作で）。
7. impl ⇄ reviewer に往復のトリガを結び上限を 3 にする。3 回で `⏸ 上限` になり、画面の下に知らせが出る。線の再開で回数が 0 に戻る。
   「全体を一時停止」の間は完了させても動かない（履歴に「一時停止中」）。
8. `soda serve` を再起動（`soda session stop <名前>`〔既定の session は `default`〕か起動した窓で Ctrl+C → 同じ引数で起動）し、配置・線・一時停止の状態が戻り、履歴は空になる。`session.json` を消して起動すると、pane の id が前とは別の UUID になり、前の pane の手元のノード（と線）は起動の後に外れる
   （別の pane に線が付くことはない）。

### 実物のブラウザで（Chrome・Edge・モバイル）

- 2 つのブラウザで同じグラフを開き、一方のノードの移動・線の作成と削除・一時停止が他方へすぐ届く。`sodactl graph link add` の変更も届く。
- キーだけで一巡する: `prefix+a` → `Tab` でノード → 矢印で動かす → `c`・`Tab`・`Enter` で線 → 設定を `Ctrl+Enter` で保存 → チップの `p`・`Delete` →
  `Esc` を繰り返して閉じ、開く前の pane にフォーカスが戻る。開いている間のキーが pane に届かないこと。
- ホイールでパン・`Ctrl`＋ホイールとピンチでズーム、ページ全体がスクロールしない。OS の「視差効果を減らす」で線の光りが動かない（太さと色だけ）。
- モバイル（iOS Safari・Android Chrome）: 上部バーの「連携」で開き、1 本指のパン・2 本指のピンチ、線のチップを押して下からのシートで一時停止・再開。編集の操作が出ない。

### 別のマシンで

`docs/machines.md` の手順で 2 台を登録し、手元の pane と別のマシンの pane を線で結んで上の 2〜6 を行う。そのマシンの `soda serve` を止めて、止めている間の完了が
`machine_unavailable` で見送られ、繋がり直しても後から送られないこと、監督役への知らせが繋がったときに届くことを見る。

## グループ・worktree グループ・「グループなし」（20261004-group-worktree-items）

サイドバーの workspace のまとまり（利用者が作る「グループ」・git の「worktree グループ」・グループに入っていない項目の「グループなし」）を確かめる。
決まりの本文は `docs/herdr-parity.md` の H04・H37b（herdr との違い）、`docs/tui.md`「サイドバーのグループ」（端末版の見た目と操作）、`docs/tui-parity.md` の H04w・H37b・W04。
**自動のテストが見ている範囲と、実機・実物の端末でしか確かめられない範囲を分けて書く。**

### 自動で確かめた範囲

```sh
pnpm -s build
pnpm --filter @sodashitsu/e2e exec playwright test src/specs/workspace-groups.spec.ts   # E2E（ブラウザ版。26 件・数分）
pnpm --filter @sodashitsu/client-core exec vitest run src/workspace                      # 純関数（木・レイアウトの操作）
pnpm --filter @sodashitsu/server exec vitest run src/git/GitInfoPoller.test.ts src/session src/persist/SessionFile.test.ts src/ws/WsGateway.integration.test.ts
pnpm --filter @sodashitsu/web exec vitest run src/components/Sidebar.test.ts src/components/ContextMenu.test.ts src/actions/ActionDispatcher.test.ts
pnpm --filter @sodashitsu/tui exec vitest run src/render/chrome/sidebar.test.ts src/input/mouse.sidebarDrag.test.ts src/actions/TuiDispatcher.test.ts
```

**E2E**（`packages/e2e/src/specs/workspace-groups.spec.ts`。実物のサーバと実物の git〔worktree は spec が `git worktree add` で作る〕・実物の Chromium。合否はブラウザの DOM と、ブラウザが送った／受けたフレームで見る）:

| 場面（`test.describe`） | 確かめていること（AC） |
|---|---|
| グループの作成と出入り | メニューで作る・入れる・外す・別のグループへ移す（AC2・AC4）。見出しは本物のグループができたときだけ出る。削除すると中身は「グループなし」の末尾へ出て、グループが無くなると見出しが消える（AC10・AC20）。見出し・行を右クリックしてもメニューが開くだけで折りたたみは変わらない（AC-I1） |
| worktree グループ | グループの中でまとまって並び、子の行のメニューでも全体が動く（AC1〜AC4）。種類の印と読み上げ用の文言・畳んだサイドバーでは印が名前を持つ（AC12）。グループと worktree グループの折りたたみ・今いる workspace の行は畳んでも残る（AC6）。本体を閉じるとき、グループの中でも「worktree も一緒に閉じる」が出て全部閉じる／子の行には出ない（AC7） |
| 後から開く・開き直す・再起動 | 後から worktree を開くと同じ worktree グループ・同じグループに入る（AC8）。全部閉じて開き直す・サーバを再起動しても同じ並び・同じグループ・同じ折りたたみ（AC10） |
| ドラッグ | グループの中で並べ替え、外と中をまたぐと落とせない（AC5）。子の行をつかんでも worktree グループ全体が動く・まとまりどうしの並べ替え（AC5・AC20）。Esc・行の外で取り消し、何も送らない（AC-I2）。グループの見出しをつかんでグループを並べ替える（AC5）。下へは落とした項目の次の前・最後の項目の上は末尾へ（端末版と同じ。T30） |
| 同じフォルダの 2 つ目の workspace | worktree グループには入らず通常の行（worktree の印なし）。代表を閉じると次が worktree グループに入る。2 つ目をグループへ入れても worktree グループは動かない。「グループなし」をグループより上に並べ替えてから worktree の workspace を選んで「＋ 新規」しても、新しい workspace は通常の行のまま worktree グループは崩れない（代表は先にそのフォルダを持った workspace で、奪われない）（AC19） |
| 「グループなし」 | 畳める・グループと並べ替えられる・名前の変更と削除は無い・外すと末尾へ（AC20） |
| 状態のまとめと `+n` | グループの見出しは中の状態をまとめて常に出す。畳んだ worktree グループの先頭の行は全体をまとめ、`+n` を添える（AC21） |
| 別の接続からの操作 | 別の接続（テストのクライアント）の操作に、ブラウザの DOM が読み込み直しなしで追従する（AC15 のブラウザ側） |
| キーだけの操作 | navigate の選択・メニュー・折りたたみ（`z`）・並べ替え（`move_workspace_previous`／`next`。端で止まる）・メニューとダイアログをキーだけで操作・Esc で取り消し（AC-I2・AC-I3・AC5・AC6） |
| 先頭の pane の移動 | pane に `cd` を打って別のリポジトリへ移ると、移った先の項目に従う（所属が無ければグループの外へ）。git 管理外へ移ると、移る前のグループに通常の行として残り、その後リポジトリへ移ってもグループに残って所属が引き継がれる（AC11） |

**単体・結合**（vitest）:

- 純関数（`packages/client-core/src/workspace/workspaceGrouping.test.ts`・`sidebarLayout.test.ts`）: 項目・代表・木・「グループなし」・畳んだ worktree グループの隠れている数・キー操作の順・`layoutFromLegacy`・レイアウトの操作。
- サーバ（`packages/server/src/session/SessionModel.test.ts`・`SessionService.test.ts`・`surface/methods/index.test.ts`・`persist/SessionFile.test.ts`）: 判定の反映の表（判定が付く・変わる・管理外・取れない）・代表の交代・グループと一括クローズの RPC・`item.move`／`item.move_by`・古い `workspace.move_to` の読み替え・保存と復元・移行の確定。
  実物の git の結合テスト（`packages/server/src/git/GitInfoPoller.test.ts`）: 管理外・消えたフォルダ・linked worktree・symlink・bare・サブモジュール・コミットの無いリポジトリの判定、worktree を作って同じ項目に入る・別のリポジトリ／管理外へ移る・同じフォルダの 2 つ目が通常の行・代表を閉じると次が入る、保存 → 復元 → 最初の 1 周で並びが変わらない。
- サーバと画面が同じ木になること（`packages/server/src/session/SessionModel.clientAgreement.test.ts`。仮の状態・配信の途中の状態を含む）と、**2 つの接続**（`packages/server/src/ws/WsGateway.integration.test.ts`。実物の ws。一方の操作がもう一方と新しい接続に同じ木で届く）。
- ブラウザ版（`packages/web/src/components/Sidebar.test.ts`・`ContextMenu.test.ts`・`ConfirmDialog.test.ts`・`GroupPickerDialog.test.ts`・`actions/ActionDispatcher.test.ts`）と、**端末版**（`packages/tui/src/render/chrome/sidebar.test.ts`・`input/mouse.sidebarDrag.test.ts`・`actions/TuiDispatcher.test.ts`・`model/SessionModel.test.ts`・`modes/overlays.test.ts`）:
  描画の行・メニュー・クリックの当たり判定・ドラッグの落とし先・navigate・古いサーバ〔`layout` が無い〕での RPC の分け方。端末版は偽の外側の端末の文字で確かめる。

**自動では確かめていない範囲**（下の手作業で見る）:

- **端末版（引数なしの `soda`）の実物の端末での見え方と操作**。E2E はブラウザ版だけで、`scripts/tui-pty-verify.mjs`（疑似端末での一巡）もグループを見ない。端末のフォントでの `⎇`・`├└`・`─` の見え方、端末のマウス（クリック・ドラッグ）は実機でだけ確かめられる。
- 端末版とブラウザ版を**同じサーバで並べて**見たときの一致（サーバと画面の一致・2 つの接続は自動で見たが、実物の端末版の画面とブラウザの画面を並べてはいない）。
- 実物のエージェント（Claude Code 等）の状態が、グループの見出し・畳んだ worktree グループに反映されること（E2E は状態をサーバの中から偽って出している）。
- 実際の利用者のリポジトリ・シェルでの `cd`（E2E は pane に `cd` を打つが、5 秒周期の判定を使う短い構成で、利用者の `PROMPT_COMMAND` 等は通らない）。
- 読み込み済みの古いブラウザのタブ（古い画面）と新しいサーバの組み合わせ。単体で `workspace.move_to` の読み替え・知らないイベントの無視を見たが、実物の古い版の画面では確かめていない。
- Windows ネイティブ・macOS（git の判定とパスの扱い。symlink・bare 等は Linux の git 2.43.0 で確かめた）。

### 実機の手順

新しい状態ディレクトリか名前付き session（上の「端末版」と同じ。利用者の本物の並びを汚さない）で始める。リポジトリは使い捨てのものを作る（コミットが 1 つも無いと管理外として扱われる）:

```sh
r=$(mktemp -d); cd "$r"
git init -q app && git -C app commit -q --allow-empty -m init
git -C app worktree add -q ../app-feat -b feat
git -C app worktree add -q ../app-fix -b fix
git -C app worktree add -q ../app-hot -b hot      # 手順の cd 用（まだ workspace を開かない）
git init -q other && git -C other commit -q --allow-empty -m init
git init -q third && git -C third commit -q --allow-empty -m init   # 手順の cd 用（所属の無いリポジトリ）
mkdir memo
```

「＋ 新規」や `workspace.create` で、`app`・`app-feat`・`app-fix`・`other`・`memo` をそれぞれの場所で開く（pane で `cd` してもよいが、判定は最初の pane の今の場所に追従し、5 秒周期なので数秒待つ）。

- [ ] **まとまり方（AC1・AC4・AC19〜AC21）**: `app`・`app-feat`・`app-fix` は 1 つの worktree グループ（`app` が先頭）になる。`app-feat` の workspace を選んだまま「＋新規」で 2 つ目を開くと、worktree グループには入らず通常の行（`⎇` なし）になる。
      `app-feat` の最初の workspace（代表）を閉じると、2 つ目が worktree グループに入る。グループが 1 つも無い間は「グループなし」の見出しが出ない。
- [ ] **グループ（AC2・AC3・AC10）**: `app` の行の右クリック（キーなら navigate〔`prefix+w`〕で選んで Space）→「新しいグループを作る…」で名前を付ける。worktree グループ全体が入り、見出しが出て「グループなし」の見出しも出る。
      `other`・`memo` を「グループへ追加…」で入れる。`app-feat`〔子の行〕から「グループから外す」を選ぶと worktree グループ全体が「グループなし」の末尾へ出る（子だけは動かない）。グループを削除すると中身は「グループなし」の末尾へ出る。
- [ ] **再起動で戻る（AC10）**: グループに入れた状態で `soda session stop <名前>` → 同じ引数で起動。同じ並び・同じグループ・同じ折りたたみで戻る。`app` の workspace を全部閉じて開き直しても、同じグループに戻る。
- [ ] **状態のまとめ（AC21）**: `app-feat` の pane で Claude Code 等を動かし、動作中の間、グループの見出しと「グループなし」の見出しに作業中の状態の記号が出る（広げていても畳んでいても）。worktree グループを畳むと、先頭の行が全体をまとめた状態になり、隠れている worktree の数が `+2` のように出る。
- [ ] **`cd` で別のリポジトリへ移る（AC11）**: 最初の pane の今の場所に追従する（判定は 5 秒周期なので、`cd` の後は数秒待つ）。`app` の worktree グループ・`other`・`memo` がグループ G に入っている状態で行う（前の項目でグループを削除したなら作り直す）。
      (1) G に入れた `memo` の workspace の pane で `cd "$r/app-hot"`（`app` の、まだ workspace を開いていない worktree）。`memo` の workspace が `app` の worktree グループの子に加わる（G の中・`app` の項目の中）。
      (2) その workspace の pane で `cd "$r/third"`（所属の無い別のリポジトリ）。worktree グループから外れ、グループの外（「グループなし」）へ出る。
      (3) G に入れた `other` の workspace の pane で `cd "$r/memo"`（git 管理外）。移る前の G に通常の行として残る（名前・並びは変わらない）。
      (4) **消えたフォルダ**: workspace の pane のあるフォルダを消す（`rmdir`）。想定は、直前の並び・所属のまま変わらないこと（削除済みの cwd への追従の挙動は推測で、実機では未確認。結果を記録する）。
- [ ] **端末版とブラウザ版を同じサーバで並べる（AC15・AC16）**: 同じ状態ディレクトリで、ブラウザ（`http://127.0.0.1:<ポート>`。`docs/tui.md`「起動と終了」の token）と端末版（`soda --state-dir <同じ場所>`）を並べて開く。
      (1) ブラウザでグループを作る・入れる・外す・並べ替える・畳むと、端末版がそのつど読み込み直しなしで同じ並びになる。逆に端末版で行って、ブラウザが追従する。
      (2) 端末版で、見出しのクリックと worktree グループの先頭の行の左端 `▸`/`▾` のクリックで畳み・広げ。navigate〔`prefix+w`〕で見出し・行を上下で選び、`z` で畳み、Space でメニュー。
      (3) 端末版のマウスで、worktree グループの子の行・先頭の行をつかんで同じグループの中の項目の間へ落とすと worktree グループ全体が動く。グループの見出しをつかんで別のグループの上へ落とすとグループが並べ替わる。
      グループの外へ落とす・別のまとまりの項目の上に落とすと何も起きず、理由が知らせで出る。Esc か行の外で離すと取り消し。名前順（サイドバーの並び順のボタン）では一番上の並べ替えが「名前順では並べ替えできません」になる。
      (4) 見出しの数・`◐`・`+n`・ブランチ名がブラウザ版と同じ。
- [ ] **端末のフォントでの見え方（実機でしか確かめられない）**: Windows Terminal・VS Code の統合端末・tmux の中・SSH 越し等、使う端末で `⎇`（U+2387）・`├`／`└`・`─`・`▸`／`▾` が崩れず、幅 1 桁で縦がそろう。
- [ ] **Windows ネイティブでの `repoKey` の形（実機でしか確かめられない）**: git for Windows が `C:/x/.git` の形で出す値を、サーバは `path.resolve` を通して `C:\x\.git` にそろえて `repoKey`・`worktreeKey` にする（以前の判定と同じ形。共有の設定 `collapsedAutoGroups` の `repoKey` を孤児にしないため）。本体と linked worktree が同じ worktree グループに束ねられ、畳んだ状態が再起動後も残ることを確かめる（20261004-group-worktree-items D44 補足）。
      崩れるときは `packages/tui/src/render/chrome/sidebar.ts` の `WORKTREE_GLYPH` を別の記号に替え、どの端末・フォントで崩れたかを記録する（幅の規則〔unicode11〕では 1 桁として単体テストで固定している。フォントは実機次第）。
- [ ] **古い保存からの移行（AC13。任意）**: この work より前の版（`main`）で、同じリポジトリの本体と worktree を別々のグループに入れた状態を作って停止し、この版で同じ状態ディレクトリを起動する。
      起動直後から、本体の所属に合わせた worktree グループが 1 つのまとまりとして並び、何度起動し直しても同じになる。

#### `repoKey` の既知の制約

所属を覚えるキー（`repoKey`）は、`git rev-parse --path-format=absolute --git-common-dir` の値で、worktree グループの束ねと同じ値を使う（decisions D9・D10。実物の git 2.43.0 で確かめた）。

- **古い git（2.31 未満）では main と同じ決め方に落ちる**（`--path-format` は 2.31 で導入された）。古い git は知らないオプションを**エラーにせず、そのまま出力して終了コード 0 を返す**（`--path-format=absolute\n.git`。実物の git 2.43.0 で `git rev-parse --bogus-option --git-common-dir` が同じ動きになることを確かめた）。サーバは 1 行目がそのまま `--path-format=absolute` のとき、残りの行（相対のこともある）を cwd から解決して使う。**symlink 経由の cwd では、本体と worktree が別の項目になりうる**（相対の `.git` が論理パスの `…/link/.git` になり、worktree の実体のパスとずれる。decisions D9・D48）。それ以外の壊れた出力（別の `--` のオプション・行数の違い・空）は判定が「取れない」になる（直前の判定を保つ。新しい workspace は判定が付かないままで、worktree グループにもグループの自動の所属にもならない）。
- symlink を通った場所からでも、git 2.31 以上では、本体・worktree のどちらも実体のパスで一致する（`--path-format=absolute` が実体を返す）。同じリポジトリが別のパス（別の clone・bind mount・パスの付け替え）で見える場合や、リポジトリのフォルダを移動・改名した場合は、絶対パスのキーからの推論では別のリポジトリとして扱われる（実機では未確認）。
- **bare リポジトリ**: bare とその worktree は同じ `repoKey` で束ねられるが、bare 自身を workspace として開いていなければ本体の行は無く、worktree だけの worktree グループ（2 つ以上のとき）になる（先頭は最初に開いたもの）。
- **サブモジュール**: 親とは別のリポジトリとして扱う（`<親>/.git/modules/<名前>`。親の worktree グループには入らない）。
- **コミットが 1 つも無いリポジトリ**は、今までどおり git 管理外として扱う（`rev-parse --abbrev-ref HEAD` が失敗するため）。最初のコミットの後の判定（5 秒周期）で git に変わる。
- **消えたフォルダ・確認の時間切れ**は「取れない」で、直前の判定・並び・所属を保つ。起動直後は、保存した判定で停止前と同じに束ねて並び、最初の確認の結果に合わせる。

## 性能の計測（AC17）

requirements.md の非機能要件（目安）：**応答性**——同一 LAN での接続で、キー入力から画面へ反映されるまでの追加の遅延が
p95 50ms 以内。大量出力（ビルドログ等）が流れる pane があっても、他の pane とブラウザの操作が固まらない。**規模**——1 セッション
で pane 16 個を同時に表示・操作できる。**状態反映**——エージェントの状態の変化が一覧に 2 秒以内。

測るのは `packages/e2e/src/specs/performance.spec.ts`（状態反映は `agent-detection.spec.ts`）。`performance.spec.ts` は遅延と
規模の値で合否を決めない（値は環境でぶれるので、出すだけ）——**遅延と規模の合否は、GPU があり負荷の少ない実機で以下のとおり
測り、利用者が判断する**（とくに大量出力中の 16 pane）。状態反映だけは `agent-detection.spec.ts` が 2 秒未満を assert して、
自動で合否を決める（下の「状態反映」の項目）。このサンドボックス（GPU の無いソフトウェアの GL・ほかの負荷あり）の値は参考にとどまる。

計測のコマンド（Linux か WSL2 の、リポジトリの直下で）：

```sh
pnpm --filter @sodashitsu/e2e exec playwright test performance agent-detection --headed
```

- `performance`・`agent-detection` は spec の絞り込み（Playwright の引数はファイルのパスに対する正規表現で、一致した spec だけが
  走る）。5 件で 2 分ほど。
- `--headed` はブラウザの窓を出して走らせる（ヘッドレスの Chromium は GPU を使わず、ソフトウェアの GL で描くことがあるため）。
  走っている間は窓に触らない。窓を出すには画面が要る（WSL2 は WSLg、Linux は X か Wayland のデスクトップ）。画面の無い所
  （SSH だけのサーバ等）では起動に失敗するので `--headed` を外す——そのときの値はソフトウェアの GL（SwiftShader）で描いたもので、
  実際のブラウザより悪く出る。
- Windows ネイティブでは走らせない（spec は pane のシェルに `yes` 等の Unix のコマンドを打つので、PowerShell では大量出力が
  流れないまま測ってしまう）。
- ブラウザが GPU で描けているかは、次で分かる（これも窓を出すので画面が要る。出た名前に `SwiftShader` が入っていれば
  ソフトウェアの GL。GPU の名前（NVIDIA・AMD・Intel 等）なら GPU）：

  ```sh
  pnpm --filter @sodashitsu/e2e exec node -e "import('@playwright/test').then(async ({ chromium }) => { const b = await chromium.launch({ headless: false }); const p = await b.newPage(); console.log(await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })); await b.close(); })"
  ```

  WSL2 の Chromium はこれが `SwiftShader` になることがある（このサンドボックスも WSL2 で `SwiftShader`）。その場合、計測の値は
  実際のブラウザより悪く出るので、下の「手で確かめる（16 pane・大量出力）」の項目を Windows の Chrome・Edge（GPU で描く）で
  行い、判断の中心にする。

出る 4 行（値はこのサンドボックスで 2026-09-20 に測った例）：

```
[AC17 遅延] 200 回・p50=2.9ms p95=11.0ms max=71.6ms
[AC17 規模] pane16個・うち1個大量出力中・別 pane の遅延 50 回・p95=214.8ms
[AC17 遅延・描画まで] 1 pane・200 回・p50=15ms p95=26ms max=48ms
[AC17 規模・描画まで] 16 pane 同時表示・うち 1 つで yes・別 pane の 50 回・p50=142ms p95=673ms max=821ms・描画フレームの最大間隔=222ms
```

| 行 | 測っているもの | 判定での使い方 |
|---|---|---|
| `[AC17 遅延]` | 生の WebSocket のクライアント（ブラウザを通さない）から 1 文字送り、そのエコーが返るまで（200 回）。サーバ（PTY・ミラー・配信）の分だけ | 参考（「描画まで」の内訳） |
| `[AC17 遅延・描画まで]` | 1 文字送ってから、ブラウザがその出力を受けて次の描画フレームが来るまで（1 pane・200 回） | **応答性**の判定 |
| `[AC17 規模]` | 16 個の pane（別々の tab）の 1 つで `yes` を流したまま、別の pane の往復（50 回）。サーバの分だけ（`yes` の pane は購読しない） | 参考 |
| `[AC17 規模・描画まで]` | 1 つの tab に 4×4 で 16 pane を表示し、1 つで `yes` を流したまま、別の pane の描画まで（50 回）。`描画フレームの最大間隔` は、その間にブラウザの描画が止まった最も長い時間 | **規模・大量出力**の判定 |

どの値も、サーバとブラウザが同じマシンで測ったもの（LAN の往復は含まない。下の最後の項目で足す）。

- [ ] 準備：「前提」の `pnpm install`・`pnpm -s build` と Chromium の導入を済ませる。重い処理（ビルド・動画・ほかの E2E 等）を
      止め、ノート PC は電源につなぐ。
- [ ] 上のコマンドで測る。期待：`5 passed` と上の形の 4 行が出る。4 行を控える。
- [ ] 応答性：`[AC17 遅延・描画まで]` の p95 が 50ms 以内なら合格。
- [ ] 状態反映：`agent-detection.spec.ts` の 1 件が passed なら合格。その中で確かめているのは、判定のルールに当たる画面が
      端末に出てから、**サーバが状態の変化（`pane.agent_status_changed`）を知らせるまで**が 2 秒未満であること（テスト自身の
      WebSocket のクライアントで受ける。design の AC17 の「状態の反映」の測り方）。**サイドバーに描かれるまでの時間は含まない**
      （サイドバーは、その後 3 秒以内に blocked の色になることだけを確かめている）。サイドバーまでは、「Linux（CI・手元）」の
      claude・codex 以外のエージェントの項目や AC6・AC7 の一巡で、状態が変わってから印（色と記号）が変わるまでに遅れを感じないことを
      目で見る。
- [ ] 規模・大量出力：`[AC17 規模・描画まで]` の p95 が 50ms 以内なら合格。`yes` は最大の速さで出し続けるので、ビルドのログ
      よりずっと重く、このサンドボックスでは p95 が 370〜780ms ほど、描画フレームの最大間隔が 90〜260ms ほどで、50ms を超えて
      いる。超えたら、下の「手で確かめる（16 pane・大量出力）」の項目で同じ状態を操作し、要件の「他の pane とブラウザの
      操作が固まらない」を満たすかで判断する（この場面の p95 50ms は目安）。描画フレームの最大間隔が数百 ms を超えると、その間は
      画面全体が止まって見える。判断と 4 行の値を控える。
- [ ] 手で確かめる（16 pane・大量出力）：ブラウザで 1 つの tab を 4×4 の 16 pane に分ける（`performance.spec.ts` と同じ分け方。
      分割すると焦点は新しい pane へ移るので、同じキーをくり返すだけでは端の pane ばかりが細くなる）。キーは prefix（`Ctrl+B`）の
      後の 1 キー：
      (1) 4 列にする：`v`・`h`・`v`・`l`・`v`（どの列も同じ幅になる）。(2) `h` を 3 回で左端の列へ。(3) その列を 4 段にする：
      `-`・`k`・`-`・`j`・`-`。(4) `l` で右の列へ移り、(3) をくり返す（計 4 列）。期待：同じ大きさの pane が 4×4 に並ぶ。
      1 つの pane で `yes` を実行し、流したまま、別の pane に文字を打つ・`Ctrl+B h`/`j`/`k`/`l` で
      pane を移る・ホイールで scrollback を遡る・サイドバーの行をクリックする。期待：打った文字がすぐ出て、操作が引っかから
      ない（どこまでなら許せるかが判断）。`Ctrl+C` で `yes` を止める。
- [ ] LAN の別のマシンから：design.md の AC17 は「LAN の計測は別のマシンのブラウザから行う」としているが、spec はサーバと
      ブラウザを同じマシンで動かすので、そのままでは測れない。**ここでは、同じマシンで測った値に LAN の往復の時間を足す近似で
      代える**（この近似でよいとするかは利用者の判断）。別のマシンで `ping -c 20 192.168.1.50`（Windows は
      `ping -n 20 192.168.1.50`）を実行し、往復の**最大**（Linux は `rtt min/avg/max/mdev` の max、Windows は「最大」）を見る
      （平均より控えめな見積もりにするため）。期待：`[AC17 遅延・描画まで]` の p95 に足しても 50ms 以内（同じ LAN なら往復は
      数 ms）。WSL2 と Windows ネイティブでは `192.168.1.50` は母艦の Windows で、Windows のファイアウォールは既定で ICMPv4 の
      エコー要求（ping）を止める——返事が無ければ、母艦の管理者の PowerShell で
      `Enable-NetFirewallRule -Name FPS-ICMP4-ERQ-In`（「ファイルとプリンターの共有 (エコー要求 - ICMPv4 受信)」の規則。終わったら
      `Disable-NetFirewallRule -Name FPS-ICMP4-ERQ-In`）で許可する（この検証環境では未確認）。あわせて「別のマシンからの TLS 接続
      （AC11）」の構成で、別のマシンのブラウザから vim 等で打ち、遅れを感じないこと。

## 既知の制約

確かめる途中で出会っても、不具合ではなく今の版の限界として扱うもの（直すなら後続の work）。herdr との機能の差と、確かめずに
見送った項目は `docs/herdr-parity.md`「未検証のまま見送った項目」。

- **更新時の引き継ぎ（`soda handoff`）**：Windows は非対応、macOS は未検証。引き継いだ pane のシェルは終わるとサーバが終わるまで
  `<defunct>` で残る。確かめの後に新しい版が起動の途中で落ちると pane のプロセスは終わる（`docs/tls-setup.md`「更新時の引き継ぎ」）。
- **接続が黙って切れている間（TCP の半開き）に打った文字は、黙って消える**（decisions.md D95）。スマートフォンのスリープ・
  Wi-Fi とモバイル回線の切り替え・ノート PC のスリープ等で、接続が実際には切れているのにブラウザがまだ気づいていない間は、
  「再接続中…」が出ず、打った文字はどこにも届かない（サーバからのエコーが無いので画面にも出ない）。soda は生存確認
  （WebSocket の ping 等のハートビート）を送らないので、気づくのはブラウザ・OS が切断を検知したとき（数十秒以上かかることが
  ある）。検知した後は「再接続中…」と「つながるまで入力できません」を重ねて出し、その間の入力を止める（溜めて後から送ることも
  しない。切断の瞬間をまたいで打てば、先頭が欠けることはある）。**スリープから戻った直後に打った文字が出なければ、ページを
  開き直す**。
- **新しい pane を作る操作の直後、IME で変換中だった文字は新しい pane へ流れない**（D99）。分割（`Ctrl+B v`・`Ctrl+B -`）・
  新しい tab（`c`）・新しい workspace（`N`）は、サーバが新しい pane を作って応答するまで（シェルの起動の確認の 300ms を含む）の
  間に打った文字を溜めて、新しい pane へ流す。ただし IME で変換中の（確定していない）文字は溜まらず、確定が新しい pane が
  できた後になると元の pane に入る。変換を確定してから操作するか、新しい pane が出てから打つ。
- **繋ぎ直した後・ページを開き直した後に戻らない端末のモード**（D107）：画面と scrollback はサーバのスナップショットで戻るが、
  スナップショットは次のモードを持たないので既定に戻る——カーソルの表示／非表示（`?25`）・マウス報告の SGR の形（`?1006`）・
  スクロール領域（DECSTBM）・カーソルの形（DECSCUSR）（ほかに文字集合・DECSC で保存したカーソルの位置）。そのため、カーソルを
  隠している TUI でカーソルが見える、マウス報告を SGR の形で受けるアプリ（vim 等）へ旧来の形で報告が届き、座標の大きい所
  （右端・下端の方）でずれる・誤読される、スクロール領域を使うアプリの次の描画が崩れる、ことがある。アプリが画面を描き直すか
  操作するまで続く（直らなければ、そのアプリを終えて起動し直す）。自動の再接続のたびに起こりうる。同じ理由で、OSC 8 のリンク
  （`ls --hyperlink` 等）も戻らず、ただの文字になる（design の AC8）。
- **タッチ端末（スマートフォン・タブレット）では、端末の中のリンクを開けない**（D110）。リンクは Ctrl（macOS は Cmd）を
  押しながらのクリックで開く（design M6。ただのクリックで開くと、アプリへのクリックや選択のつもりで開いてしまう）ので、修飾キーの
  無いタップでは開かない。長押し等の別の開き方は用意していない（ハードウェアキーボードの修飾キーを押しながらタップした場合は
  未確認）。開きたい URL は PC のブラウザから開く。
- **「この端末に合わせる」の食い違い**（D108）：
  - 押した状態は、スマートフォンの 1 列の画面（幅 768px 未満）が持つ。タブレットを回す・PC の窓の幅を変える等で 768px を
    またいでデスクトップの画面に替わってから戻ると、ボタンは押されていない表示に戻るが、サーバでは合わせたまま（PTY の大きさは
    この画面が決め続ける）。ページを開き直すと、どちらも「合わせない」から始まる。
  - 押している間でも、ほかの大きさを決められるクライアント（デスクトップのブラウザ・別の端末で押している人）がその tab で
    打つ・クリックする等の操作をすると、PTY はそちらの大きさになる。スマートフォンは押された表示のまま等倍で描くので、画面から
    はみ出す。スマートフォンで何か 1 文字打つと（押している間は、打つことも大きさを取る操作になる）、大きさを取り直して画面に
    収まる。

- **マウス報告を求めるアプリの上で Ctrl＋クリックすると、リンクを開くのと同時にクリックもアプリへ届く**（D110）。vim・less 等が
  マウス報告を有効にしている pane で、端末の中のリンクを Ctrl（macOS は Cmd）＋クリックすると、新しいタブが開くのと同時に、
  Ctrl を押したままの左クリックとしてアプリにも報告が届く（アプリによってはカーソルの移動・選択になる）。M7 の確認（マウス報告を
  有効にしたまま進める手順）の途中でも出会う。アプリを閉じてから開くか、URL を選んで PC のブラウザへ貼る。
- **スマートフォンでは「右クリックを pane に送る」にした pane のメニューを開けない**（D110）。メニューを常に開ける pane の枠
  （4px の縁）はデスクトップの画面にだけ出る。スマートフォンでこの設定にした pane は、マウスを使うアプリが動いている間、
  その pane のメニューを開けない（PC のブラウザから同じ pane のメニューを開いて「右クリックを herdr に戻す」を選ぶか、アプリを
  終える）。

- **macOS と Windows ネイティブでは、新しく開く場所の「引き継ぐ」と、workspace の名前・git の情報が `cd` に追従しない（シェルが OSC 7 で知らせない限り）**
  （20260921-new-terminal-cwd の design D2・D4）。前面のプロセスの cwd を読めるのは Linux（WSL2 を含む）だけで、ほかの OS では
  シェルが OSC 7 で知らせた場所を使い、知らせなければ**元の pane を開いた場所**で開く（以前より元の pane に近い）。Windows の既定の
  `powershell.exe` は OSC 7 を出さない。macOS の zsh が出すかは `soda serve` の起動のしかたによる（pane は `soda serve` の環境変数を
  引き継ぐので、ターミナル.app から起動すると `TERM_PROGRAM` が渡り、`/etc/zshrc_Apple_Terminal` が出す。未検証）。`cd` した先で
  開きたければ、プロンプトで OSC 7 を出すようにするか、設定の「新しく開く場所」を「指定した場所」にする。確かめ方は「Windows ネイティブ
  （WSL2 の母艦の Windows で直接）」の cwd の項目。workspace の名前と git の情報（20260926-workspace-label-follow-cwd）も同じ「いまの場所」を使うので、
  知らせなければ左上の pane を開いた場所のまま。
- **git の根を探すのが遅い・止まったファイルシステム（止まった NFS 等）があると、ほかの場所でも自動の名前がフォルダ名になることがある**
  （20260921-workspace-auto-label の decisions D4）。名前を決めるために git の根を探す stat が 200ms で返らなければ、その場所はそれ以上問い合わせず
  フォルダ名にし、ログに `workspace label lookup timed out` が出る。**その stat が返るまでの間は、どの場所でも**（ローカルの正常なリポジトリでも）、
  新しく作る workspace・`Ctrl+B W` で名前を空にして確定したとき・起動時の復元の自動の名前が、根を探さずフォルダ名になる（止まった stat は取り消せず、
  重ねるとサーバ全体のファイルの読み書きが止まるため）。遅いだけなら、その stat が返った時点で元に戻る（以後は根を探す。すでに付いたフォルダ名は
  そのまま）。止まったままなら戻らない。起動時の復元は、名前を決めるのに合計 1 秒を過ぎたら残りをフォルダ名にする（止まっていなくても、遅いだけで
  起きる。例：WSL2 の `/mnt/c`）。このときログに `workspace label lookup over restore budget` が出る。こうして付いたフォルダ名も自動の名前のままなので、
  **その fs が応答するようになってから** `Ctrl+B W` で名前を空にして確定すれば決め直す（起動し直さなくてよい）。止まったマウントの上に workspace が
  あるまま起動し直すと、復元でまた止まり、それより後の workspace と以後の作成はフォルダ名になる。
- **Linux（WSL2 を含む）では、前面でプログラムが動いている間の「引き継ぐ」は、そのプログラムの場所になる**（エージェントならそれを
  起動した場所。前面のプロセスの cwd を読むため。20260921-new-terminal-cwd の design「ドメイン固有の考慮」）。シェルの場所で開きたければ、
  プログラムを終えてから作る。
- **端末の中のアプリの色の問い合わせには、1 つの色でしか答えられない**（20260921-theme-settings の design D6）。同じ pane を明るいテーマの
  ブラウザと暗いテーマのブラウザで見ていると、その tab の大きさを決めているブラウザ（最後に入力・フォーカス・レイアウトの操作をしたデスクトップか、
  「この端末に合わせる」を入れたブラウザ）のテーマで答えるので、もう一方のブラウザではアプリの配色が背景と合わないことがある。アプリは多くが
  起動のときにだけ問い合わせるので、テーマを替えた後に起動したアプリから新しい色になる（明暗の変化をアプリへ知らせる DSR 996・mode 2031 には
  まだ応えていない。後続）。
- **テーマは画面の枠の色をコントラストのために寄せる**ので、画面の枠の文字・状態の色・選ばれている pane の枠・選択の面（表示中の tab・行）は、
  herdr の配色より明るいテーマでは濃く、暗いテーマでは明るく見えることがある（例 Solarized Dark の文字。WCAG 2.2 の 4.5:1・3:1 に足りるまで。端末の中の 16 色は上流の配色のまま）。

- **キーの割り当て：ブラウザ・OS が先に受けるキーは割り当てられない／環境で変わる**（20260921-keybinding-customization）。`Ctrl+T`・`Ctrl+N`・`Ctrl+W`・
  `Ctrl+Tab` 等はブラウザが先に受けて画面に届かないので、取り込みにも現れない（全画面のときだけ届ける Keyboard Lock API は使わない）。macOS の Option は文字を別の文字に化かすので
  （`Option+D` → `∂`）、macOS のときだけ物理キーの位置（`code`）で元の英字・数字へ戻す。**Dvorak・QWERTZ・AZERTY の macOS では、化けた Option の chord の表示が押した字と食い違う**
  （押せば効く。同 decisions D7）。Windows の AltGr は Ctrl+Alt と同じに見えるため、AltGr で**合成された文字**（`@`・`[` が別のキーにある配列）だけを拒否し、英数字と US 配列の記号は通す（記号は、同じ物理キーを同じ shift の状態で押した US 配列の文字と比べる。**記号の位置が US と違う配列**〔Dvorak 等〕では、Firefox・Windows で記号が「AltGr で入力する文字」として拒否されうる〔英数字は通る〕。逆に、**AltGr で打つ記号が US 配列と同じ物理キーにある配列**では合成と判定できない。どちらも実機は未確認）。
  修飾キー付きの句読点は環境次第（herdr の文書と同じ）。
- **キーの割り当て：pane の枠にフォーカスがある間は、prefix も直接のキーも届かない**（既存の挙動。20260921-keybinding-customization の decisions D11）。pane の枠は無修飾の
  Enter・Space・↓・ContextMenu・Shift+F10 の keydown を止める（修飾キー（Ctrl・Alt・Meta）付きは止めない）。マウスで押したあとにフォーカスが残っていると、端末をクリックするまで prefix・直接のキーが効かない
  （端末・サイドバーの行・フォーカスできない要素をクリックした後では効く）。**サイドバーの［＋新規］［メニュー］［並び順］［«/»］・グループ折りたたみ［▸/▾］・
  tab バーの［＋］は、無修飾の Enter・Space の keydown のときだけ伝播を止めるよう直したので、これらのボタンにフォーカスが残っていても prefix・直接のキーは効く**
  （20260925-focus-trapped-keybindings。20260921-keybinding-customization の decisions D11(1) が送っていた欠落）。ただし navigate モード（`prefix+w`）中にこれらの
  ボタンへフォーカスが残っている状態で Enter・Space を押すと、ボタン自身の活性化が優先され、navigate の確定・`navigate_open_menu` には届かない——この修正によって
  「ボタンにフォーカスが残ったまま navigate モードへ入る」という、以前は到達不能だった経路が新たに可能になったが、`PaneFrame.vue`/`ContextMenu.vue` が既に持つ
  「フォーカス中の要素が自分の Enter/Space を優先する」という既存の優先順位をそのまま踏襲した結果であり、新しい設計判断は加えていない（既知の制約）。
- **キーの割り当て：おすすめ一式には、環境によって届かないキーがある**（20260921-keybinding-customization の decisions D13）。`Ctrl+Alt+L` は Linux のデスクトップの一部（KDE 等）が画面のロックに使い、herdr の文書も「避けるもの」に挙げる。`Ctrl+Alt+[`・`]` は、`[`・`]` を AltGr で打つ配列（ドイツ語等）では AltGr で合成された文字として端末へ通す。
  届かないキーは、設定の［変更］で別のキーに付け替える。
- **キーの割り当て：navigate・resize モードの中のキーは修飾キーを見ない**（既存の挙動。20260921-keybinding-customization の AC12〔そのモードの中のキーは変えない〕）。prefix を `ctrl+l`・`alt+j` のように文字を含む形へ変えても、prefix は terminal・copy モードで
  だけ効き、navigate・resize モードの中では、そのキーの文字（`l`・`j`）として扱われる（pane の移動・resize になる）。モバイルの Prefix ボタンはそのモードでは何もしない（20260921-keybinding-customization の decisions D9）。
- **キーの割り当て：CapsLock を入れて Shift を押した文字キーは、shift 付きとして引く**（20260921-keybinding-customization の decisions D8。以前は shift を無視して小文字として引いていた）。CapsLock を入れたまま
  文字キーを押して大文字で届く環境（未確認）では、大文字は shift 付きとして引く既存の規則（prefix の後の `n`→`N` も同じ）が直接のキーにも及び、`Ctrl+Alt+D` も `Ctrl+Alt+Shift+D` も `ctrl+alt+shift+d`（下へ分割）になって、おすすめ一式の右へ分割（`ctrl+alt+d`）に届かなくなる（20260921-keybinding-customization の decisions D13）。キー一覧の並び・行の粒度が
  操作ごとに変わった（同 decisions D10。内容は同じ）。画面のキーボード（モバイル）では割り当てを取り込めない（物理キーボードをつないだときに使える）。
- **色の個別の上書き：上書きした値に自動のコントラスト調整はしない**（20260922-theme-custom-overrides の design「ドメイン固有の考慮」・AC2）。herdr の
  `[theme.custom]` と同じで、読みにくい・見えにくい色を入れても止められない（利用者の責任）。herdr の `.light`/`.dark` と違い、
  「常に当たる」層は無く「明るいとき」「暗いとき」の 2 層だけ（同 work の research F2）。

- **グループ・worktree グループの所属を覚えるキー（`repoKey`）の制約**（20261004-group-worktree-items の decisions D9・D10）。古い git（2.31 未満）では `--path-format=absolute` が使えず main と同じ決め方（cwd から解決）に落ちる。symlink 経由の cwd では本体と worktree が別の項目になりうる。それ以外の壊れた出力は `unknown` で判定が付かない。
  同じリポジトリが別のパス（別の clone・bind mount）で見える場合・リポジトリのフォルダを移動・改名した場合は、絶対パスのキーからの推論では別のリポジトリとして扱われる（未確認）。bare は worktree だけの worktree グループになり、サブモジュールは親と別のリポジトリ、
  コミットが無いリポジトリは最初のコミットまで git 管理外として扱う。詳しくは「グループ・worktree グループ・「グループなし」」の「`repoKey` の既知の制約」。
- **端末版のサイドバーの `⎇`（worktree の印）・`├└`・`─` は、外側の端末のフォントによっては崩れる**（幅 1 桁の字形だが、字形の確認は端末次第。`docs/tui-parity.md` H23b と同じ）。崩れるときは `WORKTREE_GLYPH`（`packages/tui/src/render/chrome/sidebar.ts`）を別の記号に替える。

ほかに、各節に書いた制約：xterm.js のモバイルの未解決課題（「実機（iOS Safari・Android Chrome。AC12）」の「既知の未解決課題」）・
リバースプロキシの無通信のタイムアウト（`docs/tls-setup.md`「リバースプロキシの後ろに置く」）。

## 未検証のまま見送った項目（`docs/herdr-parity.md` の対象外一覧とあわせて参照）

このリポジトリの自動テストと本 docs の手順のどちらでも確認しない項目は
`docs/herdr-parity.md`「未検証のまま見送った項目」にまとめてある（`ProcessMatcher` で意図的に省いた herdr の挙動・CJK IME の
候補窓の位置合わせ等）。copy モードの `0`・`^`・`$`・Home/End・`g`/`G`・`ctrl+b` は**実装していない**（意図して見送った。
decisions.md D63）ので、確かめる対象ではない（copy モードでは、`ctrl+b` 以外は押しても何も起きず、`ctrl+b` は
copy モードの中でも prefix になる）。M7・M11 のマウス報告は「Linux（CI・手元）」の
手元の項目で、IME の候補窓の見た目も同じ所で確かめる。
