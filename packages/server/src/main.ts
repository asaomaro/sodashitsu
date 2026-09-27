#!/usr/bin/env node
import { bindFailureHint, defaultStateDir, ConfigError } from "./config.js";
import { composeServer } from "./composeServer.js";
import type { RawServeArgs } from "./config.js";
import { type CommandIo, runSessionDelete, runSessionList, runTokenReset } from "./sessionCommands.js";
import { applySessionEnv, parseArgs } from "./cliArgs.js";
import { OsNetworkInfo } from "./infra/OsNetworkInfo.js";
import { lastChanceTokenLines, startupLines } from "./startupBanner.js";
import { join, resolve } from "node:path";
import { PANE_HISTORY_FILE_NAME } from "./persist/PaneHistoryFile.js";
import { formatUrlHost } from "./util/net.js";
import { runHandoff } from "./handoff/handoffCommand.js";
import { runPreflightStage } from "./handoff/preflight.js";
import { createShutdown } from "./serveShutdown.js";
import { runSessionStop } from "./stop/stopCommand.js";
import { runBridge } from "./machine/bridgeCommand.js";
import { runMachineCommand } from "./machine/machineCommands.js";
import { MACHINE_USAGE } from "./machine/machineArgs.js";
import { runTuiCommand } from "./launch/tuiCommand.js";
import { placeholderEntry } from "./launch/placeholderEntry.js";

function printHelp(): void {
  console.log(
    [
      "soda [--session NAME] [--state-dir DIR] [--allow-nested]   (open the terminal UI; starts soda serve in the background if needed)",
      "soda serve [--host H] [--port P] [--cert FILE] [--key FILE] [--origin ORIGIN]...",
      "          [--state-dir DIR] [--session NAME] [--scrollback N] [--shell PATH] [--worktree-dir DIR] [--pane-history]",
      "soda token reset [--state-dir DIR] [--session NAME]",
      "soda session list [--state-dir DIR] [--json]",
      "soda session delete NAME [--state-dir DIR] [--json]",
      "soda session stop NAME [--state-dir DIR] [--json]",
      "soda handoff [--state-dir DIR] [--session NAME]",
      ...MACHINE_USAGE.split("\n"),
      "soda bridge [--session NAME] [--state-dir DIR]   (started by another machine over ssh)",
    ].join("\n"),
  );
}

async function runServe(args: RawServeArgs): Promise<void> {
  const server = await composeServer(args);
  const { sessionName, stateDir, sessionSource, portSource } = server.options;
  const sessionInfo =
    sessionName !== undefined
      ? { name: sessionName, stateDir, stateDirBase: args.stateDir !== undefined ? resolve(args.stateDir) : undefined, fromEnv: sessionSource === "env" }
      : undefined;
  // 名前付き session の記録したポート（20260926-named-session-ui の AC16）。表示と待ち受けの失敗の案内に添える。
  const remembered = portSource === "remembered" && sessionName !== undefined ? { port: server.options.port, sessionName } : undefined;
  const { host, port } = server.options;
  // **作った token は必ず一度表示する**（D102・D103）。token は bind の直後に作り auth.json に保存するので、この後に何が
  // 起きても——`listen()` の後段の失敗（最初のシェルを起動できない等）・成功した後の表示の組み立ての失敗（インタフェースの
  // 列挙の失敗等）・起動の途中の終了のシグナル——まだ表示していなければ、終わる前に token だけを表示する（次の起動では
  // 表示されない）。以前は `listen()` の catch の中でしか保証しておらず、成功した後の URL の組み立て（ゾーン付きの IPv6 で
  // `Invalid URL`）で token を失っていた。
  let tokenShown = false;
  const showTokenIfUnshown = (): void => {
    const token = server.freshToken;
    if (token === undefined || tokenShown) return;
    tokenShown = true;
    for (const line of lastChanceTokenLines(token, sessionInfo)) console.error(line);
  };

  // 終了のシグナル（SIGINT・SIGTERM・SIGHUP）は `listen()` の**前に**受け付ける（D103 の独立点検 #4）。以前は起動の表示の
  // 後に付けていたため、復元の途中で受けると既定の動作で即座に終わり、作った token を表示せず、ロックも残した。SIGHUP
  // （端末を閉じた・Windows ではコンソールを閉じた）は、以前はどこでも受けておらず、session.json を書かずロックを残して
  // 終わっていた——**Node は起動時にシグナルの扱いを既定に戻すので、`nohup` の下でも SIGHUP で終わる**（実測：`nohup` でも
  // 終了コード 129）ので、受けて閉じて終わる方がよい。起動の途中で受けたら、その段（復元等）を終えてから閉じる（`close()` と
  // `listen()` を並行させない——ロックを確実に放す）。もう一度受けたら待たずに終わる（残ったロックは次の起動が pid を見て
  // 取り直す）。
  // 手順の本体は `serveShutdown.ts`（止める指示 `soda session stop` と共有する。20260927-session-stop）。
  let startup: Promise<void> | undefined;
  const stopper = createShutdown({
    close: () => server.close(),
    startup: () => startup,
    showTokenIfUnshown,
    log: (line) => console.log(line),
    error: (...args) => console.error(...args),
    exit: (code) => process.exit(code),
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => stopper.signal(signal));
  // 制御の socket（handoff.sock）の止める指示（`soda session stop`）も同じ手順で止める。止まる途中の指示は何もしない（AC7）。
  server.onStopRequest((source) => stopper.stopRequest(source));

  let listening = false;
  try {
    try {
      startup = server.listen();
      await startup;
    } catch (err) {
      // 待ち受けの失敗（ポートが使用中・権限の無いポート・このマシンに無いアドレス・解決できない名前）だけを、案内つきの
      // 終了コード 2 にする（判定は `config.ts` の `bindFailureHint`）。同じ state-dir の soda が動いている（`soda.lock`）は
      // `listen()` が既に `ConfigError` にしている。それ以外（想定外の失敗）はそのまま投げる（終了コード 1。原因を
      // 握りつぶさない）。
      const hint = bindFailureHint(err, remembered);
      if (hint === undefined) throw err;
      throw new ConfigError(`cannot listen on ${formatUrlHost(host)}:${port}: ${(err as Error).message}`, hint);
    }
    listening = true;
    // 起動の途中で終了のシグナルを受けていたら、起動の表示は出さない（`shutdown` が閉じて終わる。token は finally で表示する）。
    if (stopper.shuttingDown) return;
    // ここまで来たら待ち受けに成功している。token 付きの URL はこの後にだけ表示する（D102）。表示する行は先に全部
    // 組み立てる（組み立ての失敗で、途中まで表示して終わらない）。`--origin` を先頭に、`0.0.0.0` / `::` のときは開ける
    // URL（localhost と LAN の IPv4）を並べる（`startupLines`・`accessUrls`。D101・D102）。
    const lines = startupLines({
      scheme: server.options.cert && server.options.key ? "https" : "http",
      host,
      port,
      extraOrigins: server.options.extraOrigins,
      lanAddresses: new OsNetworkInfo().lanAddresses(),
      freshToken: server.freshToken,
      session: sessionInfo,
      paneHistoryPath: server.options.paneHistory ? join(server.options.stateDir, PANE_HISTORY_FILE_NAME) : undefined,
      portRemembered: remembered !== undefined,
    });
    for (const line of lines) console.log(line);
    // 更新時の引き継ぎで起動したときの結果（20260926-live-handoff）。
    const handoff = server.handoffResult;
    if (handoff !== undefined) {
      console.log(`soda: handoff complete: ${handoff.adopted} pane(s) kept running`);
      if (handoff.dropped > 0) console.error(`soda: ${handoff.dropped} handed-off pane(s) could not be kept (see server.log)`);
    }
    tokenShown = true; // `startupLines` は作った token を必ず含む（URL が 1 つも無くても）
  } catch (err) {
    showTokenIfUnshown(); // close() を待つ前に表示する
    // 待ち受けた後の失敗（表示の組み立て等）では、待ち受けたまま・状態ディレクトリのロックを持ったまま終わらないよう
    // 閉じる（`listen()` 自身の失敗は `listen()` が後始末する）。
    if (listening && !stopper.shuttingDown) await server.close().catch(() => undefined);
    throw err;
  } finally {
    showTokenIfUnshown();
  }
}

const consoleIo: CommandIo = { out: (line) => console.log(line), err: (line) => console.error(line) };

async function main(): Promise<void> {
  try {
    // 引数の誤り（未知のオプション・値の無いオプション）も ConfigError として終了コード 2 にする（以前は try の外で
    // 投げていたため、スタックトレースつきの終了コード 1 になっていた。D102 の実物の CLI の確認で発見）。
    // `--session` が無ければ `SODA_SESSION`（serve・token reset だけ。20260926-named-session-ui）。
    const parsed = applySessionEnv(parseArgs(process.argv.slice(2)), process.env);
    if (parsed.command === "tui") {
      // 引数なしの `soda`（20260927-cli-mode）。端末版（`@sodashitsu/tui`）が出来るまでは、繋げたことを表示して終わる仮の入口（03-tui-core で差し替える）。
      process.exitCode = await runTuiCommand(parsed, placeholderEntry(consoleIo), { ...consoleIo, help: printHelp }, {
        isTty: process.stdin.isTTY === true && process.stdout.isTTY === true,
        env: process.env,
        cwd: process.cwd(),
        platform: process.platform,
        execPath: process.execPath,
        execArgv: process.execArgv,
        mainPath: process.argv[1]!,
      });
    } else if (parsed.command === "serve") {
      await runServe(parsed.serve);
    } else if (parsed.command === "token-reset") {
      await runTokenReset(parsed.stateDir ?? defaultStateDir(), parsed.session, consoleIo, parsed.sessionSource);
    } else if (parsed.command === "session-list") {
      process.exitCode = await runSessionList(parsed.stateDir ?? defaultStateDir(), parsed.json === true, consoleIo);
    } else if (parsed.command === "handoff") {
      process.exitCode = await runHandoff(parsed.stateDir ?? defaultStateDir(), parsed.session, consoleIo, parsed.sessionSource);
    } else if (parsed.command === "handoff-preflight") {
      runPreflightStage({ stage: parsed.preflightStage ?? 1, probe: parsed.preflightProbe });
    } else if (parsed.command === "session-stop") {
      process.exitCode = await runSessionStop(parsed.stateDir ?? defaultStateDir(), parsed.sessionTarget!, parsed.json === true, consoleIo);
    } else if (parsed.command === "bridge") {
      // ほかのマシンの `soda serve` が ssh の先で起動する（20260927-multi-host-machines）。標準入出力は中継の素通し。
      process.exitCode = await runBridge(
        { stateDir: parsed.stateDir ?? defaultStateDir(), session: parsed.session },
        { stdin: process.stdin, stdout: process.stdout, err: (line) => console.error(line) },
      );
    } else if (parsed.command === "machine") {
      process.exitCode = await runMachineCommand(parsed.machine!, parsed.stateDir ?? defaultStateDir(), consoleIo);
    } else if (parsed.command === "session-delete") {
      process.exitCode = await runSessionDelete(parsed.stateDir ?? defaultStateDir(), parsed.sessionTarget!, parsed.json === true, consoleIo);
    } else {
      printHelp();
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`soda: ${err.message}`);
      console.error(err.hint);
      process.exit(2);
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
