# 判断の記録（20260928-windows-pane-cwd）

## D1 三層の判定と実行モード

- **背景**: ユーザーの報告（Windows で pane の場所が再起動後に workspace を作った場所へ戻る）。原因は Windows で pane の場所を OSC 7 だけに頼っていること（requirements）。
- **決定**: full（シェルの起動という pane を作る共有の経路に手を入れ、シェルごとの差し込み方と利用者のプロファイルとの共存を決める必要がある。ユーザーが full を選んだ）。requirements はユーザーと対話で承認し、以後は autonomous で PR・squash merge まで（ユーザーの指示）。
- **影響**: 上流文書は doccheck、各タスクは taskcheck。Windows の実機では確かめられないので、未検証の範囲を PR に書く。

## D2 独自コマンドの pane には差し込まない（requirements F1 の読み替え）

- **背景**: requirements F1 は「独自コマンドの shell 種」も挙げたが、独自コマンドの pane は `command`（シェルと引数・環境）を持って起動し、引数を足すとコマンドの意味が変わる。
- **決定**: 差し込むのは対話の pane のシェル（新規・分割・復元）だけ。独自コマンドの pane と `edit_scrollback` のエディタには差し込まない。
- **影響**: 独自コマンドの pane の場所は、そのコマンドが OSC 7 を出さない限り開いた場所のまま（今までどおり）。docs に書く。

## D3 知らせは OSC 7 でなく OSC 9;9 で出す

- **背景**: design の点検で、cmd の `$P` は符号化されないので OSC 7（URL）では `%`・`#` を含むパスが化ける・切れると指摘された。PowerShell の UNC パスも URL の組み立てが崩れる。
- **決定**: 差し込むシェルは OSC 9;9（Windows Terminal の場所の知らせ。中身は Windows のパスそのもの）で知らせる。受け取り側（`Mirror`）に OSC 9;9 を足す。受け取りはどのプラットフォームでも行う（AC7 は限定していない。Linux は前面のプロセスの場所が優先される）。requirements の非機能要件の「OSC 7 の URL として符号化」はこの決定で読み替え、文面を直した。
- **影響**: OSC 7 の受け取りは今までどおり（自分で OSC 7 を出している利用者はそのまま）。
