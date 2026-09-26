---
name: wtmctl
description: "wtm（web-tn-multiplexer）の pane の中から、wtmctl で workspace・tab・pane・コーディングエージェントを調べて操作する。利用者が wtm か wtmctl を明示したとき、または wtm の pane を使って隣の pane でコマンドを走らせる・別のエージェントに作業を頼むよう頼まれたときだけ使う。バックグラウンドの端末や並行作業が役立ちそうだというだけでは使わない。WTM_PANE_ID が要る。"
---

# wtmctl

wtm は端末を workspace・tab・pane に分けてブラウザに出し、pane の中で動くコーディングエージェント（Claude Code・Codex 等）を検出する。
`wtmctl` はそれを外から操作する CLI。

## まず確かめる

操作の前に、自分が wtm の pane の中で動いているかを確かめる:

```bash
test -n "${WTM_PANE_ID:-}"
```

失敗したら、wtm の pane の中ではないと利用者に伝えて止まる。wtm の外から wtm の session を調べたり操作したりしない。

下の手順は応答の JSON から ID を `jq` で読む。`command -v jq` で無ければ、`jq` を使わずに応答の JSON をそのまま読んで ID を拾う（ID を推測で埋めない）。

## コマンドを知る

構文の正典は、使っている wtmctl の `wtmctl help`。まずそれを読む。

- 引数を省いた変更系のコマンドで構文を探らない。`wtmctl workspace create` のように、引数が無くても既定値で実行されるものがある。
- 結果は標準出力の JSON（`pane read`・`agent read` はテキスト）。サーバ側のエラーは標準エラーの `{"error":{"code","message"}}` で終了コード 1、
  使い方の誤りは終了コード 2。
- エラーの `code` で分岐する（メッセージの文面に頼らない）。

## 接続と認証

- pane の中では、何も付けずにその pane を動かしているサーバへつながる（pane の環境の `WTM_SERVER_URL`）。利用者が `WTMCTL_URL` を
  設定していればそちらが優先される。`--url` は、利用者が別のサーバを指したときだけ使う。
- `unauthenticated`・`invalid_token` で失敗したら、利用者に**自分の端末で** `wtmctl login --url <URL> --token <TOKEN>` を打ってもらうよう頼んで止まる。
  `<URL>` は今の接続先を展開した値（`WTMCTL_URL` があればそれ、無ければ `WTM_SERVER_URL` の値。例 `http://127.0.0.1:7780`）を伝える——利用者の端末には
  `WTM_SERVER_URL` が無く、ログインは URL（origin）ごとに保存されるため。
  token をコマンド行・ファイル・会話に書かない。token を探しに行かない（設定ファイル・状態ディレクトリを読まない）。

## ID と自分の位置

- ID は workspace が `w1`、tab が `t1`、pane が `p1` の形。閉じたものの ID は使い回されない。**ID は推測せず、応答の JSON から読む**
  （`workspace create` は `.workspace.id`・`.tab.id`・`.pane.id`、`tab create` は `.tab.id`・`.pane.id`、`pane split` は `.pane.id`）。
- 自分の pane は `$WTM_PANE_ID`。自分の tab・workspace は snapshot から引く:

```bash
wtmctl snapshot | jq -r --arg p "$WTM_PANE_ID" '.panes[] | select(.id == $p) | .tabId'
wtmctl snapshot | jq '{workspaces: [.workspaces[] | {id, label}], tabs: [.tabs[] | {id, workspaceId, label}], panes: [.panes[] | {id, tabId, cwd}]}'
```

- ブラウザで利用者が見ている pane（フォーカス）に頼らない。対象は必ず ID かエージェントの名前で指す。

## pane とエージェント

- pane はエージェントが居ても居なくてもある。普通のコマンド・シェル・テスト・サーバには pane のコマンド（`pane run`・`pane read` 等）を使う。
- pane の前面で検出されたコーディングエージェントには agent のコマンドを使う。`<target>` は pane ID か、`agent rename`／`agent start` で付けた名前
  （英小文字で始まる 1〜32 文字の `[a-z0-9_-]`。いま居るエージェントの間で一意）。名前はそのエージェントが終了する・入れ替わる・pane が閉じると消える。
- エージェントの状態:

| 状態 | 意味 |
|---|---|
| `working` | 作業中 |
| `blocked` | 承認・質問の入力待ち |
| `idle` | 手が空いている |
| `done` | 手が空いていて、まだ既読になっていない完了がある（`idle` と同じく入力を受け付ける） |
| `unknown` | エージェントは居るが状態を判定できない（完了した証拠ではない） |

## 隣の pane で普通のコマンドを走らせる

利用者に場所を指定されていなければ、自分の pane を分けて隣に作る。workspace・tab は利用者に頼まれない限り作らない。

```bash
p=$(wtmctl pane split "$WTM_PANE_ID" --direction right | jq -r .pane.id)   # 横長なら right、縦長なら down
wtmctl pane run "$p" "cd $(printf %q "$PWD") && pnpm test; echo \"__wtm_done:\$?\""
wtmctl pane read "$p" | tail -n 40
```

- 新しい pane の作業場所はサーバの設定で決まるので、`pane run` の先頭で `cd` して明示する。
- `pane run` は、コマンドと Enter をその pane に打ち込むだけ（届いたかの確認は無い）。終わりを知るには、上のように印を出させて `pane read` で探す
  （出るまで間を置いて読み直す）。打ち込んだコマンド行そのものも画面に出るので、印は `__wtm_done:0` のように**数字が続く形**で探す
  （`__wtm_done` だけで探すと、終わる前に一致する）。`pane read` は画面とスクロールバックのテキストを返す。
- `pane input` は Enter を付けずに送る。

## エージェントを起動して作業を頼む

```bash
p=$(wtmctl pane split "$WTM_PANE_ID" --direction right | jq -r .pane.id)
wtmctl agent start reviewer --kind codex --pane "$p"            # -- の後はエージェントへの引数
wtmctl agent prompt reviewer "今の差分をレビューして、直すべき指摘だけを挙げて" --wait --timeout 600000
wtmctl agent read reviewer --lines 120
```

- `agent start` は、前面がシェル自身だけの pane（プロンプトで待っているシェル。Linux／WSL2 の sh・bash・dash・zsh・ksh・mksh）にだけ打ち込む。
  `--kind` は決まった表から選ぶ（例 `claude`・`codex`・`gemini`。表に無い種類を渡すと使い方の誤りで、選べる種類の一覧が出る）。利用者に頼まれた種類を使う。成功は、エージェントが検出されて
  入力を受け付けられる（`idle`）ようになってから。起動中に `blocked`（信頼の確認等）になると `agent_not_ready` で返るが名前は付いている。
- `agent prompt` は、エージェントが `blocked` なら何も送らずに `agent_blocked` で断る。`--wait` は送信後に作業が始まった（`working`/`blocked`）ことを
  確かめてから、`idle`・`done`・`blocked` のどれかになるまで待つ。普通の仕事ならこれで足りるので、`--until` で既定を並べ直さない。
- `--timeout` を付けないと、作業が始まった後は無期限に待つ。長い仕事でも締め切りを付ける。
- 既に動いているエージェントの状態が変わるのを待つだけなら `agent wait`（例 `--until blocked`）。
- 承認ダイアログ・メニューへのキーは `agent send-keys`（例 `esc`・`enter`・`y`・`ctrl+c`）。不明なキー名が 1 つでもあれば何も送らない。

## 作法

- **自分が作っていない workspace・tab・pane を閉じない**。利用者に頼まれたときだけ閉じる。自分が作った pane も、結果を読んだ後に利用者の邪魔になるなら閉じてよいが、
  利用者が見ている可能性があるなら残して ID を伝える。
- `timeout`・`agent_prompt_stalled`・`agent_prompt_failed`・`agent_not_running`・`connection_closed` は「送られなかった」ことを意味しない。**確かめずに送り直さない**。
  `agent get`・`agent read` で今の状態を見てから決める。
- エージェントが `blocked`（承認・質問）なら、`agent read` で画面を読み、**答える前に利用者に確かめる**（何を承認するかは利用者が決める）。
- 他のエージェントの作業中（`working`）に割り込まない。
- `pane attach`（手元の端末を pane に直結する）・`watch`・`pane read --follow` は人が対話的に使うもので、終わらない。エージェントは使わない。
- `pane observe`・`pane control` は別のプログラム（ブリッジ）が pane の画面を 1 行 1 JSON で読み続ける・stdin の JSON で操作するためのもので、pane が終わるか
  control を返すまで終わらない。エージェントが画面を読むなら `pane read`・`agent read`、入力するなら `pane input`・`agent prompt` を使う。
- token・cookie・`~/.wtmctl` の中身を読まない・書き出さない。

## 自分の pane の歯止め（`self_target`）

pane の中の wtmctl は、次の操作の対象が**自分の pane**（`$WTM_PANE_ID`）か、**それを含む tab・workspace** のとき、何もせずに `self_target`（終了コード 1）で断る:
`pane close`・`pane input`・`pane run`・`pane attach`・`pane control`・`tab close`・`workspace close`・`agent prompt`・`agent send-keys`・`agent start`。

自分の pane を閉じると自分が終わり、自分の pane への入力は自分の入力欄に混ざる。断られたら、対象の ID を取り違えていないかを見直す。
この歯止めは誤操作を止めるだけで、安全の境界ではない。**利用者に明示的に頼まれない限り、回避しない**（`WTM_PANE_ID` を空にして打つと効かなくなる）。
歯止めは接続先が `WTM_SERVER_URL` と同じサーバだと分かるときだけ効く。`WTMCTL_URL`（や `--url`）がループバック以外の名前（証明書の名前等）でつないでいると、
同じサーバでも効かない。そのときは歯止めに頼らず、自分の pane・tab・workspace を対象にしていないかを自分で確かめてから打つ。

## コマンドの一覧

`wtmctl help` の内容（構文は help を正とする）:

- 接続: `wtmctl login`（利用者が打つ）
- workspace: `wtmctl workspace create`・`wtmctl workspace close`・`wtmctl workspace rename`
- tab: `wtmctl tab create`・`wtmctl tab close`
- pane: `wtmctl pane split`・`wtmctl pane close`・`wtmctl pane input`・`wtmctl pane run`・`wtmctl pane read`・`wtmctl pane attach`・
  `wtmctl pane observe`・`wtmctl pane control`
- 状態: `wtmctl snapshot`・`wtmctl watch`
- エージェント: `wtmctl agent list`・`wtmctl agent get`・`wtmctl agent wait`・`wtmctl agent read`・`wtmctl agent prompt`・`wtmctl agent send-keys`・
  `wtmctl agent rename`・`wtmctl agent start`
- この説明: `wtmctl skill`
