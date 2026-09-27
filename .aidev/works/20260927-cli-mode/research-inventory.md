# 端末版（TUI）の機能一覧の下調べ（AC15 用）

- 対象 work: `.aidev/works/20260927-cli-mode`（requirements.md の AC15・F12）
- 調べたもの: herdr のソース（`scratchpad/herdr`、以下 `[H]` = `scratchpad/herdr/`、`[Hd]` = `scratchpad/herdr/docs/next/website/src/content/docs/`）、
  既存の対応表 `docs/herdr-parity.md`（以下 `[P]`）、Web 版 `packages/web/src`（以下 `[W]`）。
- 凡例: **対応** = Web 版・herdr と同じ機能を端末で持つ／**読み替え** = 目的を端末の流儀で満たす（どう読み替えるかを書く）／
  **非対応** = 端末では原理的に出来ない・意味が無い（理由）。**要判断** = design で決める余地が大きいもの（仮の分類を付けた）。
- 「サーバ機能」= 画面に依らずサーバ・`sodactl` にあるもの。端末版はそのまま恩恵を受ける（画面の入口があるものだけ端末版の作業になる）。

---

## 0. 先に伝えるべき発見（design に効くもの）

1. **Web 版の設定・既読はブラウザごと（localStorage）で、サーバに無い**。`soda.prefs.v1`（`[W]store/view.ts:56,66-81`）に
   通知・テーマ・表示・端末・キー・サイドバーの幅/折りたたみ・並び順・独自コマンドのキー等の全部、`soda.seen.v1`（`[W]store/seen.ts:6-21`）に
   `done` の既読。→ requirements の F7「既読が Web 版と同じ」・F9「通知の設定は Web 版と共有」・F11「設定は Web 版と共有」・AC13 は、
   **サーバ側に設定・既読の置き場を新設しない限り満たせない**（Web 版の挙動を変える＝AC19 との兼ね合い）。herdr は既読をサーバで持つ
   （`[H]src/server/headless.rs:859-861` `mark_active_tab_seen`）、キー設定はサーバの config.toml（`--remote-keybindings local|server`）。
2. **herdr の端末画面には狭い幅用の 1 列表示がある**（`ui.mobile_width_threshold` 既定 64 桁。`[H]src/main.rs:247-249`・`[H]src/config.rs:78`・
   `[H]src/client/shell/mobile.rs`・`[Hd]how-to-work.mdx:49-58`「The TUI adapts to narrow screens」）。requirements の対象外の例
   「モバイルの 1 列表示」は**端末でも出来る（herdr が持つ）**ので非対応にできない → 下表 X01 で「対応（読み替え）」。
3. **Web 版に無い herdr の操作**（端末版で herdr 同等を掲げるなら足す必要）:
   キー操作 `switch_workspace`（1..9）・`open_worktree`・`remove_worktree`（`[H]src/main.rs:154-155,171`、`[H]src/input/keybindings.rs:20-80`。Web の
   `ACTIONS` に無い＝`grep` で 0 件）、pane メニューの「focused pane と入れ替え」（`[H]src/client/shell/state.rs:519` `SwapWithFocusedPane`。
   `[W]components/ContextMenu.vue:52-59` に無い）、**tab のドラッグでの並べ替え**（`[H]src/client/shell/state.rs:205-209` `ClientChromeDrag::Tab`。
   Web の TabBar に pointer のドラッグ無し）、**サイドバーの spaces/agents の境界のドラッグ**（`sidebar_section_divider`。`[H]state.rs:85-140`）、
   tab バーの左右スクロールボタン（`tab_scroll_left/right`）、トーストのクリックで対象へ（`notification_toast`）。
   herdr の外側の端末向け設定（`mouse_capture`・`copy_on_select`・`host_cursor`・`redraw_on_focus_gained`・`mouse_scroll_lines`・`pane_scrollbars`・
   `confirm_close`・`prompt_new_tab_name`・`prompt_new_workspace_name`・`window_title`・`sidebar_collapsed_mode`・`sidebar_start_collapsed`）は Web に設定が無い。
4. **大きさの違うクライアントの見せ方**: Web は「サイズ権限が無ければ縦横比を保って縮小」（`[W]components/TerminalPane.vue:11`）。端末では縮小できない →
   herdr と同じ「左上を合わせて切り取り、余りは空白」に読み替える（herdr の根拠は §1-4）。
5. **端末版でのクリップボードの画像**: herdr も「手元のクライアントが OS のクリップボードを読める構成（`herdr --remote`）」でだけ行い、
   SSH で入った先で `herdr` を起動した構成では出来ないと明記（`[Hd]persistence-remote.mdx:91`・`[Hd]how-to-work.mdx:82,101`）。
6. **Windows ネイティブ**: Web 版のマシン集約の `bridge.sock` は Windows 非対応（`packages/server/src/machineSmoke.ts:193`）。端末版の「手元のサーバへ自動で繋ぐ」
   経路を Unix socket にするなら Windows は named pipe か localhost＋token ファイルが要る（herdr は Windows で named pipe 相当。`[H]src/server/autodetect.rs:50-56`）。

---

## 1. herdr の挙動（質問への回答）

### 1-1. 入れ子（herdr の中で herdr。H47）と tmux の中

- **入れ子**: herdr は pane の環境に `HERDR_ENV=1` を入れ（`[H]src/main.rs:3-4`・`[H]src/pane.rs:156`・`[H]src/pty/backend/unix.rs:77`）、引数なしの起動と隠しの `herdr client` の起動の前に
  `exit_if_nested_disabled` を呼ぶ（`[H]src/main.rs:564,786`）。`HERDR_ENV=1` かつ `[experimental] allow_nested = false`（既定）なら
  「error: nested herdr is disabled by default. see configuration if you want to enable it.」を出して終了コード 1（`[H]src/main.rs:444-470`、設定 `[H]src/main.rs:407-409`）。
  CLI のサブコマンド（`herdr pane ...` 等）は止めない（止めるのは TUI の起動だけ）。`allow_nested = true` なら入れ子の TUI を許す。
  → 端末版は「pane の中で引数なしの `soda` を起動したら既定で断る・設定で許す」が herdr 同等。Sodashitsu は既に pane に環境変数を配っている
  （20260926-agent-skill-file の「pane の中から sodactl を使うための環境変数」）ので、それを判定に使える。
- **tmux の中**: prefix の衝突への特別な処理は**無い**（herdr の既定 prefix も `ctrl+b`。「prefix-first なので tmux 等の入力を奪わない」とだけ書く
  `[Hd]configuration.mdx:145`）。利用者は tmux の `send-prefix`（`C-b C-b`）か prefix の変更で解く。`TMUX` 環境変数を見る箇所は次の 3 つだけ:
  1. 外側の端末へのデスクトップ通知（OSC 9/99）を `ESC P tmux; … ESC \`（中の ESC を二重化）で包む（`[H]src/terminal_notify.rs:46-50,95-106`）。
  2. 外側の端末の modifyOtherKeys を mode 2 とみなす（`[H]src/input/model.rs:285-310`）。
  3. 画像の高速経路（direct graphics＝ファイル渡し）を tmux・screen（`STY`）・SSH・remote のときは使わない（`[H]src/client/handshake.rs:58-86`）。
  通常の Kitty graphics の出力・OSC 52・BEL は tmux でも包まずに出す（`Ptmux` の使用は terminal_notify.rs だけ。`grep` で確認）。

### 1-2. 画像（Kitty graphics）とクリップボード

- **画像**: サーバが pane の Kitty graphics を解釈して保持し、**クライアントが外側の端末へ Kitty graphics protocol で出し直す**
  （送信 `a=t`・配置 `a=p`・消去 `a=d,d=i`、3072 バイトごとに分割、host 側の画像 id は 10000 から。`[H]src/kitty_graphics.rs:19-25`・
  `[H]src/kitty_graphics/surface.rs:318`）。既定で有効（`[terminal] kitty_graphics = true`）、外側の端末が対応していることが前提
  （`[Hd]configuration.mdx:513-526`「Herdr renders pane images by default in compatible outer terminals. Popups, menus, and notifications temporarily hide only the image placements they overlap」）。
  ファイル渡しの高速経路は Ghostty・kitty・WezTerm の手元の端末だけ（`[H]src/client/handshake.rs:58-70`）。セルの画素の大きさは ioctl（TIOCGWINSZ の画素）から
  求める（`[H]src/client/terminal_geometry.rs:14-42`）。Windows は「端末次第」（`[Hd]windows-beta.mdx:67,85`）。
- **クリップボード（書き込み）**: pane のアプリの OSC 52 は、サーバが**前面のクライアントにだけ**転送し（`[H]src/server/headless/notifications.rs:345-349`）、
  クライアントは SSH・VS Code の端末・WSL なら OSC 52（`ESC ] 52 ; c ; <base64> BEL`、BEL 終端）を外側の端末へ出し、そうでなければ OS の道具
  （`wl-copy` 等）で直接書く（`[H]src/selection.rs:299-367`、転送 `[H]src/client/clipboard_forwarding.rs:1-16`）。マウスの選択・copy モードのコピーも同じ経路。
- **クリップボード（画像の読み取り）**: クライアントが OS の道具で読む（Linux は `wl-paste`/`xclip`。`[H]src/platform/linux.rs:805-835`、Windows `[H]src/platform/windows.rs:2332`）→
  サーバへ送ってパスを貼る。**`herdr --remote` のときだけ**（`remote_image_paste` の注記 `[H]src/main.rs:163`）。SSH で入った先の `herdr` では不可（`[Hd]persistence-remote.mdx:91`）。

### 1-3. 外側の端末への通知

- 設定 `[ui.toast] delivery = off|herdr|terminal|system`（既定 off。`[H]src/main.rs:363-368`・`[Hd]configuration.mdx:470-486`）。前面の tab の分は出さない。
  - `herdr`: 画面内のトースト（位置 `ui.toast.herdr.position`）。
  - `terminal`: 外側の端末へ OSC を出す。**端末の判別で出し分け**: Ghostty・iTerm2・WezTerm → **OSC 9**（`ESC ] 9 ; title: body ESC \`）、kitty → **OSC 99**
    （`ESC ] 99 ; i=1:d=0 ; title ESC \` ＋ `ESC ] 99 ; i=1:p=body ; body ESC \`）。判別できない端末（Windows Terminal・gnome-terminal・VS Code 等）では**何も出さない**。
    **OSC 777 は使わない**。tmux の中は DCS で包む（`[H]src/terminal_notify.rs:1-106`）。判別は `TERM_PROGRAM`・`TERM`・`KITTY_WINDOW_ID`。
  - `system`: クライアントの機械の OS 通知（Linux `notify-send` `[H]src/platform/linux.rs:891-910`、macOS `terminal-notifier`→`osascript`、Windows トースト）。
  経路はクライアント側 `[H]src/client/notifications.rs:9-80`。
- **音**: クライアントの機械で mp3 を外部プレイヤーで鳴らす（macOS `afplay`、Windows MediaPlayer、Linux `paplay`/`pw-play`/`ffplay`/`mpg123`/`mpv`。
  `[H]src/sound.rs:4,309-320`）。`[ui.sound]` の `path`/`done_path`/`request_path`・エージェントごとの on/off（`[Hd]configuration.mdx:488-505`）。
- **ベル**: pane の BEL（0x07）を数えてサーバが**前面のクライアントにだけ** `TerminalBell{count}` を送り、クライアントが外側の端末へ同じ数の BEL を書く
  （`[H]src/pane.rs:1943-1950`・`[H]src/server/headless/notifications.rs:338-344`・`[H]src/client/mod.rs:1439-1444`・`[H]src/terminal_effects.rs:5-12`）。
  **エージェントの通知そのものは BEL を鳴らさない**（BEL は pane のアプリが出したものの素通しだけ）。
- 外側の端末のフォーカス（focus 報告）を前面クライアントから受け、フォーカスがあれば前面 tab を既読にし通知を抑える（`[H]src/server/headless.rs:897-907,859-861`）。

### 1-4. クライアントの大きさと pane の大きさ

- 各クライアントは自分の端末の大きさで**自分の画面（サイドバー・tab バー・pane の枠）を別々に組んで描く**（サーバがクライアントごとに描画。
  `[H]src/server/headless/render.rs:405-470`）。
- pane（PTY）の大きさは tab ごとに「その tab を最後にフォーカス・選択・操作したクライアント」（`tab_geometry_controllers`）の配置で決める
  （`[H]src/server/headless/render.rs:405-440`、`[Hd]concepts.mdx:73`・`[Hd]configuration.mdx:65`）。1 台だけになれば全 tab がその大きさへ。誰もいなければ
  PTY は最後の大きさ、新しい配置は `headless_cols/rows`（既定 120×40）。
- 制御していないクライアントの側で pane の枠と pane の中身の大きさが違うとき: 中身は**枠の左上に合わせ、枠に収まる分だけ描いて切り取る**
  （行は `while y < area.height`、列は `while x < area.width`。`[H]src/pane/terminal.rs:2312-2364`）。枠の方が大きければ残りは描かない（空白）。
  縮小・スクロールでの追いかけは無い。

### 1-5. 切り離し・再接続のモデル

- 引数なしの `herdr` は: client socket に繋げるか確かめ → 無ければ**サーバを裏で起動**（`herdr server`、最大 15 秒待つ）→ クライアントとして接続
  （`[H]src/server/autodetect.rs:1-6,18-23`、呼び出し `[H]src/main.rs:785-795`）。起動した場所を `HERDR_STARTUP_CWD` で最初の workspace に渡す（同 :29）。
- 接続は **Unix domain socket（権限 0600）**。JSON の API socket（`herdr.sock`）と、画面用のバイナリプロトコルの client socket（`herdr-client.sock`）の 2 本。
  名前付き session はそれぞれ別の socket（`[H]src/server/socket_paths.rs:4-73`）。Windows は named pipe 系（`[H]src/server/autodetect.rs:50-56,95-120`）。
  認証は socket の権限だけ（token 無し）。
- `prefix+q`（`detach`）でクライアントだけ終わり、サーバと pane は動き続ける。`herdr server stop` で止める（`[Hd]concepts.mdx:75-81`）。
  `herdr --remote <ssh先>` は手元の TUI を SSH 越しにリモートのサーバへ繋ぐ（`[H]src/main.rs:775-783`）。

---

## 2. Web 版の操作 id の全一覧（端末版は全部を実装する）

出典: `[W]keys/bindings.ts` の `ACTIONS`（行番号は各定義の `defaults` 行）、`[W]keys/actions.ts:52-86` の `Action` 型。**計 51 個**（`switch_tab`・`focus_agent` は 1..9 の添字付き）。

| # | id | 既定 | 行 |
|---|---|---|---|
| 1 | help | prefix+? | bindings.ts:38 |
| 2 | detach | prefix+q | :45 |
| 3 | settings | prefix+s | :52 |
| 4 | open_notification_target | prefix+o | :59 |
| 5 | reload_config | prefix+shift+r | :68 |
| 6 | workspace_picker（navigate モード） | prefix+w | :76 |
| 7 | goto | prefix+g | :83 |
| 8 | new_workspace | prefix+shift+n | :90 |
| 9 | rename_workspace | prefix+shift+w | :97 |
| 10 | close_workspace | prefix+shift+d | :104 |
| 11 | new_worktree | prefix+shift+g | :112 |
| 12 | new_tab | prefix+c | :119 |
| 13 | next_tab | prefix+n | :126 |
| 14 | previous_tab | prefix+p | :133 |
| 15 | switch_tab（1..9） | prefix+1..9 | :140 |
| 16 | rename_tab | prefix+shift+t | :148 |
| 17 | close_tab | prefix+shift+x | :155 |
| 18 | previous_workspace | なし | :164 |
| 19 | next_workspace | なし | :171 |
| 20 | move_tab_previous | なし | :178 |
| 21 | move_tab_next | なし | :185 |
| 22 | move_workspace_previous | なし | :193 |
| 23 | move_workspace_next | なし | :200 |
| 24 | previous_agent | なし | :207 |
| 25 | next_agent | なし | :214 |
| 26 | focus_agent（1..9） | なし | :221 |
| 27 | split_vertical | prefix+v | :230 |
| 28 | split_horizontal | prefix+- | :237 |
| 29-32 | focus_pane_left / down / up / right | prefix+h/j/k/l | :244-265 |
| 33-36 | swap_pane_left / down / up / right | prefix+shift+h/j/k/l | :272-296 |
| 37 | cycle_pane_next | prefix+tab | :304 |
| 38 | cycle_pane_previous | prefix+shift+tab | :311 |
| 39 | close_pane | prefix+x | :318 |
| 40 | zoom | prefix+z | :325 |
| 41 | resize_mode | prefix+r | :332 |
| 42 | rename_pane | prefix+shift+p | :339 |
| 43 | copy_mode | prefix+[ | :346 |
| 44 | edit_scrollback | prefix+e | :354 |
| 45 | toggle_sidebar | prefix+b | :361 |
| 46 | remote_image_paste | ctrl+v（直接のキー） | :371 |
| 47 | last_pane | なし | :380 |
| 48-51 | resize_pane_left / down / up / right | なし | :387-408 |

- **navigate モードのキー**（別の表。`[W]keys/navigateKeys.ts:30-68`）: `navigate_workspace_up`(up)・`navigate_workspace_down`(down)・
  `navigate_pane_left`(h)・`navigate_pane_down`(j)・`navigate_pane_up`(k)・`navigate_pane_right`(l)・`navigate_open_menu`(space。Web の拡張)。
  固定: Enter＝開く・Esc＝戻る・←/→＝左右の pane（`[W]keys/NavigateMode.ts:33-37`）。
- **独自コマンド**: `command:<id>`（サーバの `commands.json` の数だけ。`[W]keys/commandKeys.ts:5-24`）。種類 popup / pane / shell。
- **モード内の固定キー**: resize モード h/j/k/l・矢印・Esc/Enter/r（`[W]keys/ResizeMode.ts:15-29`）、copy モード h/j/k/l・w/b/e・W/B/E・{/}・PageUp/Down・
  ctrl+f/u/d・`/`・`?`・n/N・v/Space・V・y/Enter・q/Esc・Backspace（`[W]keys/CopyMode.ts:37-116`）、prefix の後の prefix（`Ctrl+B Ctrl+B` で `\x02` を送る。`[W]keys/actions.ts:31`）。
- **プリセット**: `herdr-ctrl-alt`・`tmux`（`[W]keys/presets.ts:23-45`）。
- **herdr にあって Web に無い操作 id**（端末版で herdr 同等にするなら追加。§0-3）: `switch_workspace`（1..9）・`open_worktree`・`remove_worktree`。
  herdr の `OpenNavigator`＝`goto`、`EnterResizeMode`＝`resize_mode`（`[H]src/input/keybindings.rs:20-76`）。

---

## 3. 機能一覧と端末版での扱い

### 3-1. herdr の機能（`[P]` の H01〜H49 ＋ 今回見つけた herdr の TUI の項目）

| ID | 機能 | herdr | Web版 | 端末版での扱い | 根拠 |
|---|---|---|---|---|---|
| H01 | workspace の作成・名前変更・切替・閉じる（確認） | あり | あり | 対応 | [P]H01 |
| H01b | workspace の自動の名前（最初の pane の場所に追従） | あり | あり（サーバ） | 対応（サーバが決める名前を描くだけ） | [P]H01b |
| H02 | tab の作成・名前変更・切替・閉じる | あり | あり | 対応 | [P]H02 |
| H03 | pane の分割・閉じる・フォーカス移動・巡回・入れ替え・拡大・resize モード・名前変更 | あり | あり | 対応 | [P]H03 |
| H04 | tab・workspace の並べ替え（キー） | あり | あり | 対応（`move_tab_*`・`move_workspace_*`） | [P]H04 |
| H04m | tab をドラッグで並べ替え | あり | **無し** | 対応（herdr 同等。Web に無い＝§0-3） | [H]src/client/shell/state.rs:205-209 |
| H04w | workspace をサイドバーでドラッグして並べ替え | あり | あり（D&D・グループ一括） | 対応 | [H]state.rs:210-213・[W]components/Sidebar.vue:285-358 |
| H05 | 端末としての pane（全画面 TUI・色・マウス報告・ブラケットペースト） | あり | あり | 対応（端末版に端末エミュレータを持ち、外側の端末へ描き直す。256色/TrueColor は外側の端末の対応次第で落とす） | [P]H05・AC6 |
| H06 | scrollback・ホイール・スクロールバー | あり（10MB・`mouse_scroll_lines`・`pane_scrollbars`） | あり | 対応（スクロールバーは 1 桁の列で描きドラッグ可） | [H]src/main.rs:276,300・state.rs:221-226 |
| H07 | copy モード | あり | あり | 対応 | [Hd]keyboard.mdx:85 |
| H08 | マウスの選択とコピー・ダブルクリックの単語選択・貼り付け | あり | あり | 対応（コピーは OSC 52 か OS の道具。§1-2） | [Hd]quick-start.mdx:20・[H]src/selection.rs:356-367 |
| H08b | `copy_on_select` を切る設定・コピーのトースト | あり | コピーのトーストのみ | 対応（トースト）／設定は要判断（Web に無い） | [H]src/main.rs:255-259・[W]term/MouseBridge.ts:144-149 |
| H09 | リンクを開く（Ctrl+クリック・OSC 8・URL） | あり | あり | 読み替え: 手元の端末版なら OS の既定のブラウザを起動（`xdg-open`/`start`）。SSH 先では OSC 8 のリンクとして外側の端末へ任せる（herdr は `OpenSafeWebUrl`） | [Hd]quick-start.mdx:22・[H]state.rs:246 |
| H10 | 右クリックのメニュー・アプリへの受け渡し（修飾キー／pane ごと） | あり | あり | 対応 | [Hd]quick-start.mdx:24・[H]state.rs:510-526 |
| H10b | pane メニューの「focused pane と入れ替え」 | あり | **無し** | 対応（herdr 同等。§0-3） | [H]state.rs:519 |
| H11 | scrollback を `$EDITOR` で開く | あり | あり（サーバの EDITOR を新しい pane で） | 対応（Web と同じくサーバ側の pane で開く） | [P]H11 |
| H12 | 独自コマンド（popup / pane / shell） | あり | あり | 対応（popup は端末の上に浮いた枠で描く） | [H]src/main.rs:201-213・[W]components/CommandPopup.vue |
| H13 | 端末内の画像（Kitty graphics） | あり（外側の端末へ Kitty で出し直す） | 一部対応（サーバで iTerm2 形式へ） | 読み替え: 外側の端末が Kitty graphics に対応していれば（kitty・Ghostty・WezTerm）Kitty で出し直す。非対応の端末・tmux の中では出さない（herdr と同じ条件） | §1-2・[P]H13 |
| H14 | 端末タイトルの取得と外側の端末のタイトル（`window_title`） | あり | 読み替え（ブラウザのタブ名） | 対応（OSC 0/2 で外側の端末のタイトルを書く。herdr の `window_title` 相当） | [H]src/main.rs:320-327・[W]serverSession/documentTitle.ts |
| H15 | CJK IME の候補窓・prefix 中の IME 切替 | あり（macOS/Windows・実験的） | IME 入力のみ | 読み替え: IME は外側の端末が担う（端末版は確定文字を受けるだけ）。候補窓の位置はカーソルを pane のカーソル位置へ置けば外側の端末が合わせる。IME の自動切替は非対応（OS の入力ソース API。Linux は herdr も非対応） | [H]src/main.rs:412-432 |
| H16 | エージェントの検出・5 状態・集約・`done` の既読 | あり（既読はサーバ） | あり（**既読はブラウザごと**） | 対応。ただし既読の共有は要判断（§0-1） | [W]store/seen.ts:6-21・[H]src/server/headless.rs:859-861 |
| H17-18 | 検出の拡充・連携の導入 | あり | 後続／一部 | サーバ機能（端末版の作業なし）。設定の「エージェント連携」節は H25 で扱う | [P]H17,H18 |
| H19 | サイドバー（spaces・agents）・折りたたみ・ソート・幅 | あり | あり | 対応（幅はドラッグと設定。折りたたみは `compact`/`hidden`） | [H]src/main.rs:236-245 |
| H19b | spaces/agents の境界のドラッグ | あり | **無し** | 対応（herdr 同等。§0-3） | [H]state.rs:85-140 `sidebar_section_divider` |
| H19c | サイドバー・ヘルプの一覧のスクロールバー | あり | あり（ブラウザのスクロール） | 対応 | [H]state.rs:190-204 |
| H20 | Space 行の Git ブランチ・ahead/behind | あり | あり | 対応 | [P]H20 |
| H21 | サイドバーの行の並び・色の条件・独自トークン | あり | あり | 対応（色は外側の端末の色数へ落とす） | [P]H21 |
| H22 | tab バーの位置・右端の状態・1 個なら隠す | あり | あり | 対応 | [P]H22 |
| H22b | tab バーの左右スクロール（あふれたとき）・＋ボタン・ホイールで切替 | あり | ＋・ホイールあり | 対応 | [H]state.rs `tab_scroll_left/right`・[W]components/TabBar.vue:136-169 |
| H23 | pane の枠・隙間・描画モード・外周・エージェント名 | あり | あり | 読み替え: 太さの 3 段階は無意味（セル単位）→ 枠の有無・隙間の有無だけ。太さの設定は端末版では効かない旨を表示 | [P]H23・[H]src/main.rs:288-306 |
| H23b | 状態を記号にする | あり | あり | 対応（字形 × ◐ ✓ ○ · は外側の端末のフォント次第） | [P]H23b |
| H24 | テーマ（組み込み・明暗自動） | あり（画面の枠だけ。pane の中は外側の端末の色） | あり（端末の配色も） | 読み替え: 画面の枠はテーマの色で描く。pane の既定の色は要判断（Web と同じくテーマの配色で塗る／herdr と同じく外側の端末の色に任せる）。明暗は外側の端末へ OSC 11・`CSI ?996n`・mode 2031 で問い合わせて追従 | [H]src/terminal_theme.rs:14-61 |
| H24b | 色の個別の上書き | あり | あり（CSS 変数 19 個） | 読み替え（同じ 19 個を端末の色へ写す） | [P]H24b |
| H25 | 設定画面（`prefix+s`） | あり（Theme・Indicators・Sound・Toast・Integrations） | あり（通知・テーマ・表示・端末・エージェント連携・キー） | 対応（端末の中の設定の枠。**Web と共有するにはサーバ保存が要る**§0-1） | [H]state.rs:383-397・[W]components/SettingsDialog.vue:528-877・KeySettings.vue:503 |
| H25b | 設定の再読み込み・onboarding | あり | あり | 対応 | [P]H25b・[H]src/ui/onboarding.rs |
| H26 | キーの変更・直接のキー | あり（config.toml） | あり（設定画面・**ブラウザごと**） | 対応（設定の置き場所は §0-1） | [P]H26 |
| H26b | プリセット | 無し | あり（herdr-ctrl-alt・tmux） | 対応 | [W]keys/presets.ts |
| H26c | navigate モードの移動キー | あり | あり | 対応 | [W]keys/navigateKeys.ts |
| H26d | previous/next_workspace・last_pane・move_tab_*・resize_pane_*・agent 系 | あり | あり | 対応 | [P]H26d |
| H26e | `switch_workspace`（1..9）・`open_worktree`・`remove_worktree` のキー | あり | **無し** | 対応（herdr 同等。Web にも足すかは要判断） | [H]src/main.rs:154-155,171 |
| H26f | 直接のキーが外側の端末に届くか（Kitty keyboard・modifyOtherKeys） | あり | 別問題（ブラウザ） | 対応（外側の端末へ Kitty keyboard protocol／modifyOtherKeys を要求して修飾キーを区別。届かない組合せは説明） | [H]src/input/model.rs:280-320・[Hd]keyboard.mdx:100-132 |
| H27 | ヘルプ（`prefix+?`）と絞り込み | あり | あり | 対応 | [Hd]keyboard.mdx:17 |
| H27b | 名前の入力欄の編集キー（Ctrl+A/E/U/K/W/Y・Alt+B/F/D） | あり | ブラウザの input | 対応（端末版の入力欄に herdr と同じ編集キー） | [Hd]keyboard.mdx:64-81 |
| H28 | navigate（`prefix+w`）と goto（`prefix+g`） | あり | あり | 対応 | [P]H28 |
| H29 | 通知（画面内・OS 通知・音・`prefix+o`） | あり | あり | 読み替え: 画面内のトースト＝対応。「OS 通知」は外側の端末への OSC 9（Ghostty/iTerm2/WezTerm）・OSC 99（kitty）＋必要なら OSC 777（herdr は未使用）に読み替え、手元の端末版なら OS の通知（`notify-send` 等）も選べる。音は §H29b | §1-3 |
| H29b | 通知音の差し替え・エージェントごとの音・外側端末への委譲 | あり | 非対応（内蔵音のみ） | 読み替え: 端末版はベル（BEL）で鳴らす（外側の端末の音）。手元の端末版は OS のプレイヤーで鳴らすことも可（herdr 同等）。SSH 先では BEL だけ | §1-3 |
| H29c | トーストをクリックして対象へ | あり | あり（「移動」ボタン） | 対応 | [H]state.rs `notification_toast`・[W]notify/NotificationController.ts:198 |
| H29d | pane の BEL を外側の端末へ | あり（前面のクライアントへ） | —（ブラウザに無い） | 対応（前面の端末版へ BEL を素通し） | §1-3 |
| H30 | 切り離し（`prefix+q`）と再接続 | あり | 読み替え（ブラウザの接続だけ） | 対応（herdr と同じ意味。端末版が終わる。再び `soda` で戻る） | [P]H30・[Hd]concepts.mdx:75 |
| H31 | サーバ再起動後の復元 | あり | あり | サーバ機能 | [P]H31 |
| H32/H32b | 画面履歴・会話の再開・live handoff | あり | あり | サーバ機能（handoff 中の端末版の再接続は design） | [P]H32 |
| H33 | 名前付き session（`--session`・`session attach`） | あり | あり（切替は新しいブラウザのタブ） | 読み替え: `soda --session <名前>` で繋ぐ。画面からの切替は「今の端末版を繋ぎ直す」 | [P]H33・[W]components/SessionSwitchDialog.vue |
| H34 | 複数クライアントの同時接続・大きさの決め方 | あり（tab ごとに最後の操作者） | あり（最後の操作者。サイズ権限が無い側は縮小表示） | 読み替え: 決め方は同じ。権限の無い側は縮小できないので herdr と同じ「左上合わせ・切り取り・余白」 | §1-4・[W]components/TerminalPane.vue:11 |
| H35 | 狭い画面の 1 列表示と移動用メニュー | **あり**（`mobile_width_threshold` 64 桁） | あり（ブラウザの幅） | 対応（読み替え: 端末の桁数が閾値以下で 1 列表示と切替メニュー。タッチ用の追加キー列は X03） | §0-2 |
| H36 | 新規 pane の既定シェル | あり | あり（`--shell`） | サーバ機能 | [P]H36 |
| H36b | 新しく開く場所の方針 | あり | あり（ブラウザごと） | 対応（設定の置き場所は §0-1） | [P]H36b |
| H37/H37b | worktree の作成・一覧・削除・グループ化 | あり | あり | 対応 | [P]H37,H37b |
| H38-40 | CLI / socket API・自動化・pane 単体接続 | あり | あり（`sodactl`） | サーバ機能（端末版の作業なし。`sodactl pane attach` は端末処理の先例） | [P]H38-H40 |
| H41 | pane の移動（別 tab・別 workspace） | API あり | あり（D&D） | 対応（W03） | [P]H41 |
| H42 | プラグイン | あり | 後続 | 対象外のまま（Web と同じ） | [P]H42 |
| H43 | 保存済みマシンの集約 | あり | あり | 対応（サイドバーのマシン見出し・折りたたみ〔M10〕） | [P]H43 |
| H43b | `--remote <ssh先>`（手元の TUI をリモートのサーバへ） | あり | 無し（マシンの集約で代替） | 要判断（仮: 読み替え＝手元の端末版＋`soda machine` の集約で同じ目的を満たす） | [H]src/main.rs:775-783 |
| H44 | クリップボードの画像の貼り付け | あり（`--remote` のみ） | あり | 読み替え: 端末版がサーバと同じ機械、または手元の端末版からマシンへ繋ぐ構成 → 手元の OS の道具（`wl-paste`/`xclip`/PowerShell）で読んで `pane.image.*` で送る。**SSH 先で端末版を起動した構成は非対応**（外側の端末からクリップボードの画像を読む標準の手段が無い。herdr も不可）。画像ファイルのドロップ（Windows Terminal がパスを貼る）は herdr 同等に転送 | §1-2・[Hd]windows-beta.mdx:72 |
| H45-46 | 自己更新・補完・ログ | あり | 後続 | 対象外のまま | [P]H45 |
| H47 | 入れ子の許可 | あり（既定で拒否・設定で許可） | 非対応（ブラウザ） | 対応（pane の中の `soda` を既定で拒否・設定で許可） | §1-1 |
| H48 | 外側の端末固有の設定（`host_cursor`・`redraw_on_focus_gained`・`mouse_capture`） | あり | 非対応 | 対応（端末版では意味がある。`mouse_capture=false` で外側の端末に通常のクリックを任せる等） | [H]src/main.rs:250-273 |
| H49 | Windows ネイティブ | あり（一部） | あり | 対応（ConPTY の中の外側の端末＝Windows Terminal 等。Kitty graphics は端末次第） | [Hd]windows-beta.mdx |
| H50 | 閉じる確認・新規 tab/workspace の名前を先に聞く（`confirm_close`・`prompt_new_*`） | あり（設定可） | 確認あり・設定無し | 対応（確認）。設定化は要判断 | [H]src/main.rs:277-286 |
| H51 | 全体のメニュー（settings・keybinds・reload config・what's new・detach） | あり | あり（サイドバーの「メニュー」） | 対応（what's new は H45 と同じく対象外） | [H]src/client/shell/global_menu.rs:22-50・[W]components/ContextMenu.vue:112-115 |
| H52 | 外側の端末のフォーカスで既読・通知の抑止 | あり（focus 報告 `?1004`） | ブラウザの可視状態 | 対応（外側の端末へ focus 報告を要求） | [H]src/server/headless.rs:897-907 |

### 3-2. herdr のマウス操作（`.aidev/works/20260918-web-terminal-multiplexer/research.md:102-112` の M1〜M11）

| ID | 機能 | herdr | Web版 | 端末版での扱い | 根拠 |
|---|---|---|---|---|---|
| M1 | pane・tab・workspace・エージェントをクリックでフォーカス | あり | あり | 対応（外側の端末の SGR マウス報告 `?1006`） | [Hd]quick-start.mdx:20 |
| M2 | 分割の境界をドラッグでリサイズ | あり | あり | 対応（ボタン押下中の移動報告 `?1002`） | [H]state.rs:214-220 |
| M3 | 右クリックのメニュー | あり | あり | 対応 | [H]state.rs:510-526 |
| M4 | ドラッグで選択→離すとコピー | あり | あり | 対応 | §1-2 |
| M5 | ダブルクリックで単語選択・押したままで単語単位に広げる | あり | あり | 対応（ダブルクリックは端末版が時刻で判定） | [Hd]quick-start.mdx:20 |
| M6 | Ctrl+クリックでリンク・Ctrl を押しながら重ねると下線 | あり | あり | 対応（下線は全ボタン移動報告 `?1003` が要る。届かない端末では下線無し） | [Hd]quick-start.mdx:22 |
| M7 | 右クリックを pane のアプリへ（修飾キー／pane ごと／枠で戻る） | あり | あり | 対応 | [Hd]quick-start.mdx:24 |
| M8 | ホイールでスクロール（3 行） | あり | あり | 対応（アプリがマウスを求めていればアプリへ） | [H]src/main.rs:274-276 |
| M9 | pane 横のスクロールバー | あり | あり | 対応 | [H]state.rs:221-226 |
| M10 | サイドバーのマシンを畳む・広げる | あり | あり | 対応 | [W]components/MachineHeader.vue:81 |
| M11 | 端末アプリへのマウス入力の受け渡し・Shift+クリックで選択 | あり | あり | 対応（Shift+マウスは外側の端末が奪うことが多い。herdr も Shift を修飾に使わない `[H]src/main.rs:266-268`） | [P] 未検証の項 |
| M12 | tab のドラッグで並べ替え | あり | 無し | 対応（H04m） | [H]state.rs:205-209 |
| M13 | サイドバーの幅・区画の境界のドラッグ | あり | 幅のみ | 対応（H19・H19b） | [H]state.rs:188-189 |
| M14 | ＋（新規 workspace・新規 tab）・サイドバーの開閉・並び順の切替のボタン | あり | あり | 対応 | [H]state.rs `new_workspace`・`new_tab`・`sidebar_toggle`・`agent_sort_toggle`・[W]Sidebar.vue:461,532,549,575 |

### 3-3. Web 版だけの拡張（herdr に無いもの）

| ID | 機能 | herdr | Web版 | 端末版での扱い | 根拠 |
|---|---|---|---|---|---|
| W01 | pane の名前ラベルのドラッグ：縁へ落とすと分割・中央で分割解除（置き換え） | 無し | あり | 対応（マウスのドラッグで同じ。落とし先の強調をセルで描く） | [W]components/PaneFrame.vue:320・term/paneDragZone.ts・[P]H41 |
| W02 | pane のドラッグで同じ tab 内の入れ替え | 無し（キー・メニューのみ） | あり（W01 に統合） | 対応 | [P]H41 |
| W03 | pane を tab バーの tab・サイドバーの workspace 行へドラッグで移動 | 無し（API のみ） | あり | 対応 | .aidev/works/20260924-pane-move-cross-tab/requirements.md |
| W04 | workspace の手動グループ（作成・追加・外す・名前・削除）と worktree の自動グループの折りたたみ | 自動のみ | あり | 対応 | [W]components/ContextMenu.vue:90-101・GroupPickerDialog.vue |
| W05 | workspace の並び順の切替（開いた順／名前順）・エージェントの並び順 | エージェントのみ | あり | 対応 | [W]components/Sidebar.vue:461,549 |
| W06 | サイドバーの行をキーで選んでメニューを開く（`navigate_open_menu`=space） | 無し | あり | 対応 | [W]keys/navigateKeys.ts:66-68 |
| W07 | pane メニューの「貼り付け」「名前の消去」 | 名前の消去のみ | あり | 対応（貼り付けは OS のクリップボードを読める構成だけ。SSH 先では外側の端末の貼り付け＝ブラケットペーストに任せる） | [W]components/ContextMenu.vue:53,58 |
| W08 | キー設定の画面（押したキーを取り込む・衝突の表示・既定へ戻す） | 無し（config.toml） | あり | 対応（外側の端末が送らない組合せは取り込めない旨を表示） | [W]components/KeySettings.vue |
| W09 | プリセット（tmux 風 等） | 無し | あり | 対応 | [W]keys/presets.ts |
| W10 | 全画面のときのブラウザ予約キーの取り込み（Keyboard Lock） | 無し | あり | 非対応（ブラウザの API。端末では外側の端末・OS の予約キーを取り戻す手段が無い） | [W]keys/KeyboardLockController.ts |
| W11 | サイドバーの行の見た目の設定画面（トークンの並び・色） | config のみ | あり | 対応 | [W]components/SidebarRowsSettings.vue |
| W12 | 色の個別の上書きの設定画面 | config のみ | あり | 対応（色の入力は #RRGGBB の文字入力） | [W]components/SettingsDialog.vue:622 |
| W13 | ログイン画面（token）・Origin の検査 | 無し（socket の権限） | あり | 読み替え: 手元のサーバへは token を毎回入れない方式（design）。リモートは `sodactl login` と同じ token | [W]components/LoginView.vue・packages/cli/src/httpAuth.ts |
| W14 | 再接続中の表示と自動の再接続・切り離し後の画面 | 無し | あり | 対応（再接続中は画面に表示し入力を止める。切り離し＝終了なので切り離し後の画面は不要） | [W]components/ReconnectOverlay.vue・DetachedView.vue |
| W15 | session の一覧と切替の画面 | CLI のみ | あり | 読み替え（H33） | [W]components/SessionSwitchDialog.vue |
| W16 | 1 列表示のモバイルの追加キー列（Esc・Tab・Ctrl・Alt・矢印・PgUp/Dn・Prefix） | 無し | あり | 非対応（ソフトキーボードの補助はスマホの SSH アプリ側が持つ〔Termux・moshi 等〕。端末版は 1 列表示〔H35〕まで） | [W]mobile/ExtraKeys.vue |
| W17 | タッチのスクロール・「この端末に合わせる」（縮小表示↔等倍） | 無し | あり | 非対応（タッチ・縮小表示はブラウザだけ。端末では H34 の切り取り） | [W]mobile/TouchScroll.ts・MobileShell.vue:82 |
| W18 | PWA・ブラウザの OS 通知の許可の案内 | 無し | あり | 非対応（ブラウザの API。端末では H29 の外側の端末への通知） | [W]notify/DesktopNotifier.ts・NotificationController.ts:344 |
| W19 | 通知音を内蔵音（OscillatorNode）で鳴らす | mp3 | あり | 読み替え（BEL／手元なら OS のプレイヤー。H29b） | [W]notify/ToneSound.ts |
| W20 | 明暗の変化を pane のアプリへ知らせる（DSR 996/mode 2031） | あり（host の明暗） | あり | 対応（外側の端末の明暗を問い合わせてサーバへ伝える） | [H]src/terminal_theme.rs:57-61・.aidev/works/20260924-dark-mode-report |
| W21 | 端末アプリの問い合わせへの応答をサーバだけにする（QueryFilter） | —（サーバが応答） | あり | 対応（端末版の中の端末エミュレータも応答しない。**外側の端末への問い合わせ〔色・大きさ〕は端末版自身のものだけ**） | [W]term/QueryFilter.ts |
| W22 | 描画の WebGL・描画器の使い回し | 無し | あり | 非対応（ブラウザの描画の仕組み。端末版は差分の書き出しで同じ目的〔大量出力でも固まらない〕を満たす） | [W]term/RendererPool.ts |
| W23 | ブラウザのタブのタイトル（ホスト名・session・workspace） | window_title | あり | 読み替え（H14。OSC 2） | [W]serverSession/documentTitle.ts |
| W24 | tab バーの右端の日時・ホスト名・固定文字列 | あり（command も） | あり（command 無し） | 対応（Web と同じ種類） | [P]H22 |
| W25 | 設定の「エージェント連携」（導入・再開の入切） | Integrations 節 | あり | 対応 | [W]components/SettingsDialog.vue:877 |
| W26 | onboarding の画面 | あり | あり | 対応 | [W]components/OnboardingDialog.vue |
| W27 | マシンの切替（1 本の接続の行き先を替える）とマシンの要約の購読 | endpoint catalog | あり | 対応（端末版も同じ部品を使う） | [W]actions/MachineSwitcher.ts・net/MachineSummaryClient.ts |
| W28 | 画像の貼り付けの送信中に打ったキーの保留 | — | あり | 対応（H44 の構成に限る） | [W]term/ImagePaster.ts |
| W29 | 設定・既読をブラウザごとに覚える | サーバ／config | あり | 要判断（§0-1。端末版と共有するならサーバへ移す） | [W]store/view.ts:56 |

### 3-4. 端末版で新たに要る「外側の端末」との取り決め（herdr の実装に倣う。一覧の検証のための補足）

| ID | 事項 | herdr | 端末版での扱い | 根拠 |
|---|---|---|---|---|
| X01 | 代替画面・raw モード・終了時の復元 | あり | 対応（`sodactl pane attach` の先例あり） | [P]H40 |
| X02 | マウス報告の要求（`?1000/1002/1003/1006`）と `mouse_capture=false` | あり | 対応 | [H]src/main.rs:250-254 |
| X03 | ブラケットペースト（外側→pane） | あり | 対応 | AC6 |
| X04 | focus 報告（`?1004`） | あり | 対応（H52） | [H]src/server/headless.rs:897 |
| X05 | キーの区別（Kitty keyboard・modifyOtherKeys。tmux の中は mode 2） | あり | 対応（H26f） | [H]src/input/model.rs:285-310 |
| X06 | 外側の端末の既定色・明暗の問い合わせ（OSC 10/11・`?996n`・`?2031h`） | あり | 対応（H24・W20） | [H]src/terminal_theme.rs:57-61 |
| X07 | カーソルの描き方（外側のカーソル／自前で描く。WSL・Windows で ConPTY のちらつき対策） | あり | 対応 | [H]src/main.rs:260-264 |
| X08 | tmux の中：通知を DCS で包む・画像の高速経路を使わない・prefix の衝突は利用者が解く | あり | 対応（同じ扱い。docs に tmux の `send-prefix` か prefix の変更を書く） | §1-1 |
| X09 | 入れ子の拒否（環境変数で判定） | あり | 対応（H47） | §1-1 |
| X10 | 大きさの変化（SIGWINCH／Windows のイベント）とセルの画素の大きさ | あり | 対応 | [H]src/client/terminal_geometry.rs:14-42 |
