# 調査: サブエージェントの起動・終了をフックで受け取る（20261004-subagent-display）

## 実物で確かめたこと（主エージェントが実行。Claude Code 2.1.289・2026-10-04）

隔離した設定（`claude -p … --settings <一時の settings.json>`。利用者の設定は変えていない）に、`SubagentStart`・`SubagentStop`・`PreToolUse`（matcher `Agent|Task`）・`PostToolUse`（同）・`Stop` のフックを置き、stdin の JSON を記録した。Agent ツールで general-purpose のサブエージェントを 2 つ（前面 1・バックグラウンド 1）起動させた。

- F-H1 **`SubagentStart`**: 項目は `agent_id`・`agent_type`・`cwd`・`hook_event_name`・`prompt_id`・`session_id`・`transcript_path`。**短い説明（description）は入っていない。**前面でもバックグラウンドでも発火する。
- F-H2 **`SubagentStop`**: `agent_id`・`agent_type`・`agent_transcript_path`・`last_assistant_message`・`background_tasks`（`[{id, type:"subagent", status, …}]`）・`session_crons`・`stop_hook_active`・`session_id`・`prompt_id` ほか。`agent_id` は `SubagentStart` と同じ値。前面・バックグラウンドの両方で 1 回ずつ発火した。
- F-H3 **`PreToolUse`（Agent）**: `tool_name: "Agent"`・`tool_use_id`・`tool_input`（`description`・`prompt`・`subagent_type`・`run_in_background`）・`session_id`・`prompt_id`。**`agent_id` は入っていない。**発火の順は `PreToolUse` → `SubagentStart`（同じ `prompt_id`）。
- F-H4 **`PostToolUse`（Agent）**: 前面の実行では完了後に発火し、`tool_response` に `agentId`・`agentType`・`status: "completed"`・`totalDurationMs` 等。`tool_input` も入る（`description` と `agentId` が同じ電文に揃う）。バックグラウンドの実行の `PostToolUse` は、記録が別のフックの書き込みと混ざって読めなかった（**未確認**: 起動直後に発火し `agentId` を含むと推測されるが、確かめ直す）。
- F-H5 **`Stop`**: `background_tasks`（その時点で動いているバックグラウンドのタスクの一覧）を含む。
- F-H6 **環境変数**: フックのプロセスに `SODA_PANE_ID` が引き継がれていた（pane の中で動かした `claude` のフック）。
- F-H7 フックは並行して走る（複数のフックが同じファイルへ同時に書くと混ざった）。報告は 1 回の書き込みで送る必要がある。
- F-H8 ツール名は `Agent`（matcher `Agent|Task` で拾えた。`Task` という名前のツール呼び出しは観測していない）。

## 公式ドキュメントで確かめたこと（委譲。claude-code-guide）

- `SubagentStart`（サブエージェントが起動したとき）・`SubagentStop`（終わったとき）・`TaskCreated`・`TaskCompleted`・`TeammateIdle` がフックのイベントとして載っている（https://code.claude.com/docs/en/hooks-guide.md）。`SubagentStart`／`SubagentStop` の matcher はエージェントの種類（`general-purpose`・`Explore`・`Plan`・独自の名前）。
- 設定の形は `{"hooks": {"<Event>": [{"matcher": "…", "hooks": [{"type": "command", "command": "…", "async": …, "timeout": …}]}]}}`。`async: true` は応答を待たせない。
- **文書では未確認**: 強制終了・クラッシュのときに `SubagentStop`／`SessionEnd` が発火するか。Workflow ツールのエージェントに固有のフック（`Workflow` のツール呼び出しとして `PreToolUse`／`PostToolUse` で拾う）。ほかのエージェント（Codex・Cursor・Gemini 等）のサブエージェントのフック。

## 表示に使える最小の組み合わせ

- 件数: `SubagentStart` で +1、`SubagentStop` で −1（`agent_id` で対応づける）。
- 短い説明と種類: `PreToolUse`（Agent）の `tool_input.description`・`subagent_type`・`run_in_background` を、直後の `SubagentStart` に順序で対応づける（同じ `session_id`・`prompt_id`。対応づけに失敗しても件数は正しい）。
- 取りこぼしの後始末: エージェントが居なくなった・入れ替わったら一覧を消す。`Stop` の `background_tasks` で動いているものと突き合わせて直す余地がある。

## 既存の実装（調査中。委譲の結果をここへ足す）

（フック連携の現状・受け口・画面の該当箇所は、調査の結果が届いたら追記する。）
