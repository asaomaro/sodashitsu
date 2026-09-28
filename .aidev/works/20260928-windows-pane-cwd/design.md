# 仕様: Windows で pane の場所（cwd）が `cd` に追従する

## 概要

Windows ネイティブで対話の pane のシェル（PowerShell 5.1・7、cmd）を起動するとき、プロンプトのたびに今の場所を **OSC 9;9**（Windows Terminal の場所の知らせ。中身は Windows のパスそのもの）で知らせる設定を差し込む。
受け取る側は `Mirror` に OSC 9;9 の受け取りを足し、既存の `cwdHint` → `AgentMonitor` → `Pane.cwd` → `session.json` に流す。OSC 7 の受け取りは今までどおり。
差し込みは共有の設定 `shellCwdTracking`（既定 入）で切れる。

## 設計方針

- **D-1 差し込むのは対話の pane のシェルだけ**。新規・分割・再起動後の復元の pane（`SessionService.spawnForPane` を `command` 無しで呼ぶ経路）。独自コマンドの pane・`edit_scrollback` のエディタのように引数を持つ起動には差し込まない（引数の意味が変わるため。decisions D2）。
- **D-2 判定と組み立ては純粋な関数**（新 `packages/server/src/pty/shellCwdTracking.ts`）。入力: プラットフォーム・シェルのパス・引数・環境・ホスト名・設定。出力: 差し込んだ後の引数・環境。単体試験で Windows の組み立てを確かめる（この環境で Windows の実機は使えない）。
- **D-3 PowerShell**（ファイル名が `powershell.exe`・`pwsh.exe`・拡張子なしを含む。ファイル名・引数とも大文字小文字を区別しない）: 引数に `-Command`・`-c`・`-File`・`-f`・`-EncodedCommand`・`-e`・`-ec`・`-NoExit` のいずれかがあれば差し込まない（利用者が起動の仕方を決めている。ただし今の `--shell` は 1 つの文字列で引数を渡せない〔`packages/server/src/cliArgs.ts:118`〕ので、この判定は将来の引数と独自の組み立てへの備え）。無ければ末尾に `-NoExit -EncodedCommand <base64(UTF-16LE)>` を足す。
  ```powershell
  $__sodaPrompt = $function:prompt
  function global:prompt {
    $loc = $executionContext.SessionState.Path.CurrentLocation
    if ($loc.Provider.Name -eq 'FileSystem') {
      [Console]::Write([char]27 + ']9;9;"' + $loc.ProviderPath + '"' + [char]27 + '\')
    }
    if ($__sodaPrompt) { & $__sodaPrompt } else { "PS $($loc)$('>' * ($nestedPromptLevel + 1)) " }
  }
  ```
  - パスは符号化せずそのまま（`"` はパスに使えないので引用符で包める）。UNC パス（`\\server\share`）・空白・非 ASCII・`#`・`%` もそのまま運べる。
  - **未確認**（この環境は Linux で Windows の実機が無い。公式の文書と VS Code・Windows Terminal のシェル連携の一般的な作法に基づく）: `-NoExit -EncodedCommand` のスクリプトがプロファイルの読み込みの後に走る／`-EncodedCommand` は実行ポリシーに掛からない／`[Console]::Write` の制御列はプロンプトの描画の前に端末へ届き画面に見えない／5.1 は `` `e `` を持たないので `[char]27` を使う。→ 組み立ては単体試験、実機の振る舞いは test の未検証の穴。
- **D-4 cmd**（ファイル名が `cmd.exe`・`cmd`。大文字小文字を区別しない）: 環境変数 `PROMPT` の先頭に `$E]9;9;"$P"$E\` を足す。`PROMPT` は pane に渡す環境（`SessionService.envForPane` がサーバの環境から作る全体。`packages/server/src/session/paneEnv.ts:50-70`）から読み、無ければ cmd の既定 `$P$G` の前に足す。
  - `$P` は今の場所をそのまま出す（符号化しない）ので、OSC 9;9 の中身として `%`・`#`・空白をそのまま運べる（OSC 7 の URL にしない理由）。
  - **未確認**: cmd の `$E` が ESC を出すこと（cmd の `PROMPT` の文書）。実機は未検証の穴。
- **D-5 OSC 9;9 の受け取り**: `Mirror` に OSC 9 のハンドラを足し、中身が `9;` で始まるものだけを場所として受け取る（`9;9;"<path>"` か `9;9;<path>`。両端の `"` を外し、Windows のサーバなら `win32.normalize`）。それ以外の OSC 9（通知）は今までどおり xterm に任せる（ハンドラは false を返して処理を妨げない）。**どのプラットフォームでも受け取る**（requirements AC7 は限定していない。Linux は前面のプロセスの場所が優先されるので害が無い。decisions D3）。`Mirror` は `parseOsc7` と同じく `process.platform` を既定の引数で受ける。
- **D-6 設定は共有の設定 `shellCwdTracking`（boolean・既定 true）**。サーバは pane を開くたびに `PrefsStore` の今の値を読む（次に開く pane から効く）。ブラウザと端末版の設定画面の「端末」の節に「シェルの場所を追う（Windows）」を置く。

## 対象範囲

- server: 新 `pty/shellCwdTracking.ts`（純粋）・`terminal/TerminalManager.ts`（`CreatePaneOptions.trackCwd` を受けて差し込む）・`session/SessionService.ts`（対話の pane だけ `trackCwd: true`）・`composeServer.ts`（`PrefsStore` の値を渡す）・`terminal/Mirror.ts`（OSC 9;9）。
- protocol: `SharedPrefs` に `shellCwdTracking`。
- client-core: `prefs/load.ts` に `loadShellCwdTracking`（既定 true）。
- web: 設定の「端末」の節の項目（`SettingsDialog.vue`・`store/settings.ts`）。
- tui: 設定画面の「端末」の節（`settings/sections.ts`）。
- docs: `docs/verification.md`（449-452 の既知の制約）・`docs/tui.md`（設定の表）・`docs/herdr-parity.md`（H36b 等の cwd の注記があれば）・`docs/custom-commands.md`（独自コマンドの pane の場所は今までどおり。D2）。

## 依拠する既存の事実

- Windows の前面のプロセスは cwd を持たない（`packages/server/src/platform/WindowsProcessInspector.ts:40,49` が `cwd: null`）。`AgentMonitor` は `leader?.cwd ?? host.mirror.cwdHint()`（`packages/server/src/agent/AgentMonitor.ts:173`）。
- OSC 7 の受け取りと Windows のパスへの直し（`packages/server/src/terminal/Mirror.ts:132-135`・`:370-384` `parseOsc7`）。
- 既定のシェルは `powershell.exe`・引数なし（`packages/server/src/platform/WindowsProcessInspector.ts:57-59`）。`--shell` は `SessionService.shell` → `TerminalManager.create` の `opts.shell`（`packages/server/src/session/SessionService.ts:1198`・`packages/server/src/terminal/TerminalManager.ts:62-75`）。
- `spawnForPane` は独自コマンドの pane では `command` を持つ（`SessionService.ts:1188-1201`）。
- pane の場所が変わると `session.json` を保存し（`SessionService.ts:1058`）、復元はその場所でシェルを起動する（`SessionService.ts:1369-1388`）。
- 共有の設定はサーバの `PrefsStore`（`packages/server/src/persist/PrefsStore.ts`）。
- `Pane.cwd` の使い道: 新しく開く場所の「引き継ぐ」（`packages/server/src/session/newCwd.ts:123-139`）・workspace の自動の名前の追従（`SessionService.ts:351`・`workspaceLabel.ts`）・`sodactl pane current`（pane の情報を返す）・保存と復元（上）。
- 独自コマンドの `shell` 種は `/bin/sh -lc <コマンド>` のようにコマンドを実行する起動で、対話のシェルではない（`packages/server/src/commands/commandLaunch.ts:31`）。`edit_scrollback` のエディタも `command` 付きで起動する（`SessionService.ts:692`）。
- **未確認**: Windows の実機での差し込みの振る舞い（D-3・D-4 の未確認の項）。

## インターフェース / データ構造

```ts
// packages/server/src/pty/shellCwdTracking.ts
export interface ShellLaunch { shell: string; args: string[] | string; env: Record<string, string> }
export function withShellCwdTracking(
  launch: ShellLaunch,
  ctx: { platform: NodeJS.Platform; hostname: string; enabled: boolean },
): ShellLaunch;   // 差し込まないときは launch をそのまま返す
export function powerShellPromptScript(): string;  // 上の固定のスクリプト
```

- `args` が文字列（`packages/server/src/pty/PtyBackend.ts:10` の型が `string[] | string`）のときは差し込まない（組み立てた行を壊さない）。
- `CreatePaneOptions` に `trackCwd?: boolean`（true のときだけ `withShellCwdTracking` を通す）。`TerminalManager` は `platform`・`hostname`・`enabled()` を受け取る（`composeServer` が `os.hostname()`・`() => prefs の shellCwdTracking !== false` を渡す）。

## 振る舞いの詳細

- 差し込むのは `process.platform === "win32"` のときだけ。Linux・WSL2・macOS は何もしない（AC8）。
- 設定を切った後に開く pane は差し込まない。既に開いている pane は変えない。
- 復元の pane（再起動後）も対話の pane なので差し込む。会話の再開コマンド（`claude --resume …`）は差し込んだ後のプロンプトに打たれるので影響しない。

## エラー処理 / 異常系

| 事象 | 扱い |
|---|---|
| 利用者のシェルが対象外（bash・nu 等） | 差し込まない（今までどおり） |
| 利用者が `--shell` に `-Command` 等を付けた | 差し込まない |
| PowerShell の実行ポリシー | `-EncodedCommand` はスクリプトファイルではないので実行ポリシーに掛からない |
| プロファイルで `prompt` が無い | 既定のプロンプトの文字列を返す |
| UNC パス・`#`・`%` を含むパス | そのまま運べる（OSC 9;9 は符号化しない） |

## 受け入れ基準との対応

- AC1: D-3・D-4 の差し込み → OSC 9;9 → `Mirror`（D-5）→ 既存の `AgentMonitor`・`Pane.cwd`。入力は pane のシェルのプロンプト。
- AC2: `Pane.cwd` の保存（既存）と復元の pane への差し込み（D-1）。
- AC3: 「引き継ぐ」は `Pane.cwd` を使う（既存）。
- AC4: D-3 の `prompt` の包み（プロファイルの後）・D-4 の `PROMPT` の先頭に足す。単体試験で組み立て、実機は未検証。
- AC5: OSC は端末が画面に出さない制御列。`[Console]::Write` はプロンプトの前。
- AC6: D-6 の `shellCwdTracking`（`enabled: false` なら引数・環境をそのまま返す試験）。
- AC7: D-5 の OSC 9;9（`Mirror` の単体試験）。
- AC8: `platform !== "win32"` ならそのまま返す試験と、既存の試験がそのまま通ること。
- AC9: docs の書き換え。
