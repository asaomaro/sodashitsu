import type { ForkNoteStatus, ForkUnavailableReason, Pane } from "@sodashitsu/protocol";
import { isForkSessionId } from "@sodashitsu/protocol";

/**
 * エージェントの fork の画面の、判定と文言（20261009-agent-fork PR2。純関数）。サーバの `agent.fork_preview` が正だが、メニューは同期で項目を作るので、
 * pane が持つ値（`agent`・`agentSession`）から、同じ種類の理由を先に導く（確かめ切れないもの〔シェル・git〕はダイアログがプレビューで見せる）。
 */
export type ForkMenuReason = ForkUnavailableReason | "remote";

export function forkUnavailableReason(pane: Pane | undefined, local: boolean): ForkMenuReason | null {
  if (!local) return "remote";
  if (pane === undefined) return "pane_not_found";
  if (pane.agent === null) return "no_agent";
  if (pane.agent.kind !== "claude") return "not_claude";
  const session = pane.agentSession;
  if (session === null || session.kind !== "claude") return "no_session_id";
  if (!isForkSessionId(session.sessionId)) return "bad_session_id";
  return null;
}

export function forkReasonText(reason: ForkMenuReason): string {
  switch (reason) {
    case "pane_not_found":
      return "pane が見つかりません";
    case "no_agent":
      return "エージェントが検出されていません（Claude Code を起動した pane だけ fork できます）";
    case "not_claude":
      return "Claude Code だけ fork できます";
    case "no_session_id":
      return "会話の id が分かりません（設定の「エージェント連携」でフックを入れて、エージェントを起動し直してください）";
    case "bad_session_id":
      return "会話の id の形が正しくないため、fork できません";
    case "unsupported_shell":
      return "この pane のシェルでは、fork できません（POSIX 系のシェルだけ）";
    case "remote":
      return "別のマシンの pane は fork できません";
  }
}

/** 最初の知らせの状態の文言。 */
export function noteStatusText(status: ForkNoteStatus | undefined, reason?: string): string {
  switch (status) {
    case "off":
      return "最初の知らせは、送りません。";
    case "pending":
      return "最初の知らせを、まだ送っていません（入力欄を待っています）。";
    case "sent":
      return "最初の知らせを送りました。";
    case "skipped":
      return `最初の知らせは、送りませんでした${reason ? `（${reason}）` : ""}。`;
    case "timed_out":
      return "最初の知らせは、待ちが切れて（10 分）、送れませんでした。";
    case undefined:
      return "";
  }
}

/** 進み具合の段階の文言。 */
export function stageText(stage: string): string {
  switch (stage) {
    case "starting":
      return "新しい pane を作って、起動しています…";
    case "pane_created":
      return "新しい pane を作りました。";
    case "launched":
      return "起動のコマンドを打ち込みました。エージェントが立ち上がるのを待っています…";
    case "detected":
      return "エージェントを検出しました。手が空くのを待っています…";
    case "ready":
      return "エージェントの手が空きました。";
    case "note":
      return "最初の知らせの状態が変わりました。";
    case "done":
      return "fork しました。";
    case "failed":
      return "fork に失敗しました。";
    default:
      return "";
  }
}
