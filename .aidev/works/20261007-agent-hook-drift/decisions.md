# 決定記録

## D1: Grok CLI のエントリを、文書どおりの入れ子（`matcher` なし）に変える

- **背景**: 現行の文書（research G2）の設定の例は入れ子だけ。本製品は平らな形で書いている。平らな形を
  受けるという記述は無い。実機は無い。
- **決定**: `{hooks:[{type:"command", command, timeout:10}]}` を書く。`matcher` は書かない（「omit it to match
  everything」。空文字列の扱いは文書に無い）。平らな形のエントリは「古いもの」として見つけ、［更新］で入れ直す。
- **理由・代替案**: 根拠があるのは文書の形だけ。平らなまま残す・両方書く案は、読まれる根拠が無い／確かめる
  手段が無い。**古い版の Grok CLI が入れ子を受けるかは分からない**（残る不確かさ）。

## D2: Devin CLI の書き先を `~/.config/devin/config.json` の `hooks` キーに変える。`DEVIN_CONFIG_DIR` は古い場所を探すときだけ使う

- **背景**: 旧 decisions D4 の `~/.devin/hooks.json`・`DEVIN_CONFIG_DIR` は推測で、現行の文書の「Where Hooks
  Live」の表に無い（research D1）。利用者の段で本製品が書けるのは `config.json` の `hooks` キーだけ
  （`~/.claude/settings.json` は Claude Code の設定）。
- **決定**: `<home>/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`）の
  `hooks.SessionStart`。スクリプトも同じフォルダの `hooks/` に置く。`XDG_CONFIG_HOME` は見ない。
  `DEVIN_CONFIG_DIR` は、以前の版が書いた古い `hooks.json` を探すときだけ読む。
- **理由・代替案**: `XDG_CONFIG_HOME` に従うという記述が無い（research D7）。文書に書いてある場所だけに書く。
  従う実装だった場合、`XDG_CONFIG_HOME` を変えている利用者ではフックが読まれない（残る不確かさ）。

## D3: コメントつきの `config.json` は書き換えずに断る

- **背景**: Devin の設定はコメントつきの JSON を許す（research D5）。本製品は `JSON.parse` で読む。
- **決定**: 解釈できなければ何も変えず、理由（コメントのこと）を知らせに足す。
- **理由・代替案**: コメントを取り除いて読み、書き戻すと、利用者のコメントが消える。コメントを保って書き換える
  には専用の部品が要り、この work の大きさに合わない。

## D4: Qoder CLI の連携の kind は `qodercli`、コマンドは `qoder`、`matcher` は省く

- **背景**: 検出の kind は `qodercli`（herdr の表）。文書の実行ファイル名は `qoder`、npm の `bin` は両方
  （research Q-9）。`SessionStart` の由来は startup / resume / clear / compact / new（research Q-4）。
- **決定**: kind は `qodercli`（既存の 8 つと同じく、検出の kind と同じ名前にする）。再開のコマンドは文書どおり
  `qoder --resume <id>`。検出は `qoder` か `qodercli`。`matcher` は省いて全部で報告する。
- **理由・代替案**: kind を `qoder` にすると、検出の kind と連携の kind が初めて食い違う。Claude Code に倣って
  `startup|resume` に絞ると、`/clear`・`/new` で替わったセッションの id が届かない（Claude Code・Codex の
  既存の `startup|resume` は、この work では変えない）。

## D5: 受け口が claude・codex 以外の報告を捨てていた件を、この work で直す

- **背景**: research X1。20260923-other-agents-session-resume が 6 つの kind を足したとき、`composeServer.ts` の
  条件が広げられなかった。単体テストは `reportAgentSession` を直に呼ぶので見つからなかった。
- **決定**: 条件を `isAgentIntegrationKind`（`HOOK_SPECS` のキー）に替える。実物の受け口を通す回帰テストを足す。
- **理由・代替案**: 直さないと、この work で直す 3 つのフックは、正しく入っても会話が再開されない。依頼の
  「ほかの kind と同じ形で足す」の前提が成り立たない。差分は 1 行と、一覧の出し口。

## D6: 点検（T1・T2）の指摘への対応と、割り切り

- **直した**: ① 設定ファイルを書くときは、既存ならシンボリックリンクを解決した先へ書き、元の権限を保つ（`writeConfigFile`。`persist/atomicFile.ts` の既定は変えない。新しく作るファイルの権限は従来どおり 0600）。② Devin の古い `hooks.json` は `DEVIN_CONFIG_DIR` の場所と `~/.devin` の両方を探す（同じパスは 1 つ）。③ 空・空白だけのファイルは `{}`、先頭の BOM は除いて読む（**書き戻しでは BOM を足さない**）。解釈できない文は「コメントなどがあって JSON として解釈できない」に直した。
- **割り切り（直さない）**: uninstall の後に `{"hooks":{}}` が残る（既存の kind と同じ決まり。テストで固定）。現在の設定が解釈できないとき、uninstall は古いものだけ片づけて `ok:true` を返す（design どおり。**message に「新しい設定（パス）は解釈できないので触っていません」を足す**）。古い `hooks.json` を書き戻すと整形が変わる（内容は保つ）。
- **読めない原因を分ける**: 読み込みの失敗（権限・循環するリンク・ディレクトリなど）は「設定ファイルを読めません（パス）: 理由」。コメントの案内は JSON の構文の失敗のときだけ。どちらも何も書かずに断る。行き先の無いシンボリックリンクは、リンクを保って行き先に作る。
- **直さない（記録だけ）**: 先頭が `-` のセッション id は既存の挙動のまま（`resumeCommandFor` の絞り込みは変えない）。新しい web と古いサーバの組み合わせは扱わない（同じビルドで配る）。
