# 調査: エージェントを問わない拡張（soda 拡張）のための、各エージェントの「外から割り込む口」

> **調べ方と断り**: 2026-10-07 に、各エージェントの公式の文書と公式のリポジトリを WebSearch / WebFetch /
> `curl` で取得して読んだ。調査は 4 つのサブエージェント（A〜D 組）に分けて並行で行い、Bob Shell だけは
> 監督のセッションが直接調べた。**どのエージェントも実機では動かしていない。文書とソースの記載だけ**である。
>
> - A 組（Claude Code・Codex・Copilot CLI・Gemini CLI・Cursor Agent・OpenCode）は、WebFetch（小さいモデルの
>   要約を通る）で読んでいる。細かい項目名は、実装の前に原文で確かめ直す。
> - B 組・C 組・D 組・Bob Shell は、ページの本文（Markdown / HTML）を直接落として照合した。D 組は、
>   WebFetch の要約が誤りを混ぜた例（Muse で「プロンプトの書き換え可・結果の差し替え可」と返したが、
>   原文は逆）を実際に見つけている。
> - 「不明」は、文書で確かめられなかったもの。推測では埋めていない。「無い」と断定したものではない。
> - 以前の調査 `.aidev/works/20260923-other-agents-session-resume/research.md`（F1〜F4）と食い違う点は、
>   F6 にまとめた。あの調査の教訓（生成された報告は一次資料で裏を取る）は、ここでも同じに当てはまる——
>   **この文書の表は、設計の入口であって、実装の根拠ではない**。対象にするエージェントは、その作業の
>   design の前に、1 つずつ一次資料と実機で確かめ直す。

## 調査の問い

- Q1: Claude Code の Mods（プラグインの中の JS/TS の関数が、ツール呼び出し・プロンプト・画面の描画の
      イベントに割り込む）とは何か。何ができて、どこで動き、どこが危ないか。
- Q2: Sodashitsu が検知の対象にしている 22 種類のエージェント（`packages/server/src/agent/agents.ts` の
      `AGENTS`）と Bob Shell は、それぞれ「外から割り込む口」をどこまで持つか。
  - フック（設定に書く外部コマンドなど）の有無・イベント・設定の場所
  - フックでできること: (a) ツール呼び出しを実行前に止める (b) 引数を書き換える (c) 結果を書き換える・伏せる
    (d) プロンプトを止める・書き換える・文脈を足す (e) 権限の確認を自動で承認・拒否する
    (f) ターンの終了を止めて続けさせる
  - プロセスの中で動く拡張の有無と、エージェント自身の TUI に描けるか
  - 独自のコマンド・ツール（MCP）・ステータスライン
  - 外から操る口（ヘッドレスの JSON・SDK・ACP・サーバ）と、権限の確認を外に委ねられるか
- Q3: エージェントを問わずに共通化できるのは、どこまでか。
- Q4: 以前の調査（セッションの再開のためのフック）と、現行の文書は食い違っていないか。

## 判明した事実

### F1: Claude Code の Mods は、プロセスの中で動く関数。描けるが、隔離が無い（Q1）

- 2026-10-01 ごろ、Claude Code v2.1.287（Desktop は v2.1.286）で既定で有効になった。この環境の
  Claude Code は 2.1.292 なので、対象に入る。
- mod はプラグインの一種。`hooks/hooks.json` の `modules` が指す JS/TS の `register(on)` が、Claude Code の
  プロセスの中で呼ばれる。ハンドラは `on('event', {matcher}, async ($, e, next) => …)` の形で、イベントを
  見るだけ・書き換える・自分で答える、のどれかを選ぶ。`$` が mods API（`ui`・`session`・`state`・`fs`・
  `process`・`command`・`tool` など）。
- できること: ペイン・入力欄の上の帯・ボタン・入力欄を描く／ツール呼び出しの行・スピナー・質問の
  ダイアログなど、既存の画面を描き替える（**権限の確認画面は変えられない**）／ツール呼び出しを止める・
  書き換える・ツールを動かさずに答える・別のモデルへ送る／ターンを使わない `/command`。
- **隔離されていない**。利用者の権限で動き、ファイル・環境変数・API キーを読め、すべてのプロンプトと
  ツール呼び出しを見られ、確認なしにツール呼び出しを承認できる（`ask` のルールや、利用者の
  `PreToolUse` フックが止めた呼び出しも、承認できる場合がある）。サンドボックスを有効にしても、mod が
  起動したプロセスはその外で動く。Team / Enterprise では組み込みの `sec-default` が先に読み込まれる。
- 動く場所: フックはプラグインを読み込むセッションならどこでも動く（`claude -p`・Agent SDK・VS Code 拡張を
  含む）。描画は、ターミナルと Desktop アプリの Code タブだけ。Desktop の WSL セッションは対象外。
- 入れ方と止め方: `/plugin install <名前>@<マーケットプレイス>`、`claude --plugin-dir`、
  `claude plugin validate`（`hooks:` と `calls:` の行で、何をするかを入れる前に一覧できる）、
  `claude plugin test`、`--safe-mode`、`"disableAllHooks": true`。
- 組み込みの mod: `cc-plugin-diff`・`cc-plugin-agents-md`・`cc-plugin-sec-default`・`cc-plugin-telemetry` など。
  見本: `token-weather`・`blast-radius`・`replay-theater`。
- 出典:
  - https://code.claude.com/docs/en/plugins/mods/overview
  - https://code.claude.com/docs/en/plugins/mods/reference
  - https://claude.com/blog/claude-code-mods
  - https://claude.dev/blog/getting-started-with-claude-code-mods/
  - https://thenewstack.io/anthropic-claude-code-mods-plugins/
  - https://github.com/anthropics/claude-code/tree/main/mods
  - https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods
- 同じ名前の別物: Charmbracelet の `mods`（いろいろな LLM を呼ぶ汎用の CLI）
  https://github.com/charmbracelet/mods/releases

### F2: 23 種類の一覧（Q2）

凡例: ○ 可 / △ 一部・条件つき / × 不可（文書・型に項目が無い、または不可と明記） / ? 確かめられず /
— 本体に権限の確認が無い。「口」は、F = 外部コマンドのフック、P = プロセスの中で動く拡張。
Bob Shell は Sodashitsu の検知の対象（22 種類）に入っていない。

| エージェント | 口 | 止める (a) | 引数の書換 (b) | 結果の書換 (c) | プロンプト停止 (d) | 文脈を足す (d) | 権限の自動承認 (e) | 終了を止めて続行 (f) | 自画面に描く | ACP |
| :- | :- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :- | :-: |
| Claude Code | F+P | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○（Mods） | △ 外部アダプタ |
| Codex | F | ○ | ○ | △ | ○ | ○ | ○ | ○ | × | △ 外部アダプタ |
| Copilot CLI | F | ○ | ○ | ○ | × | × | ○ | ○ | ? | ○ |
| Gemini CLI | F | ○ | ○ | ○ | ○ | ○ | × | ○ | × | ○ |
| Cursor Agent | F | ○ | ○ | △ MCP のみ | ○ | × | △ | ○ | ステータス行 | ○ |
| OpenCode | P | ○ | ○ | △ | ? | ○ | △ | ? | ○ | ○ |
| Pi | P | ○ | ○ | ○ | ○ | ○ | — | ○ | ○ | ? |
| Cline | F+P | ○ | ○ | △ P のみ | △ P のみ | △ P のみ | △ P のみ | ? | ? | ○ |
| Amp | P | ○ | ○ | ○ | × | ○ | — | ○ | △ ダイアログ等 | ? |
| Droid | F | ○ | ○ | × | ○ | ○ | ○ | ○ | ステータス行 | ○ |
| Devin CLI | F | ○ | ○ | × | ? | ○ | ○ | ○ | × | ○ |
| Antigravity CLI | F | ○ | × | × | × | ○ | ○ | ○ | ステータス行 | ? |
| Kimi Code CLI | F | ○ | × | × | ○ | ○ | × | ○ | × | ○ |
| Kiro CLI | F | ○ | × | × | ○ | ○ | ? | ? 文書が食い違う | × | ○ |
| Grok CLI | F | ○ | × | × | × | × | × | × | ステータス行 | ○ |
| Hermes Agent | F+P | ○ | ○ | △ P のみ | ? | ○ | × | △ | × | ○ |
| Kilo Code CLI | P | ○ | ○ | ○ | ? | ○ | ○ | ? | ○ | ○ |
| Qoder CLI | F | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ステータス行 | ○ |
| Qwen Code | F | ○ | ○ | × | ○ | ○ | ○ | ○ | ステータス行 | ○ |
| Letta Code | F+P | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○（名前も Mods） | ○ |
| Maki | P（Lua） | ○ | ○ | ○ | ○ | ○ | △ 事前ルール | ○ | ○ | ○ |
| Muse Code | F | ○ | ○ | × | ○ | ○ | ○ | ○ | ? | ? |
| Bob Shell（対象外） | F | ○ | × | × | ○ | ○ | × | × | × | ○ |

- Letta Code の行は Mods での値（旧フックは非推奨。F3 の 20）。Cline の「P のみ」は、ファイルのフックでは
  できず、プラグインでだけできるもの。
- プロンプトの**本文そのもの**を書き換えられるのは、Pi・Letta（Mods）・Maki・Kilo・OpenCode（型定義から）
  だけ。ほかは「止める」か「文脈を足す」まで。

数えた結果（検知の対象の 22 種類。かっこ内は Bob Shell を足した 23 種類）:

| 機能 | できる数 | できないもの・未確認のもの |
| :- | :- | :- |
| 止める | 22 / 22（23 / 23） | — |
| 引数を書き換える | 18（18） | × Antigravity・Kimi・Kiro・Grok（・Bob） |
| 終了を止めて続けさせる | 16（16） | × Grok（・Bob）／ ? Cline・Kiro・OpenCode・Kilo ／ △ Hermes |
| 結果を書き換える（無条件に） | 10（10） | △ Codex・Cursor・OpenCode・Cline・Hermes。残りは × |
| 自分の画面に描ける | 6（6） | Claude Code・OpenCode・Pi・Kilo・Letta・Maki。API はどれも別物。Amp はダイアログとステータスの項目まで |
| 外部コマンドのフックを持つ | 17（18） | OpenCode・Pi・Amp・Kilo・Maki の 5 つは、プラグインのファイルを置く形 |

### F3: エージェントごとの要点と出典（Q2）

番号は表の順。各項目は、フックの場所とイベント → できること → プロセスの中の拡張と描画 →
コマンド・ツール・ステータスライン → 外から操る口、の順。

#### 1. Claude Code（A 組）

- フック: `~/.claude/settings.json`・`.claude/settings.json`・`.claude/settings.local.json`・管理設定・
  プラグインの `hooks/hooks.json`・スキルとサブエージェントの frontmatter。種類は command / http /
  mcp_tool / prompt / agent。イベントは SessionStart, Setup, UserPromptSubmit, UserPromptExpansion,
  PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, PostToolBatch,
  Notification, MessageDisplay, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure,
  TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded, FileChanged, WorktreeCreate,
  WorktreeRemove, PreCompact, PostCompact, PreModelSwitch, PostModelSwitch, Elicitation, ElicitationResult,
  SessionEnd。 https://code.claude.com/docs/en/hooks
- できること: (a) PreToolUse の `permissionDecision: "deny"` (b) `updatedInput` (c) PostToolUse の
  `updatedToolOutput` / `updatedMCPToolOutput` (d) 止める（`decision: "block"`）・文脈を足す
  （`additionalContext`）は可、本文の書き換えは不可 (e) PermissionRequest の `decision.behavior: allow|deny`
  (f) Stop の `decision: "block"`。
- プロセスの中の拡張: Mods（F1）。描画先は Pane・AbovePrompt・既存の部品の差し替え。
- コマンド・ツール・ステータスライン: スキルと custom commands、Mods の `$.command.register`／MCP と
  `$.tool.register`／ステータスラインあり（外部コマンド。複数行も可）
  https://code.claude.com/docs/en/statusline
- 外から操る口: `claude -p --output-format stream-json` https://code.claude.com/docs/en/headless ／
  Agent SDK（TS / Python）／権限は `canUseTool` か `--permission-prompt-tool` で外に委ねられる
  https://code.claude.com/docs/en/agent-sdk/permissions ／ACP は本体に無く、Anthropic 製ではないアダプタ
  https://github.com/agentclientprotocol/claude-agent-acp

#### 2. OpenAI Codex CLI（A 組）

- フック: 既定で有効（`[features] hooks = false` で無効）。`~/.codex/hooks.json` か `~/.codex/config.toml`、
  `<repo>/.codex/hooks.json` か `<repo>/.codex/config.toml`、プラグイン同梱の `hooks/hooks.json`。種類は
  command と mcp_tool（prompt / agent は読むが実行しない）。イベントは SessionStart, SessionEnd,
  SubagentStart, SubagentStop, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact,
  UserPromptSubmit, Stop, Interrupt。**管理外のフックは、定義のハッシュごとに利用者が信頼するまで実行
  されない**。 https://learn.chatgpt.com/docs/hooks （旧 https://developers.openai.com/codex/hooks から転送）
- できること: (a) PreToolUse の `permissionDecision: "deny"`（シェル・unified exec・apply_patch・MCP・
  ローカルの関数ツール。WebSearch などホスト側のツールは対象外） (b) `permissionDecision: "allow"` と
  `updatedInput` の組でのみ (c) 部分的——PostToolUse の `decision: "block"` で、結果を理由の文に置き換える。
  `updatedMCPToolOutput` と `suppressOutput` は非対応 (d) 止める・文脈を足すは可、本文の書き換えは項目が
  無い (e) PermissionRequest の `decision.behavior: allow|deny`（deny が優先。`updatedInput` /
  `updatedPermissions` は非対応。PreToolUse の `ask` は非対応） (f) Stop の `decision: "block"`。
- プロセスの中の拡張: 無い。プラグインは skills・MCP サーバ・browser extensions・hooks の束
  https://learn.chatgpt.com/docs/plugins
- コマンド・ツール・ステータスライン: custom prompts は非推奨で skills へ移行
  https://learn.chatgpt.com/docs/llms.txt ／MCP（`mcp_servers.<id>`）／`tui.status_line` は組み込み項目の
  id を並べるだけ（外部コマンドで描くキーは無い）。`tui.terminal_title` と `notify` はある
  https://learn.chatgpt.com/docs/config-file/config-reference
- 外から操る口: `codex exec --json` https://learn.chatgpt.com/docs/non-interactive-mode ／`codex app-server`
  （JSON-RPC。`item/commandExecution/requestApproval`・`item/fileChange/requestApproval`・
  `tool/requestUserInput` で権限を外に委ねられる。`dynamicTools`・通知 `hook/started|completed`）
  https://learn.chatgpt.com/docs/app-server ／`@openai/codex-sdk`（TS）・`openai-codex`（Python）
  https://learn.chatgpt.com/docs/codex-sdk ／ACP は本体に無く、OpenAI 製ではないアダプタ
  https://github.com/agentclientprotocol/codex-acp
- 不明: `codex exec` の実行中に承認を外へ委ねる方法。SDK 側の承認コールバック。

#### 3. GitHub Copilot CLI（A 組）

- フック: `.github/hooks/*.json`・`~/.copilot/hooks/`・`.github/copilot/settings.json`（と
  `settings.local.json`）・`~/.copilot/settings.json`・ポリシー `/etc/github-copilot/policy.d/*.json`・
  プラグイン内。種類は command / http / prompt。イベントは sessionStart, sessionEnd, userPromptSubmitted,
  userPromptTransformed, preToolUse, postToolUse, postToolUseFailure, preCompact, agentStop,
  subagentStart, subagentStop, errorOccurred, permissionRequest, notification（多くは PascalCase の別名あり）。
  https://docs.github.com/en/copilot/reference/hooks-configuration
- できること: (a) preToolUse の `permissionDecision: allow|deny|ask` (b) `modifiedArgs` (c) postToolUse の
  `modifiedResult` (d) **設定ファイルのフックでは、止める・足す・書き換えるのいずれも不可**——原文
  "Command and HTTP config-file userPromptSubmitted hooks have their output dropped, including
  modifiedPrompt"。`userPromptTransformed` は `modifiedTransformedPrompt` を持つが、設定ファイルのフックで
  効くかは要再確認。SDK の `onUserPromptSubmitted` は `modifiedPrompt` 可 (e) permissionRequest の
  `behavior: allow|deny`（CLI 限定） (f) agentStop の `decision: "block"`（8 回連続で打ち切り）。
- プロセスの中の拡張: 別プロセスの Extensions（実験的）。`.github/extensions/NAME/extension.mjs`・
  `~/.copilot/extensions/NAME/`。`joinSession()`（`@github/copilot-sdk/extension`）でセッションへつなぎ、
  ツールとスラッシュコマンドを足す。TUI へ独自の部品を描く機能は記載なし（不明）。
  https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions
  https://docs.github.com/en/copilot/tutorials/create-an-extension
- コマンド・ツール・ステータスライン: skills・custom agents・拡張の commands／MCP
  （`~/.copilot/mcp-config.json`）／`footer` の表示項目（`/statusline`）
  https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
  外部コマンドを指す `statusLine` は第三者の記事でのみ確認（不明）。
- 外から操る口: `copilot -p --output-format json`
  https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference ／ACP
  `copilot --acp --stdio`（public preview。権限は `requestPermission` へ）
  https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server ／`github/copilot-sdk`
  （GA。`onPermissionRequest` とフック） https://github.com/github/copilot-sdk
  https://github.com/github/copilot-sdk/blob/main/docs/features/hooks.md

#### 4. Gemini CLI（A 組）

- フック: `settings.json` の `hooks`（`~/.gemini/settings.json`・`.gemini/settings.json`）、拡張の
  `hooks/hooks.json`。種類は command のみ。イベントは BeforeTool, AfterTool, BeforeAgent, AfterAgent,
  BeforeModel, BeforeToolSelection, AfterModel, SessionStart, SessionEnd, Notification, PreCompress。
  https://geminicli.com/docs/hooks/reference/ https://geminicli.com/docs/extensions/reference/
- できること: (a) BeforeTool の `decision: "deny"` (b) `hookSpecificOutput.tool_input` (c) AfterTool の
  `decision: "deny"` で出力を伏せて `reason` に置き換え。`additionalContext`・`tailToolCallRequest`
  (d) 止める（BeforeAgent の deny）・文脈を足すは可、本文の書き換えは不可 (e) **不可**——Notification
  （ToolPermission）は "cannot block alerts or grant permissions automatically"。BeforeTool の allow が確認を
  省くかは不明 (f) AfterAgent の `decision: "deny"` で応答を却下し、`reason` を新しいプロンプトにして再試行。
  ほかに BeforeModel / AfterModel でモデルへの要求と応答を差し替え、BeforeToolSelection でツールを絞れる。
- プロセスの中の拡張: 無い。拡張（`gemini-extension.json`）は宣言的な束。
- コマンド・ツール・ステータスライン: TOML のコマンド https://geminicli.com/docs/cli/custom-commands/ ／
  MCP／フッターの項目を選ぶ設定のみ https://geminicli.com/docs/cli/settings/
- 外から操る口: `gemini -p --output-format json|stream-json` https://geminicli.com/docs/cli/headless/ ／
  ACP `gemini --acp` https://geminicli.com/docs/cli/acp-mode/ ／権限の委譲は ACP 経由で可とみられる
  （文書に明記は無く、issue と PR から）
  https://github.com/google-gemini/gemini-cli/issues/21783
  https://github.com/google-gemini/gemini-cli/pull/29596 ／SDK `@google/gemini-cli-sdk`（詳細不明）
  https://github.com/google-gemini/gemini-cli/blob/main/packages/sdk/README.md

#### 5. Cursor Agent CLI（A 組）

- フック: `~/.cursor/hooks.json`・`<project>/.cursor/hooks.json`・Team / Enterprise の配布・プラグイン。
  Claude Code 形式のフックも読む。種類は command / prompt。イベントは sessionStart, sessionEnd,
  preToolUse, postToolUse, postToolUseFailure, subagentStart, subagentStop, beforeShellExecution,
  afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile, afterFileEdit,
  beforeSubmitPrompt, preCompact, stop, afterAgentResponse, afterAgentThought。
  https://cursor.com/docs/agent/hooks https://cursor.com/docs/reference/third-party-hooks
- **CLI での対応範囲に注意**: フックの文書は IDE と CLI を区別していない。CLI changelog は、2026 年 1 月に
  session start/end・follow-up つきの stop・pre-compaction・subagent、4 月に "Hooks fire reliably"、
  5 月にペイロードを stdin で渡す、と記す。**イベントごとの CLI 対応表は公式に無い（不明）**。
  https://cursor.com/docs/cli/changelog
  CLI の AskQuestion ツールが preToolUse / postToolUse を通らないという報告の題がある（中身は未確認）
  https://forum.cursor.com/t/cursor-cli-askquestion-tool-skips-pretooluse-and-posttooluse-hooks/161836
- できること: (a) preToolUse の `permission: "deny"`、beforeShellExecution / beforeMCPExecution /
  beforeReadFile の deny (b) `updated_input` (c) 部分的——`updated_mcp_tool_output`（MCP ツールだけ）
  (d) 止める（beforeSubmitPrompt の `continue: false`）は可。書き換えは不可。文脈を足す項目は
  beforeSubmitPrompt に無く、sessionStart の `additional_context` だけ (e) 部分的——専用の PermissionRequest
  イベントは無い (f) stop / subagentStop の `followup_message`（`loop_limit` の既定は 5）。
- プロセスの中の拡張: 無い。プラグインは束 https://cursor.com/docs/plugins
  https://cursor.com/docs/cli/reference/parameters
- コマンド・ツール・ステータスライン: custom commands・skills／MCP／`statusLine` を自分のコマンドに向け
  られる（changelog 2026 年 4 月）。設定の書き場所は未確認
  https://cursor.com/docs/cli/reference/configuration
- 外から操る口: `agent -p --output-format text|json|stream-json` https://cursor.com/docs/cli/headless ／
  ACP `agent acp`（`session/request_permission` に答える。独自の拡張メソッドあり）
  https://cursor.com/docs/cli/acp ／`@cursor/sdk`（承認コールバックなし）
  https://cursor.com/docs/sdk/typescript

#### 6. OpenCode（sst/opencode。v1.18.35、2026-10-06）（A 組）

- フック: 設定に書く外部コマンド型は確認できず。割り込みは JS/TS のプラグイン。`.opencode/plugins/`・
  `~/.config/opencode/plugins/`・config に書いた npm パッケージ。 https://opencode.ai/docs/plugins/
- `Hooks` 型（dev ブランチ）: event, config, tool, auth, provider, chat.message, chat.params, chat.headers,
  permission.ask, command.execute.before, tool.execute.before, tool.execute.after, shell.env,
  tool.definition, experimental.chat.messages.transform, experimental.chat.system.transform,
  experimental.session.compacting, experimental.compaction.autocontinue, experimental.text.complete。
  https://github.com/sst/opencode/blob/dev/packages/plugin/src/index.ts
- できること: (a) `tool.execute.before` で throw（文書） (b) `output.args` を書き換える（文書） (c) 可と
  みられる（`tool.execute.after` の `output`。型定義から） (d) 書き換えは可とみられる（`chat.message`。
  型定義から）。止める口は不明 (e) 可とみられる（`permission.ask` の `output.status`。実動は未検証）
  (f) 専用のフックは確認できず（不明）。
- プロセスの中の拡張と描画: あり。TUI プラグイン（`TuiPlugin`。slots・route・keymap・dialog・toast・theme。
  `@opentui/solid` の JSX）
  https://github.com/sst/opencode/blob/dev/packages/plugin/src/tui.ts
- **v1 と v2 で形が違い、移行期**: v2 の文書は `Plugin.define({id, setup})`・`@opencode/plugin/tui`・
  permission の `evaluate`・session の `prompt` を載せる
  https://opencode.ai/v2/docs/build/plugins/ https://opencode.ai/v2/docs/build/plugins/cli/
  v2 がリリース済みかは明記が無く、安定版のタグは v1.18.35。v1 の利用者向け文書には TUI への描画の
  説明が無い。
- コマンド・ツール・ステータスライン: Markdown のコマンド https://opencode.ai/docs/commands/ ／プラグインの
  `tool` と MCP／専用のステータスラインの設定は確認できず。
- 外から操る口: `opencode run --format json` https://opencode.ai/docs/cli/ ／`opencode serve`（HTTP・
  OpenAPI・SSE。`POST /session/:id/permissions/:permissionID` で権限に答える）
  https://opencode.ai/docs/server/ ／SDK https://opencode.ai/docs/sdk/ ／ACP `opencode acp`
  https://opencode.ai/docs/acp/

#### 7. Pi（earendil-works/pi。旧 badlogic/pi-mono）（B 組）

- フック（外部コマンド）: 無い。すべて拡張（extensions）で行う。
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md
- 拡張の `pi.on()`（型:
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts ）:
  (a) `tool_call` が `{ block: true, reason }` (b) `event.input` をその場で書き換える (c) `tool_result` が
  `content` などを返す (d) `input` が `{action:"transform", text}` / `{action:"handled"}`、
  `before_agent_start`、`context` (e) 本体に権限の確認が無い（「does not ask for approval before every
  tool call」）。`ctx.ui.confirm()` で自作
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md
  (f) `turn_end` / `agent_before_settle` が `{ continue: true }`。
- 拡張と描画: TypeScript/JS（`jiti`。ビルド不要）。`~/.pi/agent/extensions/`・`.pi/extensions/`・
  `pi --extension`。`ctx.ui` に `setStatus`・`setWidget`・`setFooter`・`setHeader`・`custom()`・
  `setEditorComponent`・`setWorkingIndicator` など。ツール行は `renderCall` / `renderResult`。
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md
- コマンド・ツール: `pi.registerCommand()`・`pi.registerTool()`・MCP
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md
- 外から操る口: JSON モード
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md ／RPC モード
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md ／SDK
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md ／拡張のダイアログは
  RPC で `extension_ui_request` として外へ渡る
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-extension-ui.md ／ACP は不明。

#### 8. Cline（CLI 版。SDK ベース）（B 組）

- フック: フック用のディレクトリに、イベント名のファイルを置く。`~/.cline/hooks/`・`.cline/hooks/`（旧
  `.clinerules/hooks/` も読む）・`--hooks-dir` / `CLINE_HOOKS_DIR`。ファイル名は TaskStart, TaskResume,
  TaskCancel, TaskComplete, TaskError, PreToolUse, PostToolUse, UserPromptSubmit, PreCompact,
  SessionShutdown。 https://docs.cline.bot/cli/cli-reference
  https://github.com/cline/cline/blob/main/sdk/packages/core/src/hooks/hook-file-config.ts
  （文書のフックのページ https://docs.cline.bot/customization/hooks は「SDK Plugins を見よ」だけなので、
  細部はソースから読んだ。リリース版と差がありうる）
- できること（ファイルのフック / プラグイン）: (a) 可 / 可（ファイルは `{"cancel": true}` で**実行全体の
  停止**。プラグインは `beforeTool` の `{ skip: true }`） (b) `overrideInput` / `beforeTool` の `input`
  (c) 不可 / 可（`afterTool` が `result`） (d) ファイルの `UserPromptSubmit` は「no return channel」/
  プラグインは `beforeRun`・`beforeModel`・`registerMessageBuilder` (e) 不明 / 可（`beforeTool` の `policy`）
  (f) 不明。
  型と適用箇所:
  https://github.com/cline/cline/blob/main/sdk/packages/shared/src/agent.ts
  https://github.com/cline/cline/blob/main/sdk/packages/agents/src/agent-runtime.ts
  https://github.com/cline/cline/blob/main/sdk/packages/core/src/hooks/hook-file-hooks.ts
- 拡張と描画: `AgentPlugin`（`.ts`/`.js`。`cline plugin install`）。TUI への描画の口は不明。
  https://docs.cline.bot/customization/plugins https://docs.cline.bot/sdk/plugins
  https://docs.cline.bot/sdk/plugin-examples
- コマンド・ツール・ステータス: https://docs.cline.bot/usage/tui
  https://docs.cline.bot/core-workflows/using-commands
- 外から操る口: `cline --json`／ACP `cline --acp` https://docs.cline.bot/usage/acp ／SDK の
  `requestToolApproval` https://docs.cline.bot/sdk/guides/permission-handling

#### 9. Amp（ampcode）（B 組）

- フック（外部コマンド）: 無い https://ampcode.com/docs/cli/settings
- プラグインの `amp.on()`: イベントは `session.start`・`tool.call`・`tool.result`・`agent.start`・
  `agent.end`・`changes.prompt`。(a) `{action:'reject-and-continue'}` (b) `{action:'modify', input}`
  （`synthesize` も） (c) `tool.result` で差し替え (d) 文脈を足すだけ可（`agent.start` の `message`）
  (e) 本体に権限の確認が無い（「Amp does not ask for approval before running tools」）
  https://ampcode.com/docs/tools (f) `agent.end` が `{action:'continue'}`（連続 5 回まで）。
  https://ampcode.com/docs/customize/plugins https://ampcode.com/docs/plugin-api
- 描画: `ctx.ui.notify / confirm / input / select`、`amp.experimental.createStatusItem()`。独自のペインは無い。
- コマンド・ツール: https://ampcode.com/docs/customize/mcp https://ampcode.com/docs/customize/skills
- 外から操る口: `amp -x --stream-json`
  https://ampcode.com/docs/cli/streaming-json https://ampcode.com/docs/cli/execute-mode ／SDK
  https://ampcode.com/docs/sdk ／ACP は不明。

#### 10. Droid（Factory）（B 組）

- フック: `~/.factory/hooks.json`・`.factory/hooks.json`（旧 `.factory/hooks/hooks.json`）・無ければ
  `settings.json` の `hooks`・管理設定・プラグイン。種類は command のみ。イベントは PreToolUse,
  PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, PreCompact, SessionStart, SessionEnd。
  https://docs.factory.com/harness/hooks
- できること: (a) 可 (b) `hookSpecificOutput.updatedInput` (c) 不可 (d) 止める・文脈を足すは可、書き換えは
  不可 (e) `permissionDecision: allow|deny|ask` (f) Stop・SubagentStop の `decision:"block"`。
- プロセスの中の拡張: 無い https://docs.factory.com/harness/plugins
- コマンド・ツール・ステータスライン: https://docs.factory.com/harness/custom-slash-commands
  https://docs.factory.com/droid-cli/settings https://docs.factory.com/harness/mcp
- 外から操る口: `droid exec -o text|json|stream-json|stream-jsonrpc`
  https://docs.factory.com/droid-exec/overview https://docs.factory.com/droid-cli/cli-reference ／ACP
  https://docs.factory.com/ide-integrations ／SDK の `permissionHandler`・`askUserHandler`
  https://docs.factory.com/sdk/typescript

#### 11. Devin CLI（Cognition）（B 組）

- フック: `.devin/hooks.v1.json`（ファイル全体がフック。包むキーなし）、`.devin/config.json`・
  `.devin/config.local.json`・`~/.config/devin/config.json` の `hooks` キー、Claude Code の
  `.claude/settings.json` も読む（`read_config_from.claude` が既定で有効）、プラグインの `hooks.json`。
  種類は command と prompt。イベントは PreToolUse, PostToolUse, PermissionRequest, UserPromptSubmit, Stop,
  PostCompaction, SessionStart, SessionEnd。
  https://docs.devin.ai/cli/extensibility/hooks/overview
  https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks
- できること: (a) 可 (b) `updatedInput` (c) 不可 (d) 文脈を足すは可、止めるは不明、書き換えは不可
  (e) PermissionRequest で `{"decision":"approve"}` (f) Stop で `{"decision":"block"}`。
- プロセスの中の拡張: 無い https://docs.devin.ai/cli/extensibility/plugins/overview
- 設定: https://docs.devin.ai/cli/reference/configuration/config-file
- 外から操る口: `devin -p`（JSON ストリームは不明）・ACP `devin acp`
  https://docs.devin.ai/cli/reference/commands https://docs.devin.ai/cli/acp/zed

#### 12. Antigravity CLI（Google。`agy`）（B 組）

- フック: `.agents/hooks.json`・`~/.gemini/config/hooks.json` または
  `~/.gemini/antigravity-cli/settings.json`・プラグインの `hooks.json`。形式は「フック名 → イベント →
  ハンドラ」で、ほかと違う。イベントは PreToolUse, PostToolUse, PreInvocation, PostInvocation, Stop の 5 つ
  （セッション開始・プロンプト送信のイベントは無い）。 https://antigravity.google/docs/hooks
- できること: (a) 可 (b) 不可 (c) 不可 (d) 止める・書き換えは不可、文脈を足すは `PreInvocation` の
  `injectSteps`（モデル呼び出しごとに発火する） (e) `decision: allow / deny / ask / force_ask /
  deny_unless_prior_grant` (f) Stop の `decision: "continue"`、`PostInvocation` の
  `terminationBehavior: "force_continue"`。
- プロセスの中の拡張: 無い。Sidecars は「Antigravity 2.0」だけが対象で CLI は対象外。
  https://antigravity.google/docs/plugins https://antigravity.google/docs/sidecars
- コマンド・ツール・ステータスライン: https://antigravity.google/docs/skills
  https://antigravity.google/docs/cli/statusline https://antigravity.google/docs/mcp
- 外から操る口: `agy -p --output-format json|stream-json`（確認が要るツールは「ソフト拒否」）
  https://antigravity.google/docs/cli/headless ／Python SDK（別のランタイム）
  https://antigravity.google/docs/sdk/lifecycle https://antigravity.google/docs/sdk/policies ／ACP は不明。

#### 13. Kimi Code CLI（Moonshot AI。2.1.1 / 2026-09-24）（C 組）

- フック: `~/.kimi-code/config.toml` の `[[hooks]]`、プラグインのマニフェスト。イベント 20 種
  （UserPromptSubmit, UserPromptQueued, PreToolUse, Stop, TurnStarted, PostToolUse, PostToolUseFailure,
  PermissionRequest, PermissionResult, SessionStart, SessionEnd, SessionHeartbeat, SubagentStart,
  SubagentStop, TaskStarted, StopFailure, Interrupt, PreCompact, PostCompact, Notification）。止められるのは
  PreToolUse・Stop・UserPromptSubmit の 3 つだけ。fail-open。
  https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/hooks.md
  https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html
- できること: (a) 可 (b) 記載なし (c) 不可 (d) 止める・文脈を足すは可 (e) 拒否は可、自動承認は不可
  (f) 可（Stop）。
- プロセスの中の拡張: 無い
  https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md
  https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/themes.md
- 外から操る口: `kimi -p --output-format stream-json`・ACP `kimi acp`（`session/request_permission`）・
  `kimi web`（REST + WebSocket。`POST /api/v1/sessions/{id}/approvals/{approval_id}`）
  https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-command.md
  https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-acp.md
  https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/server-api.md

#### 14. Kiro CLI（AWS。CLI 3.0 / エンジン V3）（C 組）

- フック: CLI 3.0 で、エージェント設定への埋め込みから `.kiro/hooks/*.json`（`version: "v1"`）の独立
  ファイルへ変わった（`kiro-cli agent migrate`）。トリガーは SessionStart（旧 `agentSpawn`）, SessionEnd,
  Stop, PreToolUse, PostToolUse, UserPromptSubmit, PreTaskExec, PostTaskExec, PostFileCreate, PostFileSave,
  PostFileDelete, Manual。アクションは `command` と `agent`。
  https://kiro.dev/docs/hooks/ https://kiro.dev/docs/hooks/types/ https://kiro.dev/docs/hooks/actions/
  https://kiro.dev/docs/cli/v3/hooks-migration/
- できること: (a) 可（PreToolUse exit 2） (b) 記載なし (c) 記載なし (d) 止める・文脈を足すは可
  (e) 拒否は可、自動承認は不明 (f) **文書が食い違う**——hooks/types は Stop の
  `{"decision": "block", "reason": …}` で続行と書き、V3 の移行表は Stop を「Can block? No」と書く。
- プロセスの中の拡張: 無い。Powers は束 https://kiro.dev/docs/powers/create/
  https://kiro.dev/docs/cli/terminal-ui/
- コマンド: https://kiro.dev/docs/reference/slash-commands/
- 外から操る口: `kiro-cli chat --no-interactive --output-format stream-json`・ACP `kiro-cli acp`
  （`session/request_permission`） https://kiro.dev/docs/cli/headless/ https://kiro.dev/docs/cli/acp/
  https://kiro.dev/docs/cli/v3/acp-migration/

#### 15. Grok CLI（xAI。`grok` / Grok Build）（C 組）

- フック: `~/.grok/hooks/*.json`・`<project>/.grok/hooks/*.json`（`/hooks-trust` か `--trust` が要る）・
  プラグイン内。Claude Code の `.claude/settings.json` と Cursor の `.cursor/hooks.json` も読む。種類は
  `command` と `http`。timeout の既定は 5 秒。イベント 14 種（SessionStart, SessionEnd, UserPromptSubmit,
  PreToolUse, PostToolUse, PostToolUseFailure, PermissionDenied, Stop, StopFailure, Notification,
  SubagentStart, SubagentStop, PreCompact, PostCompact）。 https://docs.x.ai/build/features/hooks
- できること: 「PreToolUse — the only blocking event」「For passive events, stdout is ignored」。(a) 可
  (b)(c)(d)(f) 不可 (e) 拒否だけ可。Claude Code 形式の出力（`updatedInput` など）を解釈するかは不明。
- プロセスの中の拡張: 無い https://docs.x.ai/build/features/skills-plugins-marketplaces
- ステータスライン: あり（`~/.grok/config.toml` の `[ui.status_line]`）
  https://docs.x.ai/build/features/status-line
- 外から操る口: `grok -p --output-format plain|json|streaming-json`・ACP `grok agent stdio`（権限を ACP
  クライアントに委ねられるかは不明）・Agent Dashboard（`grok dashboard`。複数のセッションの承認待ちを一覧
  する——Sodashitsu と役割が重なる）
  https://docs.x.ai/build/cli/headless-scripting https://docs.x.ai/build/features/permissions
  https://docs.x.ai/build/features/dashboard

#### 16. Hermes Agent（Nous Research。v2026.9.24）（C 組）

- フック 4 系統: シェルフック（`~/.hermes/config.yaml` の `hooks:`。stdin の JSON に `session_id`）／
  プラグインフック（Python。`ctx.register_hook()`）／Gateway フック（`~/.hermes/hooks/<name>/HOOK.yaml`）／
  Outbound webhook。イベントは 40 種あまり（`pre_tool_call`・`post_tool_call`・`pre_llm_call`・
  `transform_tool_result`・`pre_verify`・`pre_approval_request` ほか）。
  https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/hooks.md
- できること: (a) `{"action": "block"}`（`fail_closed: true` も選べる） (b) `{"action": "modify", "args"}`
  （シェルでも可） (c) Python プラグインのみ確認（`transform_tool_result`） (d) 文脈を足すは可。止める・
  書き換えるは gateway 経由のメッセージだけ (e) 自動承認は**不可**（`pre_approval_request` は
  "observer-only"）。逆に `{"action": "approve"}` で人の承認へ引き上げられる (f) 条件つき（`pre_verify`。
  コードを編集したターンだけ・既定 3 回まで）。
- 拡張と描画: Python プラグイン（`~/.hermes/plugins/<name>/`。既定は無効）。TUI への描画はプラグイン API に
  無く、`HermesCLI` を継承したラッパー CLI か、デスクトップの `@hermes/plugin-sdk`・ダッシュボードの UI
  プラグイン（どれも端末の画面ではない）。
  https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins/
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/extending-the-cli.md
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/extending-the-dashboard.md
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/desktop-plugin-sdk.md
- 外から操る口: ACP `hermes acp`・TUI gateway JSON-RPC（承認は `method: "approval"` の要求）・OpenAI 互換の
  API サーバ・承認トランスポート。ヘッドレスの JSON 出力は不明。
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/cli.md

#### 17. Kilo Code CLI（v7.8.8 / 2026-10-07。OpenCode 系）（C 組）

- フック: 外部コマンド型は無く、プロセスの中の TS/JS プラグイン。`~/.config/kilo/plugin/`・`.kilo/plugin/`
  （旧 `.kilocode/plugin/`）・設定の `plugin` 配列。`KILO_PURE=1` で外部プラグインを全部止められる。フックは
  OpenCode と同じ系統（`tool.execute.before/after`・`chat.message`・`permission.ask` ほか）。
  https://kilo.ai/docs/automate/extending/plugins
  https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/pages/automate/extending/plugins.md
  https://github.com/Kilo-Org/kilocode/blob/main/packages/plugin/src/index.ts
- できること: (a) 例外を投げる (b) `output.args` (c) `tool.execute.after` の `output` (d) 書き換え・文脈を
  足すは可、止めるは不明 (e) `permission.ask`（「Auto-allow or auto-deny permission prompts」） (f) 専用の
  フックは無い（不明）。
- 描画: TUI プラグイン（SolidJS。slots・ルート・ダイアログ・トースト・キーバインド）。公式に「larger and
  still evolving」。 https://github.com/Kilo-Org/kilocode/blob/main/packages/plugin/src/tui.ts
- コマンド: https://github.com/Kilo-Org/kilocode/blob/main/packages/kilo-docs/pages/customize/workflows.md
- 外から操る口: `kilo run --format json`・`kilo serve`・`@kilocode/sdk`（権限の list / reply の API）・
  ACP `kilo acp` https://kilo.ai/docs/code-with-ai/platforms/cli-reference
  https://github.com/Kilo-Org/kilocode/blob/main/packages/sdk/js/src/v2/gen/sdk.gen.ts

#### 18. Qoder CLI（qodercli）（D 組）

- フック: `~/.qoder/settings.json`・`<project>/.qoder/settings.json`・`.qoder/settings.local.json`・
  プラグインの `hooks/hooks.json`。イベントは SessionStart, SessionEnd, UserPromptSubmit, PreToolUse,
  PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied, Stop, StopFailure, SubagentStart,
  SubagentStop, PreCompact, PostCompact, Notification, InstructionsLoaded, ConfigChange, CwdChanged,
  FileChanged, WorktreeCreate, WorktreeRemove, Elicitation, ElicitationResult。
  https://docs.qoder.com/cli/hooks.md
- できること: (a)〜(c) 可（`updatedInput`・`updatedToolOutput` は "works for any tool"） (d) 止める・文脈を
  足すは可、書き換えは不可 (e) PermissionRequest の `decision.behavior: allow|deny` (f) Stop の exit 2。
- プロセスの中の拡張: CLI 本体には無い https://docs.qoder.com/cli/plugins-reference.md
  https://docs.qoder.com/cli/commands.md ／SDK 側には関数のフック https://docs.qoder.com/cli/sdk/hooks.md
- ステータスライン: あり https://docs.qoder.com/cli/interface.md
- 外から操る口: `-p --output-format stream-json` https://docs.qoder.com/cli/run-in-scripts.md ／SDK の
  `canUseTool` https://docs.qoder.com/cli/sdk/permissions.md ／ACP `qoder --acp`
  https://docs.qoder.com/cli/acp.md

#### 19. Qwen Code（D 組）

- フック: `.qwen/settings.json`（信頼したフォルダだけ）・ユーザー設定・拡張。種類は command / http /
  prompt / function（function は利用者向けに非公開）。イベントは PreToolUse, PostToolUse,
  PostToolUseFailure, PostToolBatch, UserPromptSubmit, UserPromptExpansion, SessionStart, SessionEnd,
  SessionDelete, MessageDisplay, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, PostCompact,
  Notification, PermissionRequest, PermissionDenied, TodoCreated, TodoCompleted, InstructionsLoaded。
  https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/
  https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/users/features/hooks.md
- できること: (a) 可 (b) `hookSpecificOutput.updatedInput` (c) 不可 (d) 止める・文脈を足すは可 (e) 可
  (f) Stop の `decision: block`（`stopHookBlockingCap` 既定 8）。
- 拡張: https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/
- コマンド・ステータスライン: https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/
  https://qwenlm.github.io/qwen-code-docs/en/users/features/status-line/
- 外から操る口: `-p --output-format stream-json`
  https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/ ／`@qwen-code/sdk`（`canUseTool`）
  https://qwenlm.github.io/qwen-code-docs/en/developers/sdk-typescript/ ／ACP `qwen --acp`
  https://qwenlm.github.io/qwen-code-docs/en/users/integration-zed/ ／デーモン `qwen serve`
  https://github.com/QwenLM/qwen-code/issues/11795

#### 20. Letta Code（D 組）

- フック: **非推奨**（"Harness Hooks are deprecated and may be removed in a future release"。後継は Mods）。
  `.letta/settings.local.json`・`.letta/settings.json`・`~/.letta/settings.json`。イベントは PreToolUse,
  PostToolUse, PostToolUseFailure, PermissionRequest, UserPromptSubmit, Notification, Stop, SubagentStop,
  PreCompact, SessionStart, SessionEnd。 https://docs.letta.com/reference/deprecated/hooks
- Mods（JS/TS。`~/.letta/mods/`・`$MEMORY_DIR/mods/`。プロジェクト単位は不可）: `tool_start`・`tool_end`・
  `turn_start`・`turn_end`、動的な allow/ask/deny のポリシー。入力欄のまわりのパネル・ステータスラインの
  差し替え・利用者への質問。戻り値の正確な型は公開の文書に無い（不明）。
  https://docs.letta.com/configuration/mods
- コマンド: https://docs.letta.com/platform/cli/slash-commands
- 外から操る口: `-p --output-format stream-json`（権限は `control_request` の `can_use_tool`）
  https://docs.letta.com/platform/cli/headless ／ACP https://docs.letta.com/platform/acp ／App Server
  https://docs.letta.com/self-hosting/app-server ／SDK https://docs.letta.com/agent-sdk ／ヘッドレスでも
  Mods は読み込まれる https://github.com/letta-ai/letta-code/issues/4835

#### 21. Maki（tontinton/maki。0.5.5）（D 組）

- 製品の特定: herdr の対応表の「Maki（state only）」と、`third_party/herdr/agent-detection/maki.toml` の
  `[BUILD]`/`[PLAN]` のステータスバー・`[yolo]` 表示が maki.sh の文書と一致することから特定した（herdr 側に
  URL の明記は無い。同名のフォークが複数ある）。
  https://herdr.dev/docs/agents/ https://github.com/tontinton/maki https://maki.sh/docs/
- フック: 外部コマンド型は無い。Lua（Luau）プラグインの autocmd（通知のみ）と slot（連鎖するフィルタ。
  `tool.<name>.input`・`tool.<name>.output`・`agent.user_message`・`agent.stop` ほか）。
  `~/.config/maki/init.lua`・`<project>/.maki/init.lua`。 https://maki.sh/docs/hooks/
  https://maki.sh/docs/plugins/
- できること: (a)〜(d) 可（プロンプトの書き換えも可） (e) 確認の強制と拒否は可、自動承認は
  `register_permission_rule` の事前ルールだけ https://maki.sh/docs/lua-api/ (f) `agent.stop` の
  `{ continue = text }`（連続 3 回まで）。
- 描画: `maki.ui.open_win`（浮動窓と分割）・`maki.ui.buf`・`flash`・`set_status_hint`。UI が無い実行では
  何もしない。
- コマンド: https://maki.sh/docs/commands/
- 外から操る口: `--print --output-format stream-json`（Claude Code 互換） https://maki.sh/docs/headless/ ／
  ACP `maki acp` https://maki.sh/docs/acp/

#### 22. Muse Code（Meta。`muse`）（D 組）

- 製品の特定: `third_party/herdr/agent-detection/muse.toml` の注記「Muse Code 0.2.1」と別名から。
  `muse-bin-<version>` という名前そのものは公式文書で確認できなかった。
  https://dev.meta.ai/docs/muse-code https://meta-models.github.io/muse-code-sdk/next/
- フック: `managed_hooks_path` のファイル・`~/.config/muse/settings.json` の `hooks`・
  `<project>/.muse/hooks.json`（信頼が要る）・プラグインのマニフェスト。種類は command だけ。イベント
  （1.3.0）は SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse,
  PostToolUseFailure, PostToolBatch, PreLLMCall, PostLLMCall, PreCompact, PostCompact, SubagentStart,
  SubagentStop, Stop, StopFailure, SessionEnd, Notification。出力は閉じたスキーマで、未知のキーは出力ごと
  却下される。
  https://meta-models.github.io/muse-code-sdk/next/guides/extend/hooks/
  https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/hook-events/
  https://dev.meta.ai/docs/muse-code/extending
  第三者の記事は、ベータ 0.2.1 では `.muse/hooks.json` が無視されたと報告している
  https://agenticcontrolplane.com/blog/muse-code-acp-integration
- できること: (a) 可 (b) `updatedInput`（書き換えた呼び出しも承認を通る） (c) 不可 (d) 止める・文脈を足すは
  可 (e) PermissionRequest の `decision.behavior` (f) Stop の block（既定 8 回まで）。
- プロセスの中の拡張: 無い
  https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/packages-and-capabilities/
- 外から操る口: `muse exec`（JSON 出力は不明）・`muse serve`（JSON-RPC。`approval/decide`）
  https://meta-models.github.io/muse-code-sdk/next/guides/msp-concepts/ ／SDK（Preview）／ACP は不明。
  MSP 上ではフックが見えない https://github.com/meta-models/muse-code-sdk/issues/49

#### 23. Bob Shell（IBM Bob の CLI。`bob`、2.0.5）（監督のセッションが直接）

- Sodashitsu の検知の対象に入っていない。herdr でも追加の提案が「対応しない」として閉じられた
  https://github.com/herdrdev/herdr/issues/4731
- フック: `~/.bob/settings/settings.json` と `.bob/settings.json` の `hooks`（ワークスペースの分は、信頼した
  フォルダだけ）。書き方は Claude Code と同じ入れ子（`{matcher, hooks:[{type, command, timeout}]}`）。
  種類は `command` と `https`。timeout の既定は 10 秒。イベントは SessionStart, UserPromptSubmit,
  PreToolUse, PostToolUse, PreCompact, PostCompact, Stop。stdin の JSON は `event`・`session_id`・`tool`・
  `input`・`output`・`prompt`。 https://bob.ibm.com/docs/shell/configuration/lifecycle-hooks
- できること: (a) PreToolUse の exit 2 (b) 不可（「Input rewriting」は未対応と明記） (c) 不可 (d) 止める
  （exit 2）・文脈を足す（SessionStart と UserPromptSubmit の stdout）は可、書き換えは不可 (e) フックでは
  不可。設定の `approval` で事前に決めるだけ
  https://bob.ibm.com/docs/shell/configuration/approval-settings (f) 不可（Stop は止められないと明記）。
- プロセスの中の拡張・描画・ステータスラインの独自化: 文書に見当たらない（関数のフックは未対応と明記）。
- 外から操る口: `bob run --format json|stream-json`（API キーが必須）
  https://bob.ibm.com/docs/shell/getting-started/start-bobshell-non-interactive ／ACP `bob acp`
  https://bob.ibm.com/docs/shell/features/acp ／SDK は文書に見当たらない。
- そのほか: https://bob.ibm.com/docs/shell/changelog https://bob.ibm.com/blog/august-2026-release/
  https://bob.ibm.com/docs/shell/configuration/configuring

### F4: 共通化できるのは「止める」まで。それ以上は段階になる（Q3）

- **「ツール呼び出しを実行前に止める」だけが、全部に共通**する（22 / 22。Bob Shell も可）。
- 引数の書き換え・文脈を足す・ターンを続けさせるは、大半ができるが、できないものがある。
- 結果の書き換え・プロンプト本文の書き換え・権限の自動承認は、エージェントごとの差が大きい。
- **エージェント自身の画面に描けるのは 6 種類だけで、API はどれも別物**（Mods・opentui の slot・Pi の
  `ctx.ui`・Letta の Mods・Maki の Lua）。エージェントの TUI の中では、描画は共通化できない。
- 外から操る口は ACP を持つものが多数だが、**ACP は、エージェントを端末の画面ではなく、その口で起動する
  前提**である。pane の中で TUI を直接使ういまの Sodashitsu の形とは両立しない。TUI を動かしたまま
  使えるのは、フック（と、プロセスの中の拡張）だけ。
- 外部コマンドのフックを持つのは 17 種類（Bob Shell を足して 18）。OpenCode・Kilo・Pi・Amp・Maki の 5 つは、
  プラグインのファイルを置く形になる。OpenCode と Kilo は、プラグインの API が同じ系統。

### F5: 確かめられなかった点・文書の食い違い

- **Kiro**: Stop フックの `decision: block` が CLI V3 で効くか（hooks/types と V3 の移行表が食い違う）／
  「Hook confirmation requests」の仕様／`.kiro/extensions` の中身／CLI 用の SDK。
- **Cursor CLI**: イベントごとの CLI での対応状況（公式の対応表が無い）／`statusLine` の設定の書き場所／
  allow が確認のダイアログを必ず省くか。
- **OpenCode**: `permission.ask` と `tool.execute.after` の実際の挙動（型定義からの読み）／v1.18.35 で
  有効な TUI の slot／v2 のリリース状況。
- **Kilo**: プロンプトを止める口／Stop 相当／ACP での権限の要求／`permission.ask` が実際に発火するか。
- **Copilot**: `userPromptTransformed` が設定ファイルのフックで効くか／拡張からフックを登録できるか／
  `statusLine` コマンドの公式の記述／TUI への描画。
- **Gemini**: ACP の権限の要求の仕様／SDK の機能／BeforeTool の allow が確認を省くか。
- **Codex**: `codex exec` での承認の扱い。
- **Grok**: Claude Code 形式のフックの出力（`updatedInput` など）を解釈するか／ACP での権限の要求／SDK。
- **Hermes**: シェルフックからの結果の書き換え／CLI で打ったプロンプトを止める口／Ink TUI への描画／
  ヘッドレスの JSON 出力。
- **Cline**: ファイルのフックの出力 `review` の意味／CLI が開始時のフックをブロッキングで動かすか／
  ターンの終了を止める口／プラグインからの TUI への描画。フックの細部は main のソースから読んだ。
- **Devin CLI**: UserPromptSubmit を止められるか／`-p` の JSON 出力／ACP での権限の扱い／ステータスライン。
- **Letta**: Mods の戻り値の正確な型／SDK の権限のコールバック。
- **Maki**: SDK モードで権限の要求を `can_use_tool` で出すか。製品の特定は機能の一致による。
- **Muse**: `muse-bin-<version>` の名前／ステータスライン／ACP／`muse exec` の JSON 出力。ベータ 0.2.1 では
  `.muse/hooks.json` が無視されたという第三者の報告。
- **ACP**: Pi・Amp・Antigravity CLI・Muse は、公式文書に記載を見つけられなかった（無いとは断定しない）。

### F6: 以前の調査（20260923-other-agents-session-resume）との食い違い（Q4）

いまの Sodashitsu の連携（`AgentIntegrationInstaller` の `HOOK_SPECS`。8 種類）に関わるもの。**拡張とは
別の作業として、先に確かめて直す**（decisions.md D10）。

- **Grok のフックの形**: 現行の公式文書の例は
  `{"matcher": "Bash", "hooks": [{ "type": "command", "command": …, "timeout": 10 }]}` と、**内側に
  `hooks[]` を持つ入れ子**である。以前の調査 F4 の「内側の `hooks[]` が無い平らな形」と合わない。
  Sodashitsu は平らな形で入れているので、Grok の連携が効いていない可能性がある。stdin のフィールド名・
  環境変数・置き場所は F2 / F4 と一致。
- **Qoder CLI の SessionStart**: 以前の F1 は「SessionStart が無い」として対象から外した。現行の文書
  （ https://docs.qoder.com/cli/hooks.md ）は `SessionStart`（source: startup / resume / clear / compact /
  new）を載せている。セッションの再開に対応できる見込み。
- **Devin CLI の設定の場所**: 以前は「exact パスは design で確認」だった。現在は `.devin/hooks.v1.json`
  （包むキーなし）・`.devin/config.json`・`~/.config/devin/config.json` の `hooks` キーとして文書化されている。
  Sodashitsu の書き先（`DEVIN_CONFIG_DIR` または `~/.devin` の下の `hooks.json`）と合うかは、確かめていない。
- **Pi のリポジトリの移転**: `badlogic/pi-mono` から `earendil-works/pi` へ移った（転送される。npm は
  `@earendil-works/pi-coding-agent`）。
- **Hermes**: 以前の F2 で「推定」だったセッション ID は、シェルフックの stdin の JSON に `session_id` と
  して入ると明記されている。
- **Codex**: `hooks.json` に加えて、`config.toml` の中とプラグイン同梱の分も読む。管理外のフックは、利用者が
  信頼するまで実行されない。
- 一致したもの: Antigravity のイベントは今も 5 つで SessionStart 相当は無い／Qwen の F4 の内容／Cursor と
  Copilot の設定ファイルの場所とエントリの形。

## 影響範囲

- **新しく要るもの**（どれも、この work の後の作業で設計する）:
  - 拡張の登録と起動・停止（設定ファイル。利用者の設定とプロジェクトの設定）
  - 拡張とのやり取り（NDJSON。`pane observe` / `pane control` の系統）
  - 表示の面（ブラウザ版の pane の横のパネル・上の帯。中身は ask の `view` と同じ隔離した枠。端末版の
    パネル）
  - 割り込みの仲立ち（いまの `soda-agent-report` フックを、同期で答えを返す形に広げる）
  - 「このエージェントで何が使えるか」の問い合わせ（`sodactl ask --features` と同じ考え方）
- **手を入れる既存の場所の見込み**:
  - `packages/server/src/agent/AgentIntegrationInstaller.ts`（フックのエントリ。いまは SessionStart と、
    claude だけサブエージェント用のイベント）
  - `packages/server/src/agent/AgentReportSocket.ts`・`packages/server/src/panesocket/`（`pane.sock` に
    載せる操作が増える。「自分の pane の分だけ扱える」境界を保つ）
  - `packages/server/src/ask/`・`packages/web/src/components/AskViewer.vue`・`packages/web/public/ask-view/`
    （隔離した枠の再利用）
  - `packages/protocol`（拡張のメッセージ・表示の面の状態）
  - `packages/tui`（端末版のパネル）
  - `docs/sodactl.md`・`docs/agent-graph.md`・新しい文書
- **既存の土台**: 状態の検知（`AgentMonitor`・マニフェスト）／グラフの `trigger` の線／独自コマンド
  （`docs/custom-commands.md`）／サイドバーの独自トークン（`report-metadata`）／通知／ask のダイアログ。

## 実現性 / リスク

- **利用者に聞いて待つ割り込みは、フックの制限時間に縛られる**。Claude Code と Codex は延ばせるが、既定が
  5〜10 秒のもの（Grok は 5 秒、Bob Shell は 10 秒）では、待てずに「いったん拒否して、理由を返す」形になる。
- **拡張は、利用者の権限で動く**。画面は隔離するが、プロセスそのものは隔離しない（Mods と同じ弱点）。
  プロジェクトの設定からも読むので、clone しただけで他人のプログラムが動かないよう、承認の確認が要る。
- **`pane.sock` に載せる操作が増える**。ログイン不要の受け口なので、安全の境界の見直しが要る。
- **エージェントの側のフックの信頼の確認**: Codex は、管理外のフックを利用者が信頼するまで実行しない。
  Grok・Qwen・Muse・Bob Shell も、プロジェクトの分は信頼したフォルダだけ。Sodashitsu が入れたフックが、
  黙って動かない場合がある。
- **文書だけの調査である**。A 組は要約を通っており、D 組は要約の誤りを実際に見つけている。Cursor CLI・
  Kiro・OpenCode は、文書どうしが食い違うか、移行期にある。対象にするエージェントは、実機で確かめる。
- **エージェントの側が速く変わる**: 9 月の調査から 2 週間で、Qoder・Devin・Grok の記載が変わっていた。
  対応表は、作った時点のものとして扱い、機能の問い合わせで実際の値を返す作りにする。
- **範囲が広い**: 表示・観測・割り込み・対象の拡大を 1 つの作業にすると、差分が数十ファイルを超える
  （AGENTS.md「差分を小さく切る」）。作業を分ける。
- **端末版のパネル**は、ブラウザ版より作業が大きい。別の作業にする。

## design への申し送り

- この work の requirements は、**表示の面（ブラウザ版）**から書く（decisions.md D2・D8）。
- 拡張は別プロセス・NDJSON（D3）。応答しないときは素通しが既定で、拡張ごとに変えられる（D6）。
- 登録は、利用者の設定と、承認つきのプロジェクトの設定（D7）。承認の単位（内容のハッシュごとか）と、
  内容が変わったときの扱いを設計で決める。Codex のフックの信頼の確認が参考になる。
- 割り込みの最初の対象は Claude Code と Codex（D4）。フックの出力の書式は、その作業の design の前に、
  https://code.claude.com/docs/en/hooks と https://learn.chatgpt.com/docs/hooks の原文で確かめ直す
  （A 組は要約を通っている）。
- 対象にしないもの（D9）: エージェント自身の画面の描き替え・結果の書き換え・プロンプト本文の書き換え・
  ACP での駆動。
- F6 の食い違いの修正と Bob Shell の追加は、別の work で先に行う（D10）。この work には入れない。

---

# 追補（2026-10-08）: 表示の面（ブラウザ版）のための、既存の作りの調査

> **調べ方と断り**: `requirements.md`（表示の面・ブラウザ版）を書いた後、design の前に、このリポジトリの既存のコードと文書を読んだ（main の `165f88b`）。
> 読み取りは 3 つのサブエージェントに分け、下の「実装アンカー」に載せた場所のうち、行番号を書いたものは、監督のセッションが `grep` で開き直して確かめた。
> **ビルド・テスト・実機の操作はしていない**（読んだだけ）。上の F1〜F6（エージェントの側の調査）とは別の話で、ここは「変更前の Sodashitsu」の事実。
> パスはリポジトリの根からの相対。

## 調査の問い（追補）

- RQ1: `pane.sock` に操作を足す手順と、呼び出し元の pane の確かめ方は、実際にはどうなっているか。
- RQ2: ask の `view` の隔離した枠は、どう作られているか（iframe の属性・CSP・中身の渡し方・親子の知らせの検査）。枠から親への知らせは、どこまで信用されているか。
- RQ3: pane の画面のどこに、横のパネルと上の帯を差し込めるか。端末の大きさ（列・行）は、どう決まるか。
- RQ4: サーバは、つながっている画面の種類と、どの画面がどの pane を表示しているかを、どこまで知っているか。
- RQ5: 面の状態を画面へ配る既存の型は、どれか（スナップショットに載せる／購読して取る）。
- RQ6: `soda handoff`・サーバの停止・別のマシンの中継・Windows で、メモリだけの状態と `pane.sock` はどう扱われるか。
- RQ7: `sodactl` にサブコマンドを足す場所・終了コード・古い版との組み合わせの型は、どうなっているか。
- RQ8: 利用者が操作する部品として、確立した型は何か（横のパネル・タブ・枠へのフォーカスの出入り）。
- RQ9: 作業 B（拡張の登録と起動）が手本にできる既存の作りは、どれか。

## 判明した事実（追補）

### R1: `pane.sock` は「1 接続 1 要求」。呼び出し元の pane は自己申告で、確かめるのは実在だけ（RQ1）

- 受け口は `packages/server/src/panesocket/PaneSocket.ts`（`class PaneSocket`）。操作の登録表は `PaneOpRegistry.ts`（`PaneOpDef<P> { name; params: z.ZodType<P>; handler(ctx, params) }`、
  `PaneOpContext { paneId; connId /* "pane-socket:<連番>" */; signal: AbortSignal }`）。いま載っている操作は `askOp.ts` の `askOpenOp`・`askFeaturesOp` の 2 つだけで、
  登録は `packages/server/src/composeServer.ts:350-352`（`paneOps.register(...)`）。
- やりとりは 1 行の JSON（要求 `{"v":1,"op","paneId","params"}`・返事 `{"ok":true,"result"}` か `{"ok":false,"error":{"code","message"}}`）。書いたらサーバが閉じる。**返事は 1 行だけ**
  （続けて行を流す形は無い）。検査の順は、行の形 `bad_request` → 操作 `unknown_op` → pane の実在 `not_found` → 引数 `invalid_params` → handler。相手が切れると `ctx.signal` が abort する。
- 定数（`packages/protocol/src/paneSocket.ts`）: `PANE_SOCKET_MAX_LINE_BYTES = 1 MiB`（要求）・`PANE_SOCKET_MAX_REPLY_BYTES = 8 MiB`（返事。sodactl が見る）・`PANE_SOCKET_MAX_CONNECTIONS = 64`・
  `PANE_SOCKET_REQUEST_WAIT_MS = 10_000`。操作の名前の定数は `PANE_OP_ASK_OPEN = "ask.open"`・`PANE_OP_ASK_FEATURES = "ask.features"`。
- **呼び出し元の pane は、要求の外側の `paneId` を sodactl が `SODA_PANE_ID` から入れるだけ**。受け口が確かめるのは実在（`deps.paneExists`）で、トークンも相手のプロセスの確認も無い。
  守りは socket ファイルの権限 0600（同じ OS の利用者）だけ。「自分の pane の分だけ」は、**handler が `ctx.paneId` 以外を対象に取らない**ことで作る
  （`askOp.ts` は `PaneAskOpenParams = AskOpenParams.omit({ paneId: true })` で、引数から `paneId` を除いている）。`docs/sodactl.md`「ログイン不要の受け口」も「`paneId` を自由に名乗れる」と明記している。
- 載せてよい操作の 4 条件（対象が呼び出し元の pane に限られる・pane のプログラムが出来ることを超えない・秘密を返さない・量の上限がある）は、`PaneOpRegistry.ts` のクラスのコメントと `docs/sodactl.md` にある。
- Windows（ネイティブ）は受け口を出さない（`packages/server/src/config.ts` の `paneSocketPathFor` が `undefined`）。sodactl は `/ws`（ログインが要る）へ落ちる。

### R2: ask の `view` の枠は、同じ origin の静的ページを sandbox で開き、中身を `postMessage` で渡す。枠からの知らせは「送り主の窓」だけで見分ける（RQ2）

- 枠を描くのは `packages/web/src/components/AskViewer.vue`。`<iframe sandbox=… referrerpolicy="no-referrer" :src="/ask-view/…html">`（`srcdoc` は使わない）。
  定数は `ASK_VIEW_SANDBOX = "allow-scripts"`（html）・`ASK_VIEW_MARKDOWN_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox"`（markdown）。`allow-same-origin` は付けない（不透明 origin）。
- 静的ページは `packages/web/public/ask-view/`（`html.html`・`html.js`・`markdown.html`・`markdown.js`・`keys.js`・`links.js`・`vendor/marked.umd.js`・`vendor/mermaid.min.js`）。
  配るのは `packages/server/src/http/HttpServer.ts:132` の `handleAskView`（許可リスト `ASK_VIEW_FILES`〔52 行〕の名前だけ・GET/HEAD だけ・認証なし）。
- **CSP は HTTP の応答ヘッダ**（meta ではない）。アプリ本体は `SECURITY_HEADERS`（23 行）:
  `default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`（`frame-src` は無く、`default-src 'self'` が効くので、同じ origin の枠だけ開ける）。
  - `markdown.html`: `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`
  - `html.html`: `sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`
  - 2 つの HTML は `X-Frame-Options: SAMEORIGIN` に付け直す（`ASK_VIEW_PAGE_HEADERS`、49 行）。`.js` は CSP と `X-Frame-Options` を外して配る。sandbox は、iframe の属性と応答ヘッダの二重。
- 中身の渡し方: 枠のページが `parent.postMessage({type:'ready'}, '*')` → 親が `win.postMessage({type:'ask-view', source, dark}, '*')`。
  親は `ev.source === frame.contentWindow` のときだけ、子は `ev.source === parent` のとき 1 回だけ受ける。**`event.origin` は見ていない**（枠が不透明 origin なので `"null"`）。
- **枠の中の文書が別のページへ移っても、`contentWindow` は同じ**なので、送り主の窓の一致だけでは、移った先のページからの知らせも通る（ブラウザの仕様。この調査では実測していない）。
  ask は、枠から受ける知らせを取り消し・前後の質問・決定の「知らせ」だけに絞り、決定そのものは取り次がないことで害を抑えている（`AskDialog.vue` の `onViewKey`、`20261004-ask-media-popup/decisions.md` D9）。
- Markdown の枠の取り除きは `markdown.js:37` の `sanitize(root, whole)`: `meta, link, base, form, iframe, frame, object, embed, map, area, script` と SMIL（`set, animate, animateTransform, animateMotion, animateColor`）、
  本文ではさらに `svg, math` を消す。`<a>` は `links.js` の `openableHref`（`http:`・`https:` だけ）を通ったものに `target="_blank" rel="noopener noreferrer"` を付け、ほかは `href` を外す。
- 枠の中のキーは `keys.js` が `window` のキャプチャで拾い、`Esc`・`Ctrl/Cmd+Enter`・`Alt+PageUp/PageDown` だけを親へ渡す。
- **枠の高さを親へ知らせる仕組みは無い**（枠は flex で親の箱を埋めるだけ）。
- 枠へテーマは CSS 変数では届かない（別の文書）。いまは `dark` の真偽だけを渡している。テーマの変数の一覧は `packages/client-core/src/theme/uiTokens.ts` の `CSS_VARS`（20 個）。
- 既知の限界（`docs/sodactl.md`「成果物（view）」）: html の枠のスクリプトは、フォーカスを奪ってキー入力を読め、`location=` で外へ出せる。`inert` などでは防げない（実測の記録は上の D9・D10）。

### R3: pane の画面は `PaneFrame` の中の `.pane-frame-body`。端末の大きさは、葉の箱を測ってサーバへ申告し、サーバの値に従う（RQ3）

- 階層: `App.vue` → `PaneLayout.vue`（分割の再帰）→ `PaneFrame.vue`（枠・右クリック・名前の表示）→ `.pane-frame-body`（`PaneFrame.vue:305`）→ `<slot />` → `.pane-layout-leaf` → `TerminalPane.vue`。
  **pane に独立した見出しの行は無い**（名前は枠線に重ねた表示）。
- 大きさ: `PaneLayout.vue` が葉（`.pane-layout-leaf`）ごとに `ResizeObserver` を張り、100ms にまとめて（`term/resizeThrottle.ts` の `RESIZE_COMMIT_INTERVAL_MS`）、`term/ViewSync.ts` が葉の箱をセルの寸法で割って
  `client.view {workspaceId, tabId, visible: [{paneId, cols, rows}]}` を送る。`@xterm/addon-fit` は使っていない。xterm の大きさは、サーバから戻る値に従う。
- **葉の外で、葉の箱を縮める場所に置けば、追加のコードなしで大きさが追従する。葉の中・`TerminalPane` の中に置くと、測った大きさより置き場が狭くなり、端が切れる**（`PaneLayout.vue` のコメントに同じ失敗の記録）。
- PTY の大きさを決められるのは、tab ごとに 1 つの画面（`session.hasSizeAuthority(tabId)`＝`tab.sizeOwnerClientId === clientId`）。権限の無い画面は、申告する大きさが変わるだけで、端末は中央寄せで出る。
- zoom（拡大）は、`PaneLayout` の根がその pane だけを `PaneFrame` と葉で描く（同じ `PaneFrame` を通る）。
- **モバイルは別の作り**: `packages/web/src/mobile/MobileShell.vue`（`header.mobile-shell-bar`〔81 行〕と `main.mobile-shell-pane`〔94 行〕）。フォーカス中の pane を 1 つだけ出し、`PaneFrame` は `enabled=false`（枠を描かず、ストアにも触れない）。
  大きさは `.mobile-shell-pane` を測る（`mobile/usePaneArea.ts`）。葉は縮小の箱の中にある。切り替えは `mobile/detect.ts`（768px 未満）。
- pane の右クリックのメニューは `packages/web/src/components/ContextMenu.vue:61-70`（項目は `{ label, run: () => actions.… }`。操作は `actions/ActionDispatcher.ts`）。
- キーの操作の一覧は `packages/client-core/src/keys/bindings.ts` の `ACTIONS`（`ActionId` はそこから導く。494 行）。既定の prefix は `ctrl+b`。**`prefix+i` は既定の割り当てに無い**（`defaults:` を一覧して確認）。
  キーの入口は `packages/web/src/keys/KeyInputController.ts`（`injectPrefix()` が 190 行にある）。

### R4: 接続の種類は 3 つで、端末版も `desktop`。表示中の pane は接続ごとに分かるが、フォーカスは分からない（RQ4）

- `client.hello.kind` は `z.enum(["desktop","mobile","external"])`（`packages/protocol/src/messages.ts` の `clientKind`）。ブラウザは `desktop` か `mobile`、**端末版（`packages/tui/src/net/TuiNet.ts`）も `desktop`**、
  sodactl とブラウザの軽い接続は `external`。種類では、ブラウザと端末版を見分けられない。
- 「質問を出せる画面」は、`ask.subscribe` を送った接続（`packages/server/src/ask/AskService.ts:102` の `subscribers`、157 行の `isBrowserKind` の検査）。端末版は送らない。
- 接続の id は、接続のたびにサーバが振る（再接続で変わる）。`ClientRecord.view`（`client.view` の値）で、**その接続が表示中の pane**は分かる。フォーカス中の pane は、session 全体で 1 つ（最後に誰かがフォーカスしたもの）しか持たない。
- 別のマシンの中継越しの接続は `ClientRecord.viaBridge`（`packages/server/src/clients/ClientRegistry.ts:38`）。

### R5: 画面へ状態を配る型は 2 つ。ask は「id だけのイベント＋購読して取る」、独自トークンは「`Pane` に載せてスナップショットで配る」（RQ5）

- ask: イベントは `ask.opened`・`ask.closed`（id だけ。`packages/protocol/src/events.ts`）。画面は接続のたびに `ask.subscribe` を送り、応答の一覧で出し直す。定義は `ask.get`、大きな中身は `ask.media`（片に分けて取る）。
  スナップショット（`SessionSnapshot`）に ask は入らない。web 側は `store/StoreAdapter.ts:200-202`（イベントの振り分け）→ `main.ts:133`（`onAskEvent`）→ `ask/AskController.ts` → `store/ask.ts`。
  接続ごとの処理は `main.ts:298-299`（`onOpened`・`onClosed`）、マシンの切り替えは `main.ts:398`（`resetForMachineSwitch`）。
- 独自トークン: `Pane.tokens?: Record<string,string>`（`packages/protocol/src/model.ts`）に載り、`pane.updated` とスナップショットで全員に届く。サーバは `packages/server/src/metadata/MetadataService.ts`（メモリだけ・`ttl` つき）。
- `/ws` の 1 通の上限は 4 MiB（`packages/server/src/ws/WsServerWs.ts` の `MAX_WS_PAYLOAD_BYTES`）。
- RPC の引数は zod（`packages/protocol/src/messages.ts` の `METHOD_SCHEMAS`〔920 行付近〕と `MethodResultMap`〔1017 行付近〕）。エラーの code は `packages/protocol/src/errors.ts`（84〜86 行に ask の 3 つ）。
  サーバの登録は `packages/server/src/surface/methods/*.ts`（`index.ts` の `registerAllMethods`、依存は `deps.ts` の `MethodDeps`。`composeServer.ts:411`）。

### R6: `soda handoff` が引き継ぐのは pane の PTY だけ。メモリだけの状態は消える。別のマシンの pane の処理は、先のマシンのサーバが行う（RQ6）

- 引き継ぎの記録は `packages/server/src/handoff/HandoffManifest.ts` の `HandoffManifest { format: 1, …, panes: HandoffPane[], scrollbackEditors }`。**ask の待ち・独自トークン・サブエージェントの一覧などメモリだけの状態は、引き継がれない**。
- 入れ替えの間、`closeClients`（`composeServer.ts:516`）が `/ws` と中継を閉じ、`paneSocket.pause()` する。待っていた `pane.sock` の接続は何も書かずに捨てられ（sodactl は `connection_closed`）、
  新しい接続は `pane_socket_busy`、新しい版が受け口を置き直すまでは `ECONNREFUSED`。sodactl はこの 2 つを 5 秒まで繋ぎ直す（`packages/cli/src/paneSocket.ts` の `PANE_SOCKET_RETRY_MS`）。
- 接続が切れたときの後始末は、2 つの `WsGateway` の `onClientGone`（`composeServer.ts:460-464`・`471-475`）に 1 行ずつ足す形。pane が閉じたときは、bus の `pane.closed` を購読する（`AskService` のコンストラクタ）。
- 別のマシン（`docs/machines.md`）: 手元のサーバは `/ws?machine=` を中継するだけで、中身を解釈しない。先のサーバにとっては `/ws` の 1 接続と同じ。**リモートの pane の `pane.sock`・状態は、リモートのサーバのもの**で、
  そのマシンを表示中の手元のブラウザへ、中継の接続経由で届く。
- handoff をまたぐ確かめは vitest では出来ず、`packages/server/src/handoffSmoke.ts`（ビルドした成果物を子プロセスで起動）で行う。

### R7: `sodactl` のサブコマンドは 4 か所に足す。`pane.sock` か `/ws` かの判断は 1 つの関数にある（RQ7）

- 足す場所: `packages/cli/src/cliArgs.ts` の `USAGE_LINES`・`Command` の union・`parseCommand` の `case`、`packages/cli/src/main.ts` の switch と `printHelp`。
  `packages/cli/src/skill.test.ts` が `USAGE_LINES` と `packages/cli/skills/sodactl/SKILL.md` の食い違いを検査する。
- 受け口を使うか `/ws` へ落ちるかは `packages/cli/src/paneSocket.ts` の `viaPaneSocketOrSession(opts, paneId, op: {name, params?, timeoutMs}, viaSession, call?)` が決める
  （受け口を使う条件: `opts.paneSocket`・`opts.caller` があり、`--url`/`SODACTL_URL` の明示が無く、`--machine` が無い。`unknown_op`・`bad_request`・接続前の失敗は `/ws` へ落ちる）。
- 終了コードは `packages/cli/src/output.ts` の `reportAndExit`: 0＝成功、1＝サーバ・接続・認証のエラー（stderr に `{"error":{"code","message"}}`）、2＝`CliUsageError`。
- 古い版との組み合わせの型（ask）: `probeServer`（`packages/cli/src/commands/ask.ts`）が、`/ws` の `not_found`（知らない方式）と受け口の `unknown_op` を「古いサーバ」と読み、
  `{"status":"unavailable","reason":…}` を stdout に出して終了コード 0。
- NDJSON を出し続けるコマンドの先例は `pane observe`（`packages/cli/src/commands/sessionStream.ts`・`packages/cli/src/sessionStream.ts` の `FrameWriter`・`LineSplitter`）。行は `{"type":"terminal.frame",…}`・`{"type":"terminal.closed","reason":…}`。
  **NDJSON にするのは sodactl の側**で、サーバは `/ws` のフレームを送るだけ。
- E2E で sodactl を動かす型は `packages/e2e/src/support/ask.ts` の `runAsk`・`runAskWithoutLogin`（ビルドした `packages/cli/dist/main.js` を、`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_PANE_SOCKET` を渡して子プロセスで起動。
  `spawnAsk` は引数が `["ask", …]` に固定で、ほかのサブコマンド用の helper は無い）。サーバは `support/appServer.ts` が `composeServer` をテストごとに立てる。ブラウザが送った `client.view` の列・行は `support/panes.ts` の `watchClientView` で読める。

### R8: 利用者が操作する部品の、確立した型（RQ8）

> **断り**: この節の外部の型（WAI-ARIA Authoring Practices・エディタの例）は、**原文を取得せず、書き手の記憶で書いた**。細部は、実装の前に原文で確かめる。リポジトリの中の先例は、コードを読んで確かめた。

| 論点 | WAI-ARIA APG（記憶） | VS Code の横のパネル・Webview（記憶） | このリポジトリの先例（確認済み） | 採る案 |
|---|---|---|---|---|
| 横の補助的な領域 | `role="complementary"`（または名前つきの `region`）に、見える名前を付ける | サイドバー・パネルは名前つきの領域 | pane は `role="group"` と `aria-label`（`PaneFrame.vue:281-282`） | `role="complementary"` と `aria-label`（「pane『…』のパネル」） |
| 複数の中身の切り替え | Tabs: `role="tablist"`/`tab`/`tabpanel`。左右の矢印で移り、`Home`/`End`。タブの並びには `Tab` で 1 回だけ止まる | 同じ | `AskViewer.vue` の成果物のタブ（矢印・`Home`・`End`。`docs/sodactl.md`「成果物（view）」） | APG の Tabs。矢印で移ったら、そのまま切り替える（自動で有効化） |
| 開く・閉じる | 補助的な領域は、開いてもフォーカスを奪わない（ダイアログと違う） | パネルは開いてもエディタのフォーカスを保つ。閉じるのは見出しのボタン | トースト・通知はフォーカスを奪わない。ask のダイアログは奪う（モーダル） | 面はフォーカスを奪わない。閉じるのは見出しのボタン |
| 枠（iframe）へのキーボードの出入り | iframe には `title` を付ける。`Tab` で入れる | Webview へは `F6` などの「領域を移る」操作で入り、`Esc` や同じ操作で戻る。Webview の中のキーは、取り次ぐものだけがエディタへ届く | ask の枠は `Esc` などを `postMessage` で親へ取り次ぐ（`keys.js`） | キーの操作（`prefix+i`）で枠へ入り、`Esc` で端末へ戻る。prefix のキーも取り次ぐ |
| 確定 | ボタンは `Enter`・`Space` | 同じ | — | 枠の中の `button`・`a`・フォームは、ブラウザの既定のまま |

食い違い: APG のタブは「`Tab` でタブの並びから tabpanel へ進む」。ここでは tabpanel が iframe なので、`Tab` で枠の中へ入る。枠の中の最後の要素から先へ `Tab` で出られる（ブラウザの既定）ことを E2E で確かめる。
端末（xterm）は `Tab` を自分で使うので、**端末から面へは `Tab` では移れない**。そのために、キーの操作（`focus_display`）を足す。これは、このアプリに固有の事情。

### R9: 作業 B（拡張の登録と起動）が手本にできる既存の作り（RQ9。B の design への申し送り）

- 設定ファイルの読み込みの手本は `packages/server/src/commands/commandConfig.ts`（`loadCommandsFile`: `O_NOFOLLOW|O_NONBLOCK` で開き、**開いた fd の fstat で**通常ファイル・持ち主・ほかの利用者が書けないこと・64 KiB を確かめて、同じ fd から読む。
  zod の `strictObject`。1 つでも規則外なら全体を採らず、理由にコマンドの文字列を入れない）。読むのは起動時と、読み直しの操作（`command.reload`）のとき。Windows は持ち主と権限を検査しない。
- **独自コマンドの `shell` 種は、子プロセスを切り離して管理しない**（`detached: true`・`stdio: "ignore"`・`unref()`。終了も出力も見ない）。長く生きる子プロセスの手本は、ssh を持つ
  `packages/server/src/machine/MachineLink.ts`（`stdio: ["pipe","pipe","pipe"]`・stderr の上限・`SIGTERM` → 2 秒 → `SIGKILL`・終了を待つ）と `MachineManager.ts`（唯一の持ち主・バックオフ・`start()`/`stop()`）。
- handoff をまたぐ子プロセスの前例は ssh だけで、**止めて終了を待ち、新しい版で起動し直す**（`composeServer.ts:496` の `pausePollers` の中の `await machines.stop()`。理由は「execve で置き換わった後は、子が回収されずに残る」）。
- 子プロセスの起動は、状態ディレクトリのロックを取った後（`listen()` の中）でないと、二重起動のときに 2 つ動く（`commands.reload()` は読むだけなので、組み立ての時点で呼んでいる）。
- workspace に「プロジェクトの根」の項目は無い。`Pane.cwd` は動く。git の根を求める既存の関数は `packages/server/src/session/workspaceLabel.ts` の `findGitRoot(cwd, deps)`（git を呼ばずに `.git` を親へたどる。worktree ごとの根を返す）。
  リポジトリ単位の鍵は `Workspace.git.repoKey`（`--git-common-dir`）。
- JSON を安全に書く共通の関数は `packages/server/src/persist/atomicFile.ts` の `writeFileAtomic`（0600・rename）と `readFileWithBackup`。
- 設定画面の節の足し方: `packages/web/src/components/SettingsDialog.vue` の `.settings-body` の直下に `<section class="settings-section" aria-labelledby=…>` を足す（左のメニューは自動で拾う）。
  サーバから届く確認を、開いている設定を潰さずに出す先例は `AskDialog.vue`（1 枠とは別の `<dialog>`）。

## 影響範囲（追補）

- protocol: 新しい `display.ts`、`messages.ts`（方式の表）、`events.ts`、`errors.ts`、`paneSocket.ts`、`index.ts`。
- server: 新しい `display/`（台帳）、`panesocket/`（操作）、`surface/methods/`（`/ws` の方式）、`composeServer.ts`（組み立て・`onClientGone`・`close()`）、`http/HttpServer.ts`（静的ページの許可リストとヘッダ）、`testkit.ts`。
- cli: `cliArgs.ts`・`main.ts`・新しい `commands/display.ts`・`skills/sodactl/SKILL.md`。
- web: 新しい部品（パネル・帯・枠）とストア・通信の係、`PaneFrame.vue`・`PaneLayout.vue`（葉の CSS）・`mobile/MobileShell.vue`・`main.ts`・`injection.ts`・`store/StoreAdapter.ts`・`ContextMenu.vue`・`actions/ActionDispatcher.ts`、
  新しい静的ページ `public/display-view/`。
- client-core: `keys/bindings.ts`（キーの操作 1 つ）。
- e2e: 新しい spec と `support/` の helper。`handoffSmoke.ts` に 1 段。
- 触らない: `packages/tui`（名乗らないので、出ない）・`third_party/ask-form/`・`/ask-view/*` のヘッダ・`handoff/`。

## 実現性 / リスク（追補）

- **実現できる**: 受け口・隔離した枠・画面への配り方・sodactl の足し方のどれも、ask に先例があり、同じ型で足せる。
- **「返事は 1 行」の受け口で、操作の出来事を流し続ける**には、長く待つ要求（次の出来事が来るまで待って返す）を繰り返す形になる。受け口の同時接続 64 を、待ちが使い切らない上限が要る。
- **枠が別のページへ移ると、送り主の窓の検査だけでは見分けられない**（R2）。作者のスクリプトを動かさず、移る手段を取り除いたうえで、移ったことを検知して枠を作り直す・専用の通り道だけで操作を受ける、の重ねがけにする。
- **パネルの開閉で端末の大きさが変わる**（R3）。中のプログラムに大きさの変更の知らせが飛ぶ。幅を動かしながら変えると 100ms ごとに飛ぶので、幅の変化はアニメーションさせない。
- **モバイルは別の置き場が要る**（R3）。`PaneFrame` の中に足しても出ない。
- **Vite の開発サーバ（`vite dev`）では、静的ページに専用のヘッダが付かない見込み**（`/ask-view/*` と同じ。確かめていない）。隔離の確かめは、ビルドしたものを `HttpServer` から配って行う（E2E はそうなっている）。
- 追補は読んだだけ。行番号は main の `165f88b` の時点。

## 実装アンカー

- A1: 受け口の操作を足す（`packages/server/src/panesocket/askOp.ts` `askOpenOp`）— `PaneOpDef` の作り方・`ctx.paneId` を対象に・`ctx.signal` で待ちを取り消す手本。
- A2: 受け口の操作の登録（`packages/server/src/composeServer.ts:350-352`）— `paneOps.register(...)`。台帳の組み立ては 334 行の `AskService` の近く。
- A3: `/ws` の方式の登録（`packages/server/src/surface/methods/ask.ts` `registerAskMethods`、`index.ts`、`deps.ts` `MethodDeps`、`composeServer.ts:411`）。
- A4: 接続が切れたときの後始末（`packages/server/src/composeServer.ts:460-464`・`471-475`）— 2 つの `WsGateway` の `onClientGone`。
- A5: 台帳の手本（`packages/server/src/ask/AskService.ts`）— `subscribers`（102 行）・bus の `pane.closed` の購読・`onClientGone`・`dispose`。
- A6: 方式の引数と結果の表（`packages/protocol/src/messages.ts:920` 付近 `METHOD_SCHEMAS`・`1017` 付近 `MethodResultMap`）、イベント（`events.ts` の `ServerEvent`）、エラー（`errors.ts:84-86`）、受け口の定数（`paneSocket.ts`）。
- A7: 静的ページの配信（`packages/server/src/http/HttpServer.ts:49-52`・`132-160`）— `ASK_VIEW_PAGE_HEADERS`・`ASK_VIEW_FILES`・`handleAskView`。
- A8: 枠の部品の手本（`packages/web/src/components/AskViewer.vue` `onMessage`・`ASK_VIEW_MARKDOWN_SANDBOX`）と、枠の側（`packages/web/public/ask-view/markdown.js:37` `sanitize`、`links.js` `openableHref`、`keys.js`）。
- A9: pane の中の差し込み場所（`packages/web/src/components/PaneFrame.vue:305` `.pane-frame-body`、CSS は 478 行）と、葉の CSS（`PaneLayout.vue` の `.pane-layout-leaf`）。
- A10: モバイルの置き場（`packages/web/src/mobile/MobileShell.vue:81`・`94`）。
- A11: イベントの振り分けと配線（`packages/web/src/store/StoreAdapter.ts:51`・`200-202`、`main.ts:133`・`198`・`298-299`・`398`・`519`、`injection.ts`）。通信の係の手本は `packages/web/src/ask/AskController.ts`。
- A12: pane の右クリックのメニュー（`packages/web/src/components/ContextMenu.vue:61-70`）。
- A13: キーの操作（`packages/client-core/src/keys/bindings.ts` `ACTIONS`）と入口（`packages/web/src/keys/KeyInputController.ts:190` `injectPrefix`）。操作の実行は `packages/web/src/actions/ActionDispatcher.ts`。
- A14: sodactl のコマンド（`packages/cli/src/cliArgs.ts` `USAGE_LINES`・`Command`・`parseCommand`、`main.ts`、手本は `commands/ask.ts` の `runAsk`・`runFeatures`・`probeServer`）と、経路の選択（`packages/cli/src/paneSocket.ts` `viaPaneSocketOrSession`）。
- A15: E2E の helper（`packages/e2e/src/support/ask.ts:54` `spawnAsk`、`support/panes.ts` `watchClientView`、`support/appServer.ts`、枠の中は `page.frameLocator(...)`。手本の spec は `specs/ask-view.spec.ts`）。
- A16: handoff をまたぐ確かめ（`packages/server/src/handoffSmoke.ts`）。
- A17: フォーカスを端末へ戻す口（未特定 — `TerminalRegistry`・`view.focusedPaneId` のまわり。coding 側で、ask のダイアログを閉じたときに端末へ戻している処理〔`AskDialog.vue`〕を手本に探す）。
- A18: テーマの色を枠へ渡すための、いまの色の読み方（未特定 — `packages/web/src/theme/ThemeController.ts` が `documentElement.style` に当てている。`getComputedStyle` で読むか、ThemeController から取るかは coding 側で決める）。

## 実装時の注意

- `.pane-layout-leaf` の中・`TerminalPane.vue` の中には、何も足さない（端が切れる。R3）。足すのは `.pane-frame-body` の中の、葉の兄弟。
- `PaneLayout.vue` はストアを読まない方針（Pinia の無い呼び出しを壊さない）。面の状態は `PaneFrame.vue`（`enabled` のときだけ）か、その子の部品が読む。
- `PaneFrame` は `enabled=false`（モバイル・単体テスト）のとき、ストアに触れない。面の部品も同じ条件で描かない。
- `/ask-view/*` の応答ヘッダと `ASK_VIEW_SANDBOX` などの定数は変えない（E2E の負の対照が見ている）。新しいページは別のパス・別の許可リストにする。
- `/ws` の handler を、受け口にそのまま登録しない（`paneId` を引数に取る handler を載せると、ほかの pane を指せる）。受け口の引数の schema からは `paneId` を除く。
- 新しいテーマの変数は足さない（17 テーマ分の値決めが要る）。既存の変数を `color-mix` で薄めて使う（`PaneFrame.vue` の先例）。
- 文言は日本語の直書き（i18n は無い）。サーバのエラーは、code から日本語を引く（`packages/client-core/src/net/clientError.ts`）ので、code を足したらそこにも足す。
- E2E は `pnpm build` の後に動く（ビルドした sodactl と web を使う）。
- `skill.test.ts` があるので、`USAGE_LINES` を変えたら SKILL.md も同じコミットで直す。

## design への申し送り（追補）

- 面の状態は、ask と同じ「購読して取る」型にする（名乗りが要る〔R4・D16〕・中身が大きいのでスナップショットに載せない〔R5〕）。
- 受け口に載せる操作は、引数から `paneId` を除き、handler が `ctx.paneId` だけを対象にする（R1）。出来事は「長く待つ要求」の繰り返しで受ける。
- 枠は、Markdown の枠（スクリプトは静的ページ自身のものだけ）を手本に、新しい静的ページを別のパスで作る（R2・D13）。枠が移ったことの検知と、専用の通り道を足す。
- 差し込み場所は `.pane-frame-body` の中（R3）。モバイルは `MobileShell.vue` に別の置き場。
- `soda handoff` では面を引き継がない（R6・D15）。
- 作業 B は、R9 を出発点にする。
