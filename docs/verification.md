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
- [ ] エージェントの会話の再開・Claude Code・Codex 以外の6エージェント（20260923-other-agents-session-resume。
      AC1〜AC8。**この6エージェントとも本開発環境には実機が存在せず、この work のコーディング中は
      一度も実機確認できていない**——単体テストは各エージェントの公式ドキュメントの記述どおりに
      設定ファイル・hook エントリが書き込まれることだけを検証しており、実物の CLI との結線は完全に
      未検証）：Cursor Agent CLI・GitHub Copilot CLI・Devin CLI・Droid・Grok CLI・Qwen Code のいずれかが
      実際にインストールされた環境があれば、上の Claude Code・Codex と同じ手順（導入→設定ファイルへの
      書き込み確認→会話を進める→サーバ再起動→自動再開の確認→複数 pane での独立性→解除）で確認する。
      各エージェントの exact な設定ファイルパス・hook エントリの形は `.aidev/works/
      20260923-other-agents-session-resume/research.md` F4 の表を参照。
      - **Devin CLI だけ設定ファイルのパス（`~/.devin/hooks.json`）が推測値**（公式ドキュメントに
        記載が無かったため、同業他社 Droid の命名慣習から類推した。decisions.md D4）。実機で
        確認できる環境があれば、まずこのパスが正しいかどうかを優先して確かめる。
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
- [ ] pane の cwd 追従と、新しく開く場所の「引き継ぐ」（20260921-new-terminal-cwd）を確認する：**Windows は前面のプロセスの cwd を
      読めない**ので、「いまの場所」は**シェルが OSC 7 で知らせた場所**だけ（herdr も部分対応。`[H]windows-beta.mdx:62-70`）。
      既定の `powershell.exe` は OSC 7 を出さないので、pane で `cd C:\Windows` してから `Ctrl+B c` で新しい tab を開き `Get-Location`
      を実行すると、**元の pane を開いた場所**になる（`cd` した先ではない）。これは既知の制約で、不具合ではない（以前の新しい tab は
      workspace を作った場所、新しい workspace はサーバを起動した場所で開いていた）。プロンプトで OSC 7 を出すようにしたシェルでは
      `cd` した先で開くはず（`file://host/C:/…` の形を `C:\…` に直して使う。20260921-new-terminal-cwd の decisions D7。**実機では未検証**——確かめたらここを更新する）。
      設定を「ホーム」にした新しい tab が `%USERPROFILE%` で開くことも確かめる。
- [ ] workspace の自動の名前（20260921-workspace-auto-label）：起動時に作る最初の workspace が、`soda serve` を起動した場所の名前
      （リポジトリの直下から起動したならリポジトリの根の名前）になる。Windows の既定の `powershell.exe` では「引き継ぐ」が `cd` に追従
      しない（上の項目）ので、場所は設定の「新しく開く場所」で選ぶ：「ホーム」にして新しい workspace → `~`（ホームが git のリポジトリでなければ）。「指定した場所」に `C:\` を
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
- [ ] 隠れた pane の大きさ（D105）：「この端末に合わせる」を押したまま、pane（p1）で `while sleep 1; do stty size; done` を
      動かし、`Prefix` → `v` で分割する（スマートフォンは新しい pane を表示し、p1 は隠れる）。10 秒ほど待ってから
      `Prefix` → `h` で p1 に戻る。期待：p1 に出ている値が、隠れている間もずっと同じ（`1 1` のような値が一度も出ない）。
      PC のブラウザでも p1 の表示が崩れない。

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
   トースト（右下）が出て、音の設定が入ならベルが鳴る。Windows Terminal では設定「端末版 → 通知の出し方」を OSC 777 にしてデスクトップ通知が出る
   （端末側で受ける設定が要る版がある）。`prefix+o` で対象の pane へ移る。
8. **複数ホスト（AC14）**: 登録したマシン（`docs/machines.md`）がサイドバーにマシンの見出しで並び、クリックで切り替えて操作できる。
9. **認証（AC18）**: 状態ディレクトリの `local-auth.json` を別の利用者から読めない（Linux・WSL2 は `ls -l` で `-rw-------`）。
   `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:<ポート>/api/local-login -H 'content-type: application/json' -d '{"secret":"x"}'` が 401 か 403。
   cookie なしの `/ws` は繋がらない（ブラウザのログアウト後に端末版を開き直すと、端末版は秘密を読み直して繋がる）。
10. **入れ子と tmux**: pane の中で `soda` を打つと終了コード 1 で断る（`--allow-nested` で開く）。tmux の中で開き、`Ctrl+B Ctrl+B` で端末版の prefix が効く。
11. **SSH 越し（AC4）**: SSH で入った先で 1.〜7. を行う。コピーは OSC 52 で手元の端末のクリップボードへ届く。通知と 24 ビット色は設定・`SODA_TRUECOLOR=1` で指定する。

### うまくいかないとき

- 起動しない・案内が出て終わる: `docs/tui.md`「起動できないとき」。
- 色が 256 色になる: `SODA_TRUECOLOR=1 soda …` か設定「色の出し方（この端末だけ）」。
- マウスが効かない: 設定「端末版 → マウスを使う」が入か。外側の端末がマウスの報告に対応しているか。
- キーが効かない: 外側の端末が先に取っている（`docs/tui.md`「外側の端末との衝突」「区別できないキー」）。

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

ほかに、各節に書いた制約：xterm.js のモバイルの未解決課題（「実機（iOS Safari・Android Chrome。AC12）」の「既知の未解決課題」）・
リバースプロキシの無通信のタイムアウト（`docs/tls-setup.md`「リバースプロキシの後ろに置く」）。

## 未検証のまま見送った項目（`docs/herdr-parity.md` の対象外一覧とあわせて参照）

このリポジトリの自動テストと本 docs の手順のどちらでも確認しない項目は
`docs/herdr-parity.md`「未検証のまま見送った項目」にまとめてある（`ProcessMatcher` で意図的に省いた herdr の挙動・CJK IME の
候補窓の位置合わせ等）。copy モードの `0`・`^`・`$`・Home/End・`g`/`G`・`ctrl+b` は**実装していない**（意図して見送った。
decisions.md D63）ので、確かめる対象ではない（copy モードでは、`ctrl+b` 以外は押しても何も起きず、`ctrl+b` は
copy モードの中でも prefix になる）。M7・M11 のマウス報告は「Linux（CI・手元）」の
手元の項目で、IME の候補窓の見た目も同じ所で確かめる。
