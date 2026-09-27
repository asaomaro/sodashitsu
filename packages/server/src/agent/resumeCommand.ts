import type { AgentIntegrationKind } from "@sodashitsu/protocol";

/**
 * 会話/セッション ID として許す文字だけを通す（英数字・`-`・`_`・`.`・`/`）。Claude Code・Codex とも
 * UUID 形式が基本だが、Claude Code は名前・絶対パスでの指定も許すため広めに取る（research.md F3.1）。
 * ここを外れる値は、report 経路（hook からの JSON。信頼できない入力）が壊れている・細工されている
 * 可能性があるとみなし、シェルへそのまま書き込まない（コマンドインジェクション対策。非機能要件「報告経路の
 * 安全性」）。
 */
const SAFE_SESSION_ID = /^[A-Za-z0-9._/-]+$/;

/**
 * サーバ再起動後の復元で、pane に投入する再開コマンドの組み立て（20260923-agent-session-resume
 * design「6. フック登録の書式」）。対応するのは公式フック連携を持つ Claude Code・Codex の2種のみ
 * （research.md F1.2 の herdr resume コマンド表のうち、この2種だけを対象にする。decisions.md D1）。
 *
 * `kind` が未知（将来の永続化データ・手編集等）・`sessionId` が想定外の文字を含む場合は `undefined` を
 * 返す——呼び出し側はその pane を現状どおりプレーンなシェルのままにする（AC4・AC6 のフォールバック）。
 */
export function resumeCommandFor(kind: string, sessionId: string): string | undefined {
  if (!SAFE_SESSION_ID.test(sessionId)) return undefined;
  switch (kind as AgentIntegrationKind) {
    case "claude":
      return `claude --resume ${sessionId}`;
    case "codex":
      return `codex resume ${sessionId}`;
    // 20260923-other-agents-session-resume（research.md F2・decisions D3）。
    case "cursor":
      return `cursor-agent --resume ${sessionId}`;
    case "copilot":
      return `copilot --resume=${sessionId}`;
    case "devin":
      return `devin --resume ${sessionId}`;
    case "droid":
      return `droid --resume ${sessionId}`;
    case "grok":
      return `grok --resume ${sessionId}`;
    case "qwen":
      return `qwen --resume ${sessionId}`;
    default:
      return undefined;
  }
}
