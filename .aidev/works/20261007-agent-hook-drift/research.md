# 調査: エージェント連携のフックの設定と、現行の公式文書との食い違い（Grok CLI・Qoder CLI・Devin CLI）

> **取り方**: 公式文書を `curl` で原文（Markdown。Grok だけ HTML も）のまま取り、その文字列を読んだ
> （WebFetch / WebSearch の要約は項目名の根拠にしていない）。取った日は **2026-10-07（UTC 14:02〜14:20）**。
> **実機**: `which grok qodercli qoder devin` はどれも見つからない。**この調査は文書だけで確かめたもので、
> 実機では確かめていない。**
> 元の調査は `.aidev/works/20260923-other-agents-session-resume/research.md`（F1〜F4）。本書の G・Q・D・X は
> それに対する現行の文書の読み直し。

## 調査の問い

- Q1（Grok CLI）: フックのエントリは、内側に `hooks[]` を持つ入れ子か、平らな形か。`SessionStart` に
  `matcher` が要るか。平らな形も受けるか。
- Q2（Qoder CLI）: 現行版に `SessionStart` があるか。設定ファイル・エントリの形・セッション id の受け渡し・
  再開のコマンドまで、ほかの kind と同じ形で対応できるか。
- Q3（Devin CLI）: いまの書き先（`$DEVIN_CONFIG_DIR` か `~/.devin` の `hooks.json`）は現行版で読まれるか。
- Q4: 報告を受けた後の経路（受け口 → 保存 → 再開）は、対象の kind で実際に繋がっているか
  （Qoder を「ほかの kind と同じ形で足す」ために、足す先を読んで確かめる）。

## 判明した事実

### G: Grok CLI — 食い違いあり（エントリの形）

出典: `https://docs.x.ai/build/features/hooks.md`（同じ頁の HTML `https://docs.x.ai/build/features/hooks`
にも同じ JSON がある）・`https://docs.x.ai/build/settings/reference.md`・
`https://docs.x.ai/build/features/sessions.md`・`https://docs.x.ai/build/cli/reference.md`。

- G1（置き場所。食い違いなし）: 「Hooks are JSON files. Personal hooks live in `~/.grok/hooks/*.json`;
  project hooks live in `<project>/.grok/hooks/*.json`.」。本製品の `~/.grok/hooks/soda-agent-report.json` は
  この glob に入る。
- G2（エントリの形。**食い違いあり**）: 文書にある設定の例は 1 つだけで、内側に `hooks[]` を持つ入れ子。

  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Bash",
          "hooks": [{ "type": "command", "command": "bin/safety-check.sh", "timeout": 10 }]
        }
      ]
    }
  }
  ```

  本製品は `{matcher:"", type:"command", command, timeout:10}`（内側の `hooks[]` が無い平らな形。旧 F4）で
  書いている。**平らな形を受けるという記述は、現行の文書のどこにも無い**（`hooks.md` の全文と
  `settings/reference.md` を確認）。旧 F4 が見た時点の文書と現行のどちらが変わったのかは確かめられていない
  （Wayback Machine は 429 で取れなかった）。
- G3（`matcher`）: 「`matcher` is a regular expression tested against the tool name（…）; **omit it to match
  everything**.」。`SessionStart` にはツール名が無い。文書が明示しているのは「省くとすべてに当たる」で、
  空文字列 `""` の扱いは書かれていない。→ `SessionStart` には **`matcher` を書かない**のが文書どおり。
- G4（`type`・`timeout`）: 「`type` is `"command"` or `"http"`（…）. `timeout` is in seconds, default 5.」。
  `async` の記述は無い。
- G5（イベントと入力。食い違いなし）: イベントの表に `SessionStart`, `SessionEnd`。「The event arrives as JSON
  on stdin, including `hookEventName`, `sessionId`, `cwd`, `workspaceRoot`」「Every hook process also receives
  `GROK_HOOK_EVENT`, `GROK_HOOK_NAME`, `GROK_SESSION_ID`, and `GROK_WORKSPACE_ROOT`」。hook スクリプトは
  `sessionId`（camelCase）を既に受ける。「For passive events, stdout is ignored; exit 0 on success.」
- G6（再開のコマンド。食い違いなし）: `grok --resume <session-id>`（`sessions.md`）・
  「`-r, --resume [<ID>]` | Resume a session by ID, or the most recent if omitted」（`cli/reference.md`）。
- G7（別の気づき。直さない）: 「Claude Code (`.claude/settings.json`) and Cursor (`.cursor/hooks.json`) hook
  files are read as well, including Cursor's camelCase event names.」。`settings/reference.md` に
  `GROK_CLAUDE_HOOKS_ENABLED`・`GROK_CURSOR_HOOKS_ENABLED`（既定 on）と `[compat.claude]`／`[compat.cursor]` の
  `hooks`（既定 `true`）。→ X2。
- G8（別の気づき。直さない）: `GROK_HOME`（既定 `~/.grok`。「Home for config, auth, sessions, skills,
  plugins, and logs」）。フックの置き場所がこれに従うかは書かれていない。本製品は `~/.grok` 固定のまま。

### Q: Qoder CLI — 食い違いあり（`SessionStart` がある。対応できる）

出典: `https://docs.qoder.com/cli/hooks.md`・`https://docs.qoder.com/cli/hooks-reference.md`・
`https://docs.qoder.com/cli/sessions.md`・`https://docs.qoder.com/cli/cli-reference.md`・
`https://docs.qoder.com/cli/settings.md`・`https://docs.qoder.com/cli/settings-reference.md`・
`https://docs.qoder.com/cli/installation.md`。npm の `bin` は `npm view @qoder-ai/qodercli bin version`
（1.1.65）。

- Q-1（イベント。**旧 F1 と食い違う**）: `hooks.md` の Event Reference の表に
  「`SessionStart` | `source` (startup/resume/clear/compact/new) | — | `source`, `model`」。
  「#### SessionStart — Triggered when a session starts.」。`hooks-reference.md` の Event Types にも
  `SessionStart`・`SessionEnd`。旧 F1 が引いた「Qoder does not support the SessionStart hook event」という文は、
  現行の文書には無い（旧 F1 は WebSearch の結果の引用で、当時の原文は残っていない）。
- Q-2（設定ファイル）: 「`~/.qoder/settings.json` # User level, applies to all projects」。3 つの置き場所は
  「**loaded and merged together** (hooks for the same event do not override each other)」。
  `settings.md`: 「The default configuration directory is `~/.qoder`, which can be modified via the
  environment variable `QODER_CONFIG_DIR`.」。`settings-reference.md`:
  「`QODER_CONFIG_DIR` | User configuration directory location (default: `~/.qoder`).」
- Q-3（エントリの形）: Claude Code と同じ入れ子。

  ```json
  {
    "hooks": {
      "EventName": [
        {
          "matcher": "match condition",
          "hooks": [
            { "type": "command", "command": "command to execute", "timeout": 600 }
          ]
        }
      ]
    }
  }
  ```

  組の項目: 「`matcher` | No | Match condition; matches all if omitted」「`hooks` | Yes」「`async` | No」。
  `command` のエントリの項目: 「`timeout` | No | Timeout in seconds, default 600」
  「`async` | No | When `true`, this single hook runs in the background; overrides the group-level `async`」。
  `matcher` の書き方: 「Omitted or `"*"` | Match all」・正確な値・`|` 区切り・正規表現。**空文字列 `""` の扱いは
  書かれていない**。
- Q-4（`SessionStart` の `matcher`）: 当てる先は起動の由来。`startup`（New session started）・`resume`
  （Existing session resumed）・`clear`（Reset via `/clear`）・`compact`（After context compaction completes）・
  `new`（New session (other sources)）。`sessions.md`: 「use `/new` to start a brand new session; `/clear` clears
  the Conversation History and also starts a new session」。→ `/clear`・`/new` でもセッションが替わるので、
  **`matcher` を省いて全部で報告する**と、いつも今の id が届く（報告は同じ id を上書きするだけ）。
- Q-5（入力）: 「Hook scripts receive JSON data via **stdin**. All events include（…）`session_id` | Current
  session ID」`transcript_path`・`cwd`・`hook_event_name`。hook スクリプトは `session_id` を既に受ける。
- Q-6（出力）: 終了コード 0 で stdout が JSON でなければ「plain text (only `SessionStart` / `UserPromptSubmit`
  inject plain-text stdout into the conversation as additional context)」。hook スクリプトは stdout に何も書かない
  ので、会話に混ざらない。
- Q-7（コマンドの実行）: 既定は「Shell form（…）The CLI runs `bash -c "<command>"` (or PowerShell)」。
  `node "<パス>" qoder` はどちらでも通る形。
- Q-8（再開のコマンド）: `sessions.md`「Use `-r` (`--resume`) to resume a previous session by its ID:
  `qoder -r <session-id>`」。`cli-reference.md`「`--resume` | `-r` | `[id]` | Restore a Historical session by
  identifier」。
- Q-9（実行ファイル名）: 文書は一貫して `qoder`（`qoder --version`）。npm のパッケージ `@qoder-ai/qodercli`
  （1.1.65）の `bin` は `qoder` と `qodercli` の両方。本製品の検出（`agents.ts`）は `qodercli`・`qoder`・
  `qoderclicn`・`qodercn` を kind `qodercli` に寄せている。`agent start` の表（`agentStart.ts`）は `qodercli`
  （herdr の表に合わせたもの。この work では変えない）。

→ 設定ファイル・エントリの形・セッション id・再開のコマンドのすべてが文書で確かめられた。**対応できる。**

### D: Devin CLI — 食い違いあり（書き先・包み方）

出典: `https://docs.devin.ai/cli/extensibility/hooks/overview.md`・
`https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks.md`・
`https://docs.devin.ai/cli/reference/configuration/config-file.md`・
`https://docs.devin.ai/cli/reference/configuration/global-vs-local.md`・
`https://docs.devin.ai/cli/reference/configuration/read-config-from.md`・
`https://docs.devin.ai/cli/reference/commands.md`・`https://docs.devin.ai/cli/essential-commands.md`。

- D1（置き場所。**食い違いあり**）: `overview.md`「Where Hooks Live」の表は、次で全部。

  | 段 | 場所 | 形 |
  |---|---|---|
  | プロジェクト | `.devin/hooks.v1.json` | Standalone hooks file (recommended) |
  | プロジェクト | `.devin/config.json`・`.devin/config.local.json` | `"hooks"` key |
  | プロジェクト | `.claude/settings.json`・`.claude/settings.local.json` | `"hooks"` key (Claude Code format) |
  | 利用者 | `~/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`） | `"hooks"` key in user config |
  | 利用者 | `~/.claude.json`・`~/.claude/settings.json`・`~/.claude/settings.local.json` | `"hooks"` key (Claude Code format) |

  **`~/.devin/hooks.json` は表に無い。`DEVIN_CONFIG_DIR` という環境変数は、取った 7 頁のどこにも無い**
  （`commands.md` にある環境変数は `DEVIN_MODEL`・`DEVIN_PERMISSION_MODE`・`DEVIN_SANDBOX`、フックに渡るのは
  `DEVIN_PROJECT_DIR`）。本製品の書き先は、旧 decisions D4 のとおり推測で、現行の文書では読まれる場所ではない。
  利用者の段に置けるのは `~/.config/devin/config.json` の `hooks` キーだけ（`hooks.v1.json` はプロジェクトの段
  だけ）。
- D2（包み方。**食い違いあり**）: 「In `.devin/hooks.v1.json`, the hooks object is the **entire file** (no
  wrapper key needed). In all other locations, hooks are nested under the `"hooks"` key in a settings file.」。
  → `~/.config/devin/config.json` では `hooks.SessionStart`。本製品はトップレベル直下の `SessionStart` で書いている。
- D3（エントリの形。食い違いなし）: `lifecycle-hooks.md` の `SessionStart` の例は
  `{"matcher": "", "hooks": [{"type": "command", "command": "./scripts/dev-setup.sh", "timeout": 10}]}`。
  「For non-tool events (…`SessionStart`…), there is no `tool_name`; use `""` or omit the matcher」。本製品の
  エントリ（`matcher:""`＋`hooks:[{type,command,timeout:10}]`）と同じ。
- D4（入力。食い違いなし）: 「every stdin payload includes a stable per-session `session_id`」。
- D5（設定ファイルはコメントつきの JSON）: `config-file.md`「Devin CLI uses JSON files (with comment support)」
  「Config files support JavaScript-style comments」。**利用者の `config.json` にコメントがあると、
  本製品の `JSON.parse` は失敗する**（いまの実装は、解釈できないファイルを書き換えずに断る）。
- D6（Windows）: 「On Windows, the user config paths are `%APPDATA%\devin\config.json`（…）, not
  `~\.config\devin\`.」
- D7（`XDG_CONFIG_HOME`）: `global-vs-local.md` は `~/.config/devin/…` を「XDG path」、
  「Paths shown as `~/.config/devin/` use the XDG convention for Linux/macOS」と書くが、
  **`XDG_CONFIG_HOME` に従うとは書いていない**。未確認。
- D8（再開のコマンド。食い違いなし）: `commands.md`「`--resume <SESSION_ID>` | `-r` | Resume a specific session
  by ID.」
- D9（別の気づき。直さない）: 利用者の段で `~/.claude/settings.json` の `hooks` も読む。「Hooks from `.claude/`
  paths are loaded when `read_config_from.claude` is enabled (the default).」→ X2。

### X: 文書の読み直しの途中で見つけた、コードの側の事実

- X1（**報告が捨てられている**）: `packages/server/src/composeServer.ts` の報告の受け口は
  `if (report.kind === "claude" || report.kind === "codex") session.reportAgentSession(...)`。
  **cursor・copilot・devin・droid・grok・qwen の報告は、ここで捨てられる**（`AgentReportSocket.ts` は kind を
  見ずに通す。`reportAgentSession` を呼ぶのはこの 1 か所だけ）。この条件は 20260923-agent-session-resume で
  入り、6 つを足した 20260923-other-agents-session-resume では広げられなかった（`git log -S` で確認。
  `SessionService.test.ts` は `reportAgentSession` を直に呼ぶので、受け口の条件は通らない）。
  → 6 つの kind は、フックを正しく入れても、会話は再開されない。Qoder を足しても同じ。
- X2（Claude Code のフックを、Devin CLI と Grok CLI も読む。G7・D9）: Claude Code 用に入れたフック
  （`node …/soda-agent-report.cjs claude`）を、Devin CLI・Grok CLI が既定で読んで実行する。その報告は
  kind が `claude` のまま、Devin・Grok のセッション id を運ぶ。復元のとき `claude --resume <Devin の id>` が
  打たれうる。**この work では直さない**（どのエージェントから呼ばれたかの見分け方の設計が要る。報告に書く）。

## 影響範囲

- `packages/server/src/agent/AgentIntegrationInstaller.ts`（`HOOK_SPECS` の grok・devin を直す、qoder を足す、
  古い形・古い場所で入れたエントリを見つけて片づける仕組み）。
- `packages/protocol/src/model.ts`・`messages.ts`、`packages/server/src/agent/AgentIntegrationService.ts`・
  `resumeCommand.ts`・`composeServer.ts`（X1）、`packages/web/src/components/SettingsDialog.vue`、
  `packages/tui/src/settings/sections.ts`（kind の一覧に qoder）。
- 文書: `docs/verification.md`・`docs/herdr-parity.md`・`docs/migrate-from-wtm.md`。

## 実現性 / リスク

- R1: 3 つとも**実機で確かめられない**。文書どおりに書き、書いた形を単体テストで文書の例と突き合わせる。
- R2（Grok）: 平らな形を現行版が受けるかは分からない。入れ子に書き直すと、文書どおりにはなる。
  古い版の Grok CLI が入れ子を受けるかも分からない（文書に版の区別は無い）。
- R3（Devin）: 利用者の本体の設定（`config.json`）に書くことになる。コメントつきのファイルは書き換えられない
  （D5）。`XDG_CONFIG_HOME` は未確認（D7）。
- R4: 既に古い形・古い場所で入れた利用者がいる。install / uninstall / status が古いものも見つけて片づけること。

## design への申し送り

- Grok: 入れ子（`matcher` なし）に変える。古い平らなエントリを「更新が必要」として見つけ、［更新］で置き換える。
- Devin: 書き先を `~/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`）の
  `hooks.SessionStart` に変える。古い `hooks.json`（`$DEVIN_CONFIG_DIR` か `~/.devin`）も見つけて片づける。
  コメントつきで解釈できないときは、書き換えずに断り、理由を伝える。
- Qoder: kind を足す。Claude Code と同じ入れ子・`async: true`・`matcher` なし。
- X1: 受け口の条件を、連携の kind の全部に広げる（Qoder を足す前提）。回帰テストは
  `.aidev/conventions/regression-negative-control.md` に従う。
