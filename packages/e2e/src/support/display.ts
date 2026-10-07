import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";
import { getFreePort } from "./freePort.js";

/**
 * 表示の面（`sodactl display`。20261007-soda-extensions）の E2E の道具。
 * - `runDisplay`: ビルドした `sodactl`（`packages/cli/dist/main.js`）を、pane の中と同じ環境変数で子プロセスとして起動する。既定は**ログインなし**
 *   （テストのサーバの `pane.sock` を `SODA_PANE_SOCKET` で渡す）。走らせた人の環境の値は消す（`support/ask.ts` と同じ）。
 * - `watchSentDisplay`: ブラウザが送った `display.action`・`display.report` を CDP で記録する（テストの接続ではなく、ブラウザの側）。
 * - `startSink`: `127.0.0.1` の別のポートの待ち受け（外への通信・移動の宛先。届いた要求を記録する）。**本物の外のホストへは出さない**。
 */
const CLI_MAIN = fileURLToPath(new URL("../../../cli/dist/main.js", import.meta.url));

export interface DisplayRun {
  child: ChildProcess;
  done: Promise<{ code: number | null; stdout: string; stderr: string; json: unknown; lines: unknown[] }>;
  finished(): boolean;
  /** 標準出力の次の 1 行（JSON）を待つ。`events` のような出し続けるコマンド用。 */
  nextLine(timeoutMs?: number): Promise<Record<string, unknown>>;
  /** 標準入力を閉じる前に書く（`stdin` を指定しなかったときだけ使える）。 */
  kill(): void;
}

export interface RunDisplayOpts {
  /** 標準入力に渡す中身（`--format` と組で使う）。 */
  stdin?: string;
  /** `true` でログイン済みの経路（`--token`・`SODACTL_TOKEN`）。省くとログインなしの受け口。 */
  login?: boolean;
}

export async function runDisplay(appServer: AppServer, paneId: string, args: string[], opts: RunDisplayOpts = {}): Promise<DisplayRun> {
  const home = await mkdtemp(join(tmpdir(), "soda-e2e-display-"));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, SODA_PANE_ID: paneId, SODA_SERVER_URL: appServer.origin };
  delete env["SODA_PANE_SOCKET"];
  delete env["SODA_AGENT_REPORT_SOCKET"];
  delete env["SODACTL_TOKEN"];
  delete env["SODACTL_URL"];
  const full = ["display", ...args];
  if (opts.login === true) {
    full.push("--token", appServer.token);
    env["SODACTL_TOKEN"] = appServer.token;
  } else {
    env["SODA_PANE_SOCKET"] = join(appServer.stateDir, "pane.sock");
  }
  const child = spawn(process.execPath, [CLI_MAIN, ...full], { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let finished = false;
  const waiters: (() => void)[] = [];
  let consumed = 0;
  child.stdout!.on("data", (d: Buffer) => {
    stdout += d.toString("utf8");
    for (const w of waiters.splice(0)) w();
  });
  child.stderr!.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
  if (opts.stdin !== undefined) child.stdin!.end(opts.stdin);
  else child.stdin!.end();
  const done = new Promise<{ code: number | null; stdout: string; stderr: string; json: unknown; lines: unknown[] }>((resolve) => {
    child.on("close", (code) => {
      finished = true;
      void rm(home, { recursive: true, force: true });
      const lines: unknown[] = [];
      for (const l of stdout.split("\n")) {
        if (l.trim() === "") continue;
        try {
          lines.push(JSON.parse(l));
        } catch {
          // JSON でない行は無視する
        }
      }
      resolve({ code, stdout, stderr, json: lines[0], lines });
    });
  });
  const completeLines = (): string[] => {
    const parts = stdout.split("\n");
    parts.pop(); // 最後の（改行で終わっていない）断片は完全でない
    return parts.filter((l) => l.trim() !== "");
  };
  return {
    child,
    done,
    finished: () => finished,
    kill: () => void child.kill(),
    async nextLine(timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const lines = completeLines();
        if (lines.length > consumed) return JSON.parse(lines[consumed++]!) as Record<string, unknown>;
        if (finished) throw new Error(`display exited before the next line (stderr: ${stderr})`);
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`timed out waiting for the next line of display output (got ${consumed}; stderr: ${stderr})`);
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, Math.min(left, 100));
          waiters.push(() => {
            clearTimeout(t);
            resolve();
          });
        });
      }
    },
  };
}

export interface SentDisplay {
  actions(): { id: string; rev: number; action: string; data?: Record<string, string> }[];
  reports(): { id: string; problem: string; paneId?: string; format?: string }[];
}

/** ブラウザが送った `display.action`・`display.report`（このページを開いてからの累計）。**`page.goto()` の前に `await` して呼ぶ**。 */
export async function watchSentDisplay(page: Page): Promise<SentDisplay> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const actions: ReturnType<SentDisplay["actions"]> = [];
  const reports: ReturnType<SentDisplay["reports"]> = [];
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { method?: string; params?: never };
      if (msg.method === "display.action") actions.push(msg.params as never);
      else if (msg.method === "display.report") reports.push(msg.params as never);
    } catch {
      // JSON でないフレームは無視する
    }
  });
  return { actions: () => [...actions], reports: () => [...reports] };
}

/** ブラウザが `display.subscribe` の応答を受けた回数を数える（名乗り済みの印）。**`page.goto()` の前に `await` して呼ぶ**。 */
export async function watchDisplaySubscriptions(page: Page): Promise<{ waitFor(n: number, timeoutMs?: number): Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const requested = new Set<string>();
  let answered = 0;
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { id?: string; method?: string };
      if (msg.method === "display.subscribe" && msg.id !== undefined) requested.add(msg.id);
    } catch {
      // 無視
    }
  });
  cdp.on("Network.webSocketFrameReceived", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { id?: string; result?: unknown };
      if (msg.id !== undefined && requested.has(msg.id) && msg.result !== undefined) {
        requested.delete(msg.id);
        answered++;
      }
    } catch {
      // 無視
    }
  });
  return {
    async waitFor(n, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (answered < n) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for display.subscribe #${n} (got ${answered})`);
        await new Promise((r) => setTimeout(r, 25));
      }
    },
  };
}

export interface Sink {
  origin: string;
  /** 届いた要求の URL（`/…`）。 */
  requests(): string[];
  close(): Promise<void>;
}

/** `127.0.0.1` の空きポートで待ち受け、届いた要求を記録する（枠の中から外へ出ようとした要求の宛先に使う）。 */
export async function startSink(): Promise<Sink> {
  const port = await getFreePort();
  const seen: string[] = [];
  const server: Server = createServer((req, res) => {
    seen.push(req.url ?? "");
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>sink</title>");
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${port}`,
    requests: () => [...seen],
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
