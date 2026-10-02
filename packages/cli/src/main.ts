#!/usr/bin/env node
/**
 * `sodactl` のエントリポイント（design.md「インターフェース/データ構造・コマンド一覧」）。
 * `parseArgs` → 対応する `commands/*` を呼ぶ → 例外は `reportAndExit` が終了コードへ変換する（T11）。
 */
import { parseArgs, MACHINE_USAGE_LINE, USAGE_LINES } from "./cliArgs.js";
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
import { runAsk } from "./commands/ask.js";
import { runGraph } from "./commands/graph.js";
import { runPaneAttach } from "./commands/attach.js";
import { runPaneControl, runPaneObserve } from "./commands/sessionStream.js";
import { runTabClose, runTabCreate } from "./commands/tab.js";
import { runPaneClose, runPaneCurrent, runPaneInput, runPaneRead, runPaneReportMetadata, runPaneRun, runPaneSplit } from "./commands/pane.js";
import { runLogin, runSnapshot, runWatch } from "./commands/session.js";
import { runWorkspaceClose, runWorkspaceCreate, runWorkspaceRename, runWorkspaceReportMetadata } from "./commands/workspace.js";
import { reportAndExit } from "./output.js";
import { FsSessionStore } from "./session.js";
import { runSkill } from "./skill.js";

function printHelp(): void {
  console.log(
    [
      // 一覧は `cliArgs.ts` の `USAGE_LINES`（skill ファイルとの食い違いの検査も同じものを見る。20260926-agent-skill-file）。
      ...USAGE_LINES,
      MACHINE_USAGE_LINE,
      "",
      "環境変数: SODACTL_URL（無ければ SODA_SERVER_URL、それも無ければ http://127.0.0.1:7780）・SODACTL_TOKEN",
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
      "pane の中（SODA_PANE_ID と SODA_SERVER_URL があり、そのサーバにつなぐとき）は、自分の pane とそれを含む tab・workspace を閉じる・",
      "入力する・直結する・エージェントを動かす操作を self_target で断ります（SODA_PANE_ID を空にすると効きません。--machine で別のマシンへ送るときも効きません）。",
      "pane split・pane current の対象を省くと、pane の中では呼び出し元の pane（SODA_PANE_ID）、外ではサーバのフォーカスの pane です。",
      "--current は呼び出し元の pane を明示します（SODA_PANE_ID が要ります。local 以外の --machine とは使えません）。接続先がその pane のサーバだと",
      "確かめられないとき（SODACTL_URL・--url が別の名前等）は caller_pane_unknown で断ります。同じサーバだと分かっていれば --pane で ID を渡し、",
      "そうでなければ SODACTL_URL・--url を外して SODA_SERVER_URL につないでください。",
      "pane current は pane の今の tabId・workspaceId を返します（pane を移しても古くなりません）。",
      "graph は連携のグラフ（ブラウザのグラフ画面と同じもの）を表で見て、変えます（--json で JSON）。link add は端の pane が載っていなければ一緒に載せます。",
      "graph の変更が画面など他の変更とぶつかった（rev_conflict）ときは、取り直して 1 回だけ送り直します。",
      "ask は pane の中のプログラムの質問のフォームを、その pane を見ているブラウザの画面に出し、答えを stdout に 1 行の JSON で返します",
      "（定義は標準入力。status は answered・cancelled・timeout・unavailable で、どれも終了コード 0。--timeout は 1000〜86400000 ミリ秒、既定 540000）。",
      "同じ pane の質問は同時に 1 つだけ（ask_busy）。pane の外・別のマシン（--machine）からは使えません。",
      "sodactl skill はエージェントに sodactl の使い方を教える Markdown（skill ファイル）を出します。",
      "workspace/pane report-metadata はサイドバーの行の $名前 に出す独自トークンを設定（--token NAME=VALUE）・消去（--clear-token NAME）します。",
      "--token は値が = を含めば独自トークン、含まなければ接続の token です。値は前後の空白と制御文字を除いて 80 文字まで、空なら消去。",
      "--seq を付けると同じ --source の古い報告を無視し、--ttl-ms（1〜86400000）で期限が来ると消えます。値はサーバのメモリだけに持ちます。",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv.slice(2));
  if (cmd.kind === "help") {
    printHelp();
    return;
  }
  if (cmd.kind === "skill") return runSkill(); // サーバへつながない（セッションのキャッシュも読まない）
  const store = new FsSessionStore();
  switch (cmd.kind) {
    case "login":
      return runLogin(cmd, store);
    case "ask":
      return runAsk(cmd, store);
    case "workspace-create":
      return runWorkspaceCreate(cmd, store);
    case "workspace-close":
      return runWorkspaceClose(cmd, store);
    case "workspace-rename":
      return runWorkspaceRename(cmd, store);
    case "workspace-report-metadata":
      return runWorkspaceReportMetadata(cmd, store);
    case "tab-create":
      return runTabCreate(cmd, store);
    case "tab-close":
      return runTabClose(cmd, store);
    case "pane-split":
      return runPaneSplit(cmd, store);
    case "pane-current":
      return runPaneCurrent(cmd, store);
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
    case "pane-report-metadata":
      return runPaneReportMetadata(cmd, store);
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
    case "graph":
      return runGraph(cmd, store);
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
