#!/usr/bin/env node
/**
 * `wtmctl` のエントリポイント（design.md「インターフェース/データ構造・コマンド一覧」）。
 * `parseArgs` → 対応する `commands/*` を呼ぶ → 例外は `reportAndExit` が終了コードへ変換する（T11）。
 */
import { parseArgs } from "./cliArgs.js";
import {
  runAgentGet,
  runAgentList,
  runAgentPrompt,
  runAgentRead,
  runAgentRename,
  runAgentSendKeys,
  runAgentWait,
} from "./commands/agent.js";
import { runAgentStart } from "./commands/agentStart.js";
import { runPaneAttach } from "./commands/attach.js";
import { runPaneControl, runPaneObserve } from "./commands/sessionStream.js";
import { runTabClose, runTabCreate } from "./commands/tab.js";
import { runPaneClose, runPaneInput, runPaneRead, runPaneRun, runPaneSplit } from "./commands/pane.js";
import { runLogin, runSnapshot, runWatch } from "./commands/session.js";
import { runWorkspaceClose, runWorkspaceCreate, runWorkspaceRename } from "./commands/workspace.js";
import { reportAndExit } from "./output.js";
import { FsSessionStore } from "./session.js";

function printHelp(): void {
  console.log(
    [
      "wtmctl login --url <URL> --token <TOKEN>",
      "wtmctl workspace create [--cwd <path>] [--label <text>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl workspace close <workspaceId> [--url <URL>] [--token <TOKEN>]",
      "wtmctl workspace rename <workspaceId> <label> [--url <URL>] [--token <TOKEN>]",
      "wtmctl tab create [--workspace <id>] [--label <text>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl tab close <tabId> [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane split <paneId> --direction right|down [--ratio <0.05-0.95>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane close <paneId> [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane input <paneId> <text> [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane run <paneId> <command> [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane read <paneId> [--follow] [--raw] [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane attach <paneId> [--takeover] [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane observe <paneId> [--url <URL>] [--token <TOKEN>]",
      "wtmctl pane control <paneId> [--takeover] [--cols <N>] [--rows <N>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl snapshot [--url <URL>] [--token <TOKEN>]",
      "wtmctl watch [--json] [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent list [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent get <target> [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent wait <target> [--until working|blocked|idle|done|unknown]... [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent read <target> [--lines <N>] [--raw] [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent prompt <target> <text> [--wait] [--until working|blocked|idle|done|unknown]... [--timeout <ms>] [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent send-keys <target> <key>... [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent rename <target> <name>|--clear [--url <URL>] [--token <TOKEN>]",
      "wtmctl agent start <name> --kind <KIND> --pane <paneId> [--timeout <ms>] [--url <URL>] [--token <TOKEN>] [-- <args>...]",
      "",
      "環境変数: WTMCTL_URL（既定 http://127.0.0.1:7780）・WTMCTL_TOKEN",
      "",
      "pane input/pane run は、実プロセスへ実際に届いたことまでは保証しません（INPUT フレームに ack はありません）。",
      "agent の <target> は pane ID か、agent rename で付けた名前です（名前は英小文字で始まる 1〜32 文字の [a-z0-9_-]）。",
      "agent wait は --until 省略時 idle/done/blocked のどれかで返り、--timeout 省略時は無期限に待ちます。",
      "agent prompt は bracketed paste のモードに合わせて本文を送り、300ms 後に Enter で確定します（blocked なら送りません）。",
      "--wait は送信後 5 秒以内に working/blocked を観測できなければ agent_prompt_stalled で終わります。",
      "pane attach は手元の端末をその pane に直結します。Ctrl+B q で切り離し、Ctrl+B Ctrl+B で Ctrl+B を送ります。",
      "同じ pane に直結できるのは 1 つだけで、--takeover で既存の直結を奪えます。",
      "pane observe は pane の画面を 1 行 1 記録の JSON（terminal.frame・最後に terminal.closed）で stdout へ流します（閲覧専用）。",
      "pane control は同じ記録を流し、stdin の 1 行 1 コマンドの JSON（terminal.input/resize/release）で操作します",
      "（既定 120x40・1〜1000。所有者は pane attach と共通で 1 つ、--takeover で奪えます）。",
      "agent start は前面がシェル自身だけの pane（sh/bash/dash/zsh/ksh/mksh）に、--kind の決まった実行ファイルと -- の後の引数を",
      "単一引用符で包んで打ち込み、名前を付けて idle になるまで待ちます（既定 30 秒。blocked なら agent_not_ready）。",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv.slice(2));
  if (cmd.kind === "help") {
    printHelp();
    return;
  }
  const store = new FsSessionStore();
  switch (cmd.kind) {
    case "login":
      return runLogin(cmd, store);
    case "workspace-create":
      return runWorkspaceCreate(cmd, store);
    case "workspace-close":
      return runWorkspaceClose(cmd, store);
    case "workspace-rename":
      return runWorkspaceRename(cmd, store);
    case "tab-create":
      return runTabCreate(cmd, store);
    case "tab-close":
      return runTabClose(cmd, store);
    case "pane-split":
      return runPaneSplit(cmd, store);
    case "pane-close":
      return runPaneClose(cmd, store);
    case "pane-input":
      return runPaneInput(cmd, store);
    case "pane-run":
      return runPaneRun(cmd, store);
    case "pane-read":
      return runPaneRead(cmd, store);
    case "pane-attach":
      return runPaneAttach(cmd, store);
    case "pane-observe":
      return runPaneObserve(cmd, store);
    case "pane-control":
      return runPaneControl(cmd, store);
    case "snapshot":
      return runSnapshot(cmd, store);
    case "watch":
      return runWatch(cmd, store);
    case "agent-list":
      return runAgentList(cmd, store);
    case "agent-get":
      return runAgentGet(cmd, store);
    case "agent-wait":
      return runAgentWait(cmd, store);
    case "agent-read":
      return runAgentRead(cmd, store);
    case "agent-prompt":
      return runAgentPrompt(cmd, store);
    case "agent-send-keys":
      return runAgentSendKeys(cmd, store);
    case "agent-rename":
      return runAgentRename(cmd, store);
    case "agent-start":
      return runAgentStart(cmd, store);
    default: {
      // 網羅性チェック：`Command` に新しい種類が足されたのにここへ分岐を足し忘れると、ここで型エラーになる
      // （coding のタスク横断点検で見つけた——`switch` 単体では TS は非網羅を黙って許す。この tsconfig は
      // `noImplicitReturns` を有効にしていないため）。
      const exhaustive: never = cmd;
      throw new Error(`unhandled command: ${JSON.stringify(exhaustive)}`);
    }
  }
}

main().catch((err: unknown) => {
  reportAndExit(err);
});
