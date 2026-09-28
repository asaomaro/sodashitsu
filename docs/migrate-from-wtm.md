# 旧名 wtm からの移行（Sodashitsu への改名）

製品名を **web-tn-multiplexer（コマンド `wtm`・CLI `wtmctl`）** から **Sodashitsu（操舵室。コマンド `soda`・CLI `sodactl`）** に改めた
（20260927-rename-sodashitsu）。**アプリは古い名前を一切読まない**（古いコマンドの別名・古い環境変数・古い cookie・古い localStorage のキー・
古いディレクトリのどれも見ない）。手元に残っている古い名前の状態は、このページの手順で一度だけ移す。

## 何が変わったか

| 古い                                                                                                                      | 新しい                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| コマンド `wtm`・`wtmctl`                                                                                                  | `soda`・`sodactl`                                 |
| 環境変数 `WTM_*`・`WTMCTL_*`（`WTM_SESSION`・`WTM_PANE_ID`・`WTMCTL_URL`・`WTMCTL_TOKEN` 等）                             | `SODA_*`・`SODACTL_*`                             |
| 状態ディレクトリ `${XDG_STATE_HOME:-~/.local/state}/web-tn-multiplexer`（Windows は `%LOCALAPPDATA%\web-tn-multiplexer`） | `…/sodashitsu`                                    |
| ロック `wtm.lock`・クリップボードの画像 `wtm-image-*`                                                                     | `soda.lock`・`soda-image-*`                       |
| CLI のキャッシュ `~/.wtmctl`                                                                                              | `~/.sodactl`                                      |
| worktree の既定の置き場 `~/.wtm/worktrees`                                                                                | `~/.sodashitsu/worktrees`                         |
| エージェント連携の hook `wtm-agent-report.cjs`（copilot・grok は設定ファイルも `wtm-agent-report.json`）                  | `soda-agent-report.cjs`・`soda-agent-report.json` |
| ブラウザの cookie `wtm_session`・`wtm_session_<名前>`                                                                     | `soda_session`・`soda_session_<名前>`             |
| ブラウザの localStorage `wtm.prefs.v1` 等                                                                                 | `soda.prefs.v1` 等                                |
| 手で入れた agent skill `~/.claude/skills/wtmctl`                                                                          | `~/.claude/skills/sodactl`                        |

## 同じ時期の変化：引数なしの `soda` は端末版を開く

20260927-cli-mode から、**引数なしの `soda` は使い方の表示ではなく、端末の中の画面（端末版。`docs/tui.md`）を開く**
（手元のサーバが動いていなければ裏で起動してから繋ぐ）。以前の `wtm`（引数なし）は使い方を出して終了コード 0 だった。

- **スクリプトから使い方を見るなら `soda help`**（`--help`・`-h` も同じ。終了コード 0）。
- 標準入力か標準出力が端末でない（パイプ・リダイレクト・CI）ところで引数なしの `soda` を呼ぶと、サーバを起動せずに一行の案内を標準エラーへ、
  使い方を標準出力へ出して**終了コード 2** で終わる。`soda` の出力や終了コードを見ていたスクリプトは `soda help` に書き換える。
- `soda serve`・`soda token reset`・`soda session …` 等のサブコマンドの挙動は変わらない。
- ブラウザの設定（配色・キー・通知等）は、この版からサーバに置いて**ブラウザ同士・端末版と共有**になった（下の 5. で写した好みは、
  サーバにまだ設定が保存されていなければ、写した後に最初に開いたブラウザからサーバへ移る。既に保存されていればサーバの値が勝つので、設定画面で直す）。

## 手順

### 1. 古い `wtm serve` をすべて止める

既定の session も名前付き session も止める（`wtm session list` で `running` が無いこと）。**動いている間はスクリプトが断る**
（状態ディレクトリと `sessions/*/` の `wtm.lock` の持ち主が生きていれば、何も変えずに終了コード 1）。

### 2. 新しい版を取ってビルドする

```bash
git pull   # リポジトリは sodashitsu に改名される（clone の場所は変えなくてよい）
pnpm install && pnpm -s build
```

`soda`・`sodactl` を PATH に置く（今まで `wtm`・`wtmctl` を置いていた方法で、`packages/server/dist/main.js`・`packages/cli/dist/main.js` を指す）。
古い `wtm`・`wtmctl` のリンク・エイリアス・シェルの関数（改名前の `docs/tls-setup.md` にあった `function wtm { … }` 等。今の docs では `function soda { … }`）は消す。
シェルの初期化ファイル・systemd の unit・スクリプトに `WTM_*`・`WTMCTL_*` を書いていれば `SODA_*`・`SODACTL_*` に直す。
独自コマンド（`commands.json`）のコマンドの文字列が `wtm …`・`wtmctl …` を呼んでいれば `soda`・`sodactl` に直す
（スクリプトが直すのは `WTM_` で始まる環境変数の名前だけ）。

### 3. 移行スクリプトを実行する

**Linux・macOS・WSL2**（リポジトリの根で）:

```bash
sh scripts/migrate-from-wtm.sh --dry-run   # 何をするかを見るだけ（何も変えない）
sh scripts/migrate-from-wtm.sh             # 実行する
```

**Windows ネイティブ**（cmd または PowerShell で、リポジトリの根で）:

```bat
scripts\migrate-from-wtm.bat --dry-run
scripts\migrate-from-wtm.bat
```

> **`.bat` は Windows の実機で一度も実行していない（未検証）**。`.sh` と同じ検査・手順を持つよう読み合わせただけ。
> 必ず先に `--dry-run` で予定を確かめ、状態ディレクトリ（`%LOCALAPPDATA%\web-tn-multiplexer`）を別の場所に写してから実行する。
> メッセージは英語（cmd がバッチファイルをコンソールのコードページで読むため）。文字列の置換には PowerShell を使う。

スクリプトが行うこと（どれも**移す元があるものだけ**。1 行 1 操作で `予定:`／`済み:` と表示する。`.bat` は英語で `planned:`／`done:`）:

- 状態ディレクトリを `sodashitsu` へ移し、中の `wtm.lock` → `soda.lock`、`clipboard-images/wtm-image-*` → `soda-image-*` の名前を変える（`sessions/*/` も）。
- 独自コマンド（`commands.json`。`sessions/*/` も）のコマンドの文字列の `WTM_` を `SODA_` に書き換える（`$WTM_ACTIVE_PANE_CWD` 等。新しいアプリは `SODA_*` だけを渡す）。
- `~/.wtmctl` を `~/.sodactl` へ移し、キャッシュした cookie の名前を `soda_session` にする（CLI はログインし直さなくてよい）。
- `~/.wtm/worktrees` を `~/.sodashitsu/worktrees` へ移し、各 worktree で `git worktree repair` を実行する（元の repo の `git worktree list` が新しいパスを指す）。
  保存したレイアウト（`session.json`）の中の古い worktree のパスも新しいパスにする。`~/.wtm` が空になれば消す。
- エージェント連携の hook（claude・codex・cursor・copilot・devin・droid〔`~/.factory`〕・grok・qwen。`CLAUDE_CONFIG_DIR`・`CODEX_HOME`・`DEVIN_CONFIG_DIR` を
  アプリと同じく尊重）の設定の `wtm-agent-report` を `soda-agent-report` に書き換え、hook のスクリプトを同梱の新しい版
  （`SODA_PANE_ID` を読む。古い版は `WTM_PANE_ID` を読むので名前を変えるだけでは効かない）に置き換える。本製品以外の hook のエントリには触れない。
- **書き換える・名前を変えるファイルは、先に `<ファイル>.bak-wtm-migration` に写す**（例 `~/.claude/settings.json.bak-wtm-migration`）。
  確かめ終えたら消してよい。
  書き換える設定ファイルがシンボリックリンク（dotfiles の管理等）なら、リンクは普通のファイルに置き換わり、リンク先は古いまま残る。
  その場合は実行の後にリンク先へ内容を写してリンクを張り直す。

断るとき（終了コード 1。**何も変えていない**）:

- 古い `wtm serve` が動いている（別のホストのロックは生死を確かめられないので、動いていないと確かめてからロックのファイルを消す）。
- 移動先（`sodashitsu`・`~/.sodactl`・`~/.sodashitsu/worktrees`・名前を変える先の hook のファイル）やバックアップの名前が既にある（上書きしない）。
- worktree を移すのに git が無い・同梱の hook のスクリプトが見つからない／古い版（改名した後の checkout の `scripts/` から実行する）。

理由はすべて並べてから断る。直して実行し直す。**移行を終えた後にもう一度実行すると、何も変えずに「移すものがありません」と出て終了コード 0**。
途中で失敗したとき（終了コード 3）は、`済み:` の行までは行われている（巻き戻さない）。`git worktree repair` の失敗は `警告:`（`.bat` は `warning:`）の行の worktree で
`git worktree repair` を手で実行する。

途中で止まった後に再実行しても、新しい置き場（`sodashitsu`）に残った `wtm.lock`・`clipboard-images/wtm-image-*` は名前が変わらない
（スクリプトは古い置き場があるときだけ中を見る）。その場合は下の「スクリプトが扱わないもの」の手順で手で名前を変える。

スクリプトは最後に `注意:`（`.bat` は `note:`）で、変えなかったが手当てが要るものを知らせる（手で入れた skill・Claude Code の会話の記録。下の 6・7）。

### 4. ブラウザでログインし直す（一度だけ）

cookie の名前が変わったので、最初に開いたときだけログイン画面になる。**token は変わらない**（`auth.json` は状態ディレクトリごと移っている）。
token の控えが無ければ、`soda serve` を止めて `soda token reset` で作り直す。

### 5. （任意）ブラウザの好みを引き継ぐ

配色・キー割り当て・サイドバーの行・通知の入切・案内済みの印などはブラウザの localStorage に `wtm.*` のキーで入っている。アプリはそれを読まないので、
そのままだと既定に戻る。引き継ぎたいときは、**移行した後の soda の画面**（ログインした後。古い `wtm serve` と同じ origin——同じホスト名とポート——で開く）で
ブラウザの開発者ツールのコンソールに次を貼って実行し、ページを読み込み直す（新しいキーが既にあるものは上書きしない）。

```js
for (const k of Object.keys(localStorage)) {
  if (k.startsWith("wtm.")) {
    const n = "soda." + k.slice(4);
    // 色の個別の上書き（themeOverrides）のキーは CSS 変数の名前なので、--wtm- を --soda- に直して写す。
    const v = localStorage.getItem(k).replaceAll('"--wtm-', '"--soda-');
    if (localStorage.getItem(n) === null) localStorage.setItem(n, v);
  }
}
```

localStorage は origin（スキーム・ホスト名・ポート）ごとなので、別のポート・別のホスト名で開いていた画面の好みは、その origin で同じことをする。
タブごとの表示位置（sessionStorage の `wtm.view.v1`）は引き継がない。

### 6. （任意）agent skill を入れ直す

`~/.claude/skills/wtmctl` を手で入れていたら（スクリプトは変えずに `注意:`〔`.bat` は `note:`〕で知らせる）、消してから `sodactl skill` で入れ直す（`docs/sodactl.md`）。

```bash
rm -r ~/.claude/skills/wtmctl
mkdir -p ~/.claude/skills/sodactl && sodactl skill > ~/.claude/skills/sodactl/SKILL.md
```

### 7. （任意）worktree の中で使っていた Claude Code の会話を引き継ぐ

Claude Code は会話の記録を、作業したディレクトリ（cwd）から決まる名前のディレクトリ
（`${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<cwd の / や . を - にした名前>`）に置く。worktree を移すと、古い worktree のパスの名前のまま残るので、
soda の自動再開（保存したレイアウトから `claude --resume <id>` を新しいパスで打つ）や `claude --resume` が会話を見つけられない。
スクリプトは該当しそうなもの（名前に `-wtm-worktrees-` を含むもの）を `注意:` で知らせるだけで、動かさない（Claude Code の内部のデータのため）。
引き継ぐなら Claude Code を止めてから、名前の `-wtm-worktrees-` の部分を `-sodashitsu-worktrees-` に変える（名前の付け方は Claude Code の版で違いうるので、
新しい worktree で一度 `claude` を起動して、できたディレクトリの名前と見比べてから行う）。
**見比べるために起動するとそのディレクトリができるので、`mv` の前に消す**——残したまま `mv` すると、古いディレクトリがその**中へ**入れ子で移り、
会話は引き継がれない。見比べた後の新しいディレクトリにその起動の分しか無いことを確かめてから消す。

```bash
ls ~/.claude/projects | grep -- '-wtm-worktrees-'
old=~/.claude/projects/-home-you--wtm-worktrees-app-feat          # 例
new=~/.claude/projects/-home-you--sodashitsu-worktrees-app-feat   # 例（見比べて確かめた名前）
ls -la "$new"                    # 見比べたときの起動の分だけなら
rm -r "$new"                     # 消してから
[ ! -e "$new" ] && mv "$old" "$new"   # 移動先が無いときだけ名前を変える（あると mv は中へ入れ子で移す。GNU・macOS とも）
```

## スクリプトが扱わないもの（手で移す）

- **`--state-dir` で既定と違う状態ディレクトリ**（例: 改名前の docs の LAN 用の `~/.local/state/wtm-lan`。今の docs は `~/.local/state/soda-lan` を使う）。
  古い名前のディレクトリをそのまま `--state-dir` に渡して使い続けるか、止めてから新しい名前（`soda-lan` 等）へ手で動かすかを選ぶ。
  **今の docs の手順をそのまま打つと、空の `soda-lan` を指して新しい token の session が始まる**ので注意する。
  どちらでも、中の古い名前のファイルは新しいアプリが見ないので、止めてから名前を変える: `wtm.lock` → `soda.lock`（落ちた残りなら消してよい）、
  `clipboard-images/wtm-image-*` → `soda-image-*`（貼り付けた画像を今後も使うなら。`sessions/*/` も同じ）。
  スクリプトが既定の worktree の置き場を移した場合、その状態ディレクトリの `session.json`（`sessions/*/` も）の `~/.wtm/worktrees` のパス（絶対パス）を
  `~/.sodashitsu/worktrees` に書き換える（止めてから。`sed -i.bak "s#$HOME/.wtm/worktrees#$HOME/.sodashitsu/worktrees#g" <session.json>`）。
  独自コマンドの `commands.json` の `WTM_` も `SODA_` に直す（`sed -i.bak 's/WTM_/SODA_/g' <commands.json>`）。
- **`--worktree-dir` で既定と違う worktree の置き場**。動かさなければ何もしなくてよい。動かすなら、動かした各 worktree で `git worktree repair` を実行する。
- **リモートのマシン**（`soda machine` で登録した SSH の宛先）。リモートでも新しい版をビルドして `soda` を PATH に置き（手元は `ssh <宛先> soda bridge` を実行する）、
  このスクリプトを実行する。
- 証明書などのファイル名（改名前の docs の例の `~/wtm-cert/wtm.pem` 等。今の docs は `~/soda-cert/soda.pem`）は利用者のファイルなので、そのままでよい（`--cert`・`--key` に渡すパスだけ合わせる）。
