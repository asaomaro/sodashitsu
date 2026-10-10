import type { Action, KeyDecision } from "@sodashitsu/client-core";

/**
 * グラフの上の端末の窓にフォーカスがあるとき、端末の道（`KeyInputController.handleTerminalKey`）で通す操作（20261008-graph-first の X2。PR2a）。
 * 窓の下には、見えない基本画面がある。**そこの pane・tab・分割・workspace の構成を変える操作と、選んでいる pane を別の pane へ動かす操作は食う**
 * （何もしない・端末にも届かない）。窓の pane は、窓を開いたときに「選んでいる pane」になっている（X6）ので、その pane を対象にする操作（コピー・スクロールバックを開く・
 * サブエージェントの一覧）は通す。`Action` の型を `never` で網羅する switch で書く——操作を足したときに、ここを決め忘れない（型エラーになる）。
 * 一覧と理由は decisions.md の D75。
 */
export function isAllowedInTerminalWindow(decision: KeyDecision): boolean {
  switch (decision.kind) {
    case "pass": // 通常の入力（文字・Esc・矢印・Ctrl…）は、その pane へ
    case "consume":
    case "send": // prefix の二度押し（端末の道では、窓の pane へ prefix の列を送る）
      return true;
    case "action":
      return isAllowedAction(decision.action);
  }
}

function isAllowedAction(action: Action): boolean {
  switch (action.type) {
    // --- 通す: その pane への操作・全体の操作 -------------------------------------------------------------------------
    case "copy":
    case "exitMode":
    case "pasteImage":
    case "editScrollback":
    case "showSubagents":
    case "help":
    case "settings":
    case "toggleSidebar":
    case "toggleSidebarSection":
    case "reloadConfig":
    case "detach":
    case "stopServer":
    case "openNotificationHistory":
      return true;
    // copy モードには入れる（窓の pane が選ばれている）。resize・navigate は基本画面のレイアウト・選択を動かすので食う。
    case "enterMode":
      return action.mode === "copy";
    // --- 食う: 構成を変える ------------------------------------------------------------------------------------------
    case "split":
    case "closePane":
    case "swap":
    case "swapWithFocused":
    case "zoom":
    case "renamePane":
    case "resizeBy":
    case "newTab":
    case "closeTab":
    case "renameTab":
    case "moveTab":
    case "newWorkspace":
    case "closeWorkspace":
    case "renameWorkspace":
    case "moveWorkspace":
    case "newWorktree":
    case "openWorktree":
    case "removeWorktree":
      return false;
    // --- 食う: 選んでいる pane を別の pane へ動かす（窓の下は別の pane になってしまう）--------------------------------------
    case "focusDir":
    case "cyclePane":
    case "lastPane":
    case "agentDelta":
    case "focusAgentIndex":
    case "tabDelta":
    case "tabIndex":
    case "goto":
    case "nextNotification":
    case "workspaceIndex":
    case "workspaceDelta":
    case "navigate":
      return false;
    // --- 食う: 基本画面の中のもの（窓には出ない・画面を移す）---------------------------------------------------------------
    case "displayMenu":
    case "focusDisplay":
    case "showUsage": // 利用状況の窓は基本画面の pane に付く（20261010-agent-usage PR4）。窓の下は見えない基本画面なので出さない
    case "runCommand":
    case "openGraph": // 窓にフォーカスがあるとき、グラフの面へ戻る操作に読み替える（`main.ts`）。ここへ来る前に処理される
      return false;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
