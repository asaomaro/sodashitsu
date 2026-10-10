import type { Action, KeyDecision } from "@sodashitsu/client-core";

/**
 * デスクトップで基本画面以外の画面（グラフ・ダッシュボード）が出ている間、その画面の面の外（サイドバー・`body`）にフォーカスがあるときの keydown（`main.ts` の `window` の listener）で通す操作
 * （20261008-graph-first の D52。画面が増えて「グラフの画面」から「基本画面以外」へ一般化した: 20261010-agent-usage PR3）。基本画面は `inert` で見えないので、その pane・tab・分割を変える操作と、フォーカス中の pane へ向かう操作は食う（何もしない・端末にも届かない）。
 * 通すのは「画面の切り替え・設定・ヘルプ・サイドバーの操作・通知の一覧」など、グラフの画面で意味のあるものだけ。一覧と理由は decisions.md の D52。
 */
export function isAllowedOnNonBaseScreen(decision: KeyDecision): boolean {
  switch (decision.kind) {
    case "pass": // 入力欄などの通常の操作（サイドバーの名前の変更など）。端末は inert で受けない
      return true;
    case "consume":
      return true;
    case "send": // prefix の二度押し（フォーカス中の pane へ prefix の列を送る）は、見えない端末へ向かうので食う
      return false;
    case "action":
      return isAllowedAction(decision.action);
  }
}

function isAllowedAction(action: Action): boolean {
  switch (action.type) {
    case "openGraph":
    case "settings":
    case "help":
    case "goto":
    case "toggleSidebar":
    case "toggleSidebarSection":
    case "nextNotification":
    case "openNotificationHistory":
    case "exitMode":
    case "workspaceDelta":
    case "workspaceIndex":
    case "detach":
    case "stopServer":
    case "reloadConfig":
      return true;
    case "enterMode":
      return action.mode === "navigate";
    case "navigate":
      return action.op !== "paneDir";
    default:
      return false;
  }
}
