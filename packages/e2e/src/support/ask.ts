import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type { AppServer } from "./appServer.js";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）の E2E の道具。
 * - `runAsk`: ビルドした `sodactl`（`packages/cli/dist/main.js`）を、pane の中と同じ環境変数（`SODA_PANE_ID`・`SODA_SERVER_URL`）で子プロセスとして起動する。
 *   セッションのキャッシュは使い捨ての `HOME` に置く（利用者の `~/.sodactl` に触れない）。
 * - `runAskWithoutLogin`: 同じだが token を渡さない（`--token`・`SODACTL_TOKEN` なし・キャッシュの無い `HOME`）。代わりにテストのサーバの
 *   ログイン不要の受け口（`<状態ディレクトリ>/pane.sock`）のパスを `SODA_PANE_SOCKET` で渡す（20261003-sodactl-ask-socket。pane の中の環境と同じ）。
 * - `watchAskSubscriptions`: ブラウザ自身が `ask.subscribe` を送って応答を受けたこと（＝「質問を出せる画面」として登録済み）を CDP で数える。
 *   `sodactl ask` はその前に打つと `unavailable` になるので、打つ前にここで待つ（テストのクライアントに届いたイベントをブラウザの反映の合図にしない）。
 */
const CLI_MAIN = fileURLToPath(new URL("../../../cli/dist/main.js", import.meta.url));
export const ASK_FIXTURE_PATH = fileURLToPath(new URL("../../../protocol/src/ask.fixture.json", import.meta.url));

/** 確かめ用の定義（ask-form の `generate.py --ask-spec` の出力。7 問・テーマ 13 件・出し分け 2 つ）。 */
export async function askFixture(): Promise<{ questions: { id: string; options: { value: string; label: string }[]; default?: string }[] }> {
  return JSON.parse(await readFile(ASK_FIXTURE_PATH, "utf8")) as never;
}

export interface AskRun {
  child: ChildProcess;
  /** プロセスが終わるまで待つ。 */
  done: Promise<{ code: number | null; stdout: string; stderr: string; json: unknown }>;
  /** 終わっていれば true。 */
  finished(): boolean;
}

export async function runAsk(appServer: AppServer, paneId: string, spec: unknown, args: string[] = []): Promise<AskRun> {
  return spawnAsk(appServer, paneId, spec, ["--token", appServer.token, ...args], { SODACTL_TOKEN: appServer.token });
}

/**
 * ログインなしで `sodactl ask` を起動する（token をどこにも渡さない）。受け口を通らなければ `unauthenticated`（終了コード 1）になる。
 * 受け口は Unix ドメイン socket なので、Windows では使えない（sodactl も使わない）。
 */
export async function runAskWithoutLogin(
  appServer: AppServer,
  paneId: string,
  spec: unknown,
  args: string[] = [],
  /** `paneSocket: false` は受け口のパスも渡さない（陰性対照: ログインが要る今までの経路になる）。 */
  opts: { paneSocket?: boolean } = {},
): Promise<AskRun> {
  const extraEnv = opts.paneSocket === false ? {} : { SODA_PANE_SOCKET: join(appServer.stateDir, "pane.sock") };
  return spawnAsk(appServer, paneId, spec, args, extraEnv);
}

async function spawnAsk(appServer: AppServer, paneId: string, spec: unknown, args: string[], extraEnv: NodeJS.ProcessEnv): Promise<AskRun> {
  const home = await mkdtemp(join(tmpdir(), "soda-e2e-ask-"));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, SODA_PANE_ID: paneId, SODA_SERVER_URL: appServer.origin };
  // E2E を soda の pane の中で走らせると、その pane のサーバ（開発者の本物のサーバ）の受け口のパスが `process.env` にある。
  // 子の sodactl へ渡すと、テストのサーバではなくそちらへ繋ぎに行く（質問が開発者の画面に出る）ので外す（20261003-sodactl-ask-socket）。
  // 走らせた人の環境の token・接続先も渡さない（渡すものは `extraEnv` だけ）。
  delete env["SODA_PANE_SOCKET"];
  delete env["SODA_AGENT_REPORT_SOCKET"];
  delete env["SODACTL_TOKEN"];
  delete env["SODACTL_URL"];
  Object.assign(env, extraEnv);
  const child = spawn(process.execPath, [CLI_MAIN, "ask", ...args], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let finished = false;
  child.stdout!.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
  child.stderr!.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
  child.stdin!.end(typeof spec === "string" ? spec : JSON.stringify(spec));
  const done = new Promise<{ code: number | null; stdout: string; stderr: string; json: unknown }>((resolve) => {
    child.on("close", (code) => {
      finished = true;
      void rm(home, { recursive: true, force: true });
      let json: unknown;
      try {
        json = JSON.parse(stdout.trim().split("\n")[0] ?? "");
      } catch {
        json = undefined;
      }
      resolve({ code, stdout, stderr, json });
    });
  });
  return { child, done, finished: () => finished };
}

/** ブラウザが `ask.subscribe` の応答を受けた回数を数える。**`page.goto()` の前に `await` して呼ぶ**（`Network.enable` の前の WebSocket は見えない）。 */
export async function watchAskSubscriptions(page: Page): Promise<{ count(): number; waitFor(n: number, timeoutMs?: number): Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const requested = new Set<string>();
  let answered = 0;
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return;
    try {
      const msg = JSON.parse(e.response.payloadData) as { id?: string; method?: string };
      if (msg.method === "ask.subscribe" && msg.id !== undefined) requested.add(msg.id);
    } catch {
      // JSON でないフレームは無視する
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
      // JSON でないフレームは無視する
    }
  });
  return {
    count: () => answered,
    async waitFor(n, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (answered < n) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ask.subscribe #${n} (got ${answered})`);
        await new Promise((r) => setTimeout(r, 25));
      }
    },
  };
}
