import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import * as nodePty from "node-pty";
import xtermHeadless from "@xterm/headless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getFreePort } from "../composeServerOnFreePort.js";

/**
 * ビルドした `soda`（引数なし）を本物の端末（node-pty）の中で動かす（20260927-cli-mode の 03-tui-core T6。AC1・AC2・AC3）。
 * 起動 → 裏でサーバが立ち上がり端末版が描く → pane に打ったコマンドの出力が出る → prefix+q で終了コード 0・モードが戻る →
 * もう一度 `soda` で同じ画面（スクロールバックの SNAPSHOT）→ 後始末でサーバを止める。
 *
 * ポートは名前付き session の「記憶したポート」（`serve.json` の port）で空いているものを使わせる——既定の 7780 は、この機械で動いている
 * 別の soda とぶつかりうる。Windows は対象外（node-pty の ConPTY と `soda session stop` の扱いが別。docs の検証で確かめる）。
 */
vi.setConfig({ testTimeout: 60_000 });

const MAIN = fileURLToPath(new URL("../../dist/main.js", import.meta.url));
const COLS = 100;
const ROWS = 30;
const SESSION = "ptytest";
const LEAVE_ALT_SCREEN = "\x1b[?1049l";

interface Run {
  pty: nodePty.IPty;
  output(): string;
  screen(): Promise<string>;
  exited: Promise<number>;
  dispose(): void;
}

function runSoda(base: string, env: NodeJS.ProcessEnv): Run {
  const term = new xtermHeadless.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
  let out = "";
  let written = 0;
  const pty = nodePty.spawn(process.execPath, [MAIN, "--state-dir", base, "--session", SESSION], {
    name: "xterm-256color",
    cols: COLS,
    rows: ROWS,
    cwd: base,
    env,
  });
  pty.onData((d) => {
    out += d;
  });
  const exited = new Promise<number>((resolve) => pty.onExit(({ exitCode }) => resolve(exitCode)));
  return {
    pty,
    output: () => out,
    screen: async () => {
      const chunk = out.slice(written);
      written = out.length;
      await new Promise<void>((resolve) => term.write(chunk, resolve));
      const lines: string[] = [];
      for (let y = 0; y < ROWS; y++)
        lines.push((term.buffer.active.getLine(y)?.translateToString(true) ?? "").trimEnd());
      return lines.join("\n");
    },
    exited,
    dispose: () => term.dispose(),
  };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(process.platform === "win32" || !existsSync(MAIN))(
  "soda（引数なし）を本物の端末で（node-pty）",
  () => {
    let dir: string;
    let base: string;
    let sessionDir: string;
    let env: NodeJS.ProcessEnv;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), "soda-pty-it-"));
      base = join(dir, "state");
      sessionDir = join(base, "sessions", SESSION);
      await mkdir(sessionDir, { recursive: true });
      // 空いているポートを「前回使ったポート」として記録しておく（pid は動いていないもの。ロックも無いので、soda は起動し直す）。
      const port = await getFreePort("127.0.0.1");
      await writeFile(
        join(sessionDir, "serve.json"),
        JSON.stringify({
          schema: 1,
          pid: 2 ** 22 + 12345,
          hostname: hostname(),
          port,
          https: false,
          host: "127.0.0.1",
          savedAt: "",
        }),
      );
      // 入れ子の検出（SODA_PANE_ID）に掛からないよう、soda の中から走らせても soda の変数を外す。
      env = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("SODA_")),
      ) as NodeJS.ProcessEnv;
      env["TERM"] = "xterm-256color";
      env["COLORTERM"] = "truecolor";
    });

    afterAll(async () => {
      // 裏で起動したサーバを止める（serve.json の pid。SIGTERM は通常の停止）。
      const record = JSON.parse(
        await readFile(join(sessionDir, "serve.json"), "utf8").catch(() => "{}"),
      ) as { pid?: number };
      if (record.pid !== undefined && alive(record.pid)) {
        process.kill(record.pid, "SIGTERM");
        await vi.waitFor(() => expect(alive(record.pid!)).toBe(false), {
          timeout: 15_000,
          interval: 100,
        });
      }
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    it("起動して描き、pane に打ったコマンドの出力が出て、prefix+q で 0・モードが戻り、もう一度開くと同じ画面が戻る（AC1・AC2・AC3）", async () => {
      const first = runSoda(base, env);
      const marker = `PTY_${Date.now()}`;
      try {
        // サイドバーと tab バー・pane の枠が描かれる（裏でサーバを起動してから繋ぐ）。
        await vi.waitFor(async () => expect(await first.screen()).toContain("Spaces"), {
          timeout: 30_000,
          interval: 200,
        });
        await vi.waitFor(async () => expect(await first.screen()).toMatch(/1:\S/), {
          timeout: 30_000,
          interval: 200,
        });
        // pane のシェルの準備を待ってから打つ（プロンプトが出るまで）。
        await vi.waitFor(
          async () =>
            expect((await first.screen()).split("\n").slice(1).join("\n")).toMatch(/[$#>%]\s*│/),
          {
            timeout: 20_000,
            interval: 200,
          },
        );
        first.pty.write(`echo ${marker}\r`);
        await vi.waitFor(
          async () => {
            const lines = (await first.screen()).split("\n");
            expect(lines.some((l) => l.includes(marker) && !l.includes("echo"))).toBe(true);
          },
          { timeout: 20_000, interval: 200 },
        );
        first.pty.write("\x02q");
        expect(await first.exited).toBe(0);
        expect(first.output()).toContain(LEAVE_ALT_SCREEN);
        expect(first.output().lastIndexOf(LEAVE_ALT_SCREEN)).toBeGreaterThan(
          first.output().lastIndexOf("\x1b[?1049h"),
        );
      } finally {
        first.dispose();
      }

      // サーバは動き続けている。
      const record = JSON.parse(await readFile(join(sessionDir, "serve.json"), "utf8")) as {
        pid: number;
      };
      expect(alive(record.pid)).toBe(true);

      const second = runSoda(base, env);
      try {
        await vi.waitFor(
          async () => {
            const lines = (await second.screen()).split("\n");
            expect(lines.some((l) => l.includes(marker) && !l.includes("echo"))).toBe(true);
          },
          { timeout: 30_000, interval: 200 },
        );
        second.pty.write("\x02q");
        expect(await second.exited).toBe(0);
      } finally {
        second.dispose();
      }
    });
  },
);
