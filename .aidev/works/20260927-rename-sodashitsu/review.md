# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/cli/package.json:20-21 置換で devDependencies のキーの並び（`@types/ws` の後に `@sodashitsu/server`）が崩れた / 対応: 修正済（T1・ラウンド1。並べ替え）
- [should][conv:-] scripts/migrate-from-wtm.sh:291 worktree を探す glob `*/*/.git` が `.` で始まる repo 名・slug に一致せず、その worktree が repair されない（点検者が一時 HOME で実測） / 対応: 修正済（T4・ラウンド1。`.[!.]*` の組み合わせも並べる）
- [nit][conv:-] scripts/migrate-from-wtm.sh:66-69 HOME が `/` で終わるとレイアウトの古いパスと一致せず書き換えから漏れる / 対応: 修正済（T4・ラウンド1。末尾の `/` を落とす）
- [nit][conv:-] scripts/migrate-from-wtm.sh:168-177 copilot・grok の設定の書き換えが一時ファイルを経由せず、失敗時に半端な JSON を残しうる / 対応: 修正済（T4・ラウンド1。一時ファイル → mv）
- [should][conv:-] scripts/migrate-from-wtm.test.ts:72,401,432 git・sh の spawnSync に上限が無く、止まると vitest の testTimeout でも打ち切れない / 対応: 修正済（T5・ラウンド1。全 spawnSync に timeout）
- [nit][conv:-] scripts/migrate-from-wtm.test.ts:227-228 実行の一覧の確認が 1 行だけで件数も任意 / 対応: 修正済（T5・ラウンド1。`済み:` の行を dry-run の `予定:` の行と突き合わせ、件数 27 と最終行を見る）
- [nit][conv:-] scripts/migrate-from-wtm.test.ts:181-183 copilot・grok の hooks/ の他製品の *.json が残ることを見ていない / 対応: 修正済（T5・ラウンド1）
- [nit][conv:-] scripts/migrate-from-wtm.test.ts:338-350 copilot・grok の設定のバックアップが先にある場合の断るケースが無い / 対応: 修正済（T5・ラウンド1）
- [nit][conv:-] scripts/migrate-from-wtm.test.ts:182 新規のファイルが prettier で未整形 / 対応: 修正済（T5・ラウンド1。新規ファイルに prettier --write）
- [nit][conv:-] package.json:11 scripts/ のテストが型検査されない / 対応: 修正済（T5・ラウンド1。`scripts/tsconfig.json` を足してルートの typecheck で tsc を走らせる。型の誤りを入れると typecheck が 2 で落ちることを確かめた）
- [should][conv:-] docs/migrate-from-wtm.md:37,116,122 「docs の例」として挙げた古い名前（`function wtm`・`wtm-lan`・`wtm-cert`）が改名後の docs には無く、`--state-dir` の案内が今の docs（`soda-lan`）と食い違う / 対応: 修正済（T8・ラウンド1。「改名前の docs」と明記し、空の `soda-lan` を指す危険を書き添えた）
- [nit][conv:-] docs/migrate-from-wtm.md:60,79,107 出力の接頭辞を日本語だけで書いていて `.bat` の英語の出力に当てはめにくい / 対応: 修正済（T8・ラウンド1。英語の接頭辞を併記）
- [should][conv:regression-negative-control!] scripts/migrate-from-wtm.sh:204 `ps -p` の道（他の利用者のプロセス）を単独で壊す変異もテストも無い / 対応: 修正済（T6・ラウンド1。pid 1 のロックのテストと変異 pid_alive.ps を足した）
- [should][conv:regression-negative-control] scripts/migrate-from-wtm.sh:102 `|| [ -L "$1" ]`（壊れたシンボリックリンクの移動先）の変異・テストが無い / 対応: 修正済（T6・ラウンド1。テストと変異 need_absent.exists-L）
- [nit][conv:regression-negative-control] scripts/migrate-from-wtm.sh:211,215 ホスト名の行と pid 0 の検査の変異が無い / 対応: 修正済（T6・ラウンド1。pid 0 のテストと変異 2 つ）
- [should][conv:regression-negative-control!] 変異の生の出力が work の中に無く、ログの多くが古いテスト一式で走ったもの / 対応: 修正済（T6・ラウンド1。今のテスト一式で全変異を走らせ直し、生の出力を test-result.md に貼る）
- [must][conv:-] scripts/migrate-from-wtm.bat:153,156,159,174 手順の説明の `->` が `echo … %~1` でリダイレクトになり、dry-run がファイルを作る / 対応: 修正済（T7・ラウンド1。説明を `to` に）
- [must][conv:-] scripts/migrate-from-wtm.bat:28,55 `shift` で %0 がずれ、`--dry-run` のとき同梱の hook のスクリプトの場所を誤る / 対応: 修正済（T7・ラウンド1。引数のループの前に SCRIPT_DIR を取る）
- [should][conv:-] scripts/migrate-from-wtm.bat:151-152,198,208,345 RD・DEL の失敗が ERRORLEVEL に出ないことがある / 対応: 修正済（T7・ラウンド1。実行の後に if exist で確かめる）
- [nit][conv:-] scripts/migrate-from-wtm.bat:36-37 USERPROFILE の末尾の `\` を落とさない / 対応: 修正済（T7・ラウンド1）
- [nit][conv:-] scripts/migrate-from-wtm.bat:169,231 repair の失敗の理由を捨てる / 対応: 修正済（T7・ラウンド1。stderr を見せる）
- [nit][conv:-] scripts/migrate-from-wtm.bat:247,318-324 予定の行のパス・ロックの空白の扱いが .sh とずれる / 対応: 許容（decisions D7）
- [nit][conv:-] design.md:141 ホスト名を %COMPUTERNAME% と比べると書いてあるが .bat は hostname（正しい） / 対応: 修正済（T7・ラウンド1。design を直した）
- [should][conv:-] docs/migrate-from-wtm.md:89,95 localStorage のスニペットが themeOverrides のキー（CSS 変数名 `--wtm-*`）を直さず、上書きした色が黙って消える（cross） / 対応: 修正済（cross・ラウンド1。写すときに `"--wtm-` → `"--soda-`）
- [should][conv:-] scripts/migrate-from-wtm.sh:252 独自コマンド `commands.json` の `$WTM_*` の参照が移行後に空になる（cross） / 対応: 修正済（cross・ラウンド1。`commands.json`〔sessions/*/ も〕の `WTM_` → `SODA_` をバックアップつきで書き換え、.bat・docs・テストにも足した）
- [nit][conv:-] scripts/migrate-from-wtm.sh:69 空の XDG_STATE_HOME の扱いがアプリ（`??`）と違う（cross） / 対応: 許容（decisions D2 (f)。空の基点は相対パスで意味をなさない）

## ラウンド 1（2026-09-27）
- [should][conv:-] packages/server/src/agent/resumeCommand.ts:24・scripts/migrate-from-wtm.sh:300-329 worktree を移すと Claude Code の会話の記録（`~/.claude/projects/<cwd 由来の名前>/`）が古いパスのまま残り、自動再開が会話を見つけられない / 対応: 差し戻し → 修正済（スクリプトが該当の projects のディレクトリを見つけて `注意:` で知らせ、docs に手で移す手順。Claude Code の内部のデータなのでスクリプトは動かさない。decisions D8）
- [should][conv:-] scripts/migrate-from-wtm.sh:317-329,377-391・docs/migrate-from-wtm.md:119-123 `--state-dir` のレイアウトの worktree のパスと `commands.json` の `WTM_` の手動の手順が docs に無い / 対応: 差し戻し → 修正済（docs に追記）
- [should][conv:-] design.md:114-122 cross で足した `commands.json` の書き換えが design・decisions に無い / 対応: 差し戻し → 修正済（design の計画の表と decisions D8）
- [nit][conv:-] scripts/migrate-from-wtm.sh:246-265 途中で止まった後の再実行で、新しい置き場に残った `wtm-*` は名前が変わらない / 対応: 許容（docs に手当てを追記。decisions D8）
- [nit][conv:-] scripts/migrate-from-wtm.sh:159 設定ファイルがシンボリックリンクだと普通のファイルに置き換わる / 対応: 修正済（docs に注意を追記）
- [nit][conv:-] docs/migrate-from-wtm.md:36-38 独自コマンドの文字列が `wtm`・`wtmctl` を呼んでいる場合の案内が無い / 対応: 修正済（docs に追記）

## ラウンド 2（2026-09-28）
- ラウンド 1 の 6 件はすべて解消を確認（レビュアーが sh・bat・テスト・docs・design・decisions で確かめた）。
- [should][conv:-] docs/migrate-from-wtm.md:132-137 手順 7 で新しい worktree で一度 `claude` を起動すると移動先のディレクトリが既にでき、例の `mv` が古いディレクトリをその中へ入れ子で移す / 対応: 差し戻し → 修正済（見比べた後に空のディレクトリを消してから mv する手順にした）

## ラウンド 3（2026-09-28）
- ラウンド 2 の指摘（入れ子）は GNU の `mv -T` と `mv` の前の消去で解消を確認。
- [should][conv:-] docs/migrate-from-wtm.md:143 「macOS は mv -n で、失敗したら手で確かめる」が誤り（BSD の `mv -n` は既存のディレクトリの中へ移し、入れ子を防がない）。ラウンド 2 の修正に由来 / 対応: 差し戻し → 修正済（OS に依らない `[ ! -e "$new" ] && mv "$old" "$new"` に一本化）

## ラウンド 4（2026-09-28）
- 指摘なし（ラウンド 3 の指摘の解消を確認。手順 7 は GNU・macOS とも入れ子にならない）。
