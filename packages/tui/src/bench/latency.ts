/**
 * 端末版の性能の測定（20260927-cli-mode の 06-docs-verify T4・AC17。requirements の非機能要件「キー入力から反映まで追加遅延 p95 50ms 以内の目安・
 * pane 16 個・状態反映 2 秒以内・大量出力の pane があっても他の pane と画面の操作が固まらない」）。
 *
 * 使い方（先に `pnpm build`）: `node packages/tui/dist/bench/latency.js [--json]`。目安を外れたら終了コード 1。
 *
 * ビルドした `soda serve`（`packages/server/dist/main.js`）を一時の状態ディレクトリ・空いているポートで子として起動し、`runTui` を偽の外側の端末
 * （`TuiIo`。書かれた列をその場で headless の外側の端末へ流す）で繋ぐ。打鍵の 1 標本は次の 2 つを続けて測る（同じ pane・同じ時間帯）:
 *   - 素の往復: WS の外部クライアントから同じ pane へ INPUT を直接送り、OUTPUT の echo が返るまで（どのクライアントでも払う分）。
 *   - 端末版: 焦点の pane（`cat`）へ 1 文字打ち、**その pane のカーソルの位置のセルにその文字が描かれ、カーソルが 1 つ進んだ**フレームが書かれるまで。
 *   足した遅延 = 端末版 − 素の往復（標本ごと）。どちらも同じプロセス（同じイベントループ）で測るので、ループの遅れは両方に乗る。
 * 測るもの:
 *   (a) 1 pane の打鍵。足した遅延の p95 ≤ 50ms。
 *   (d) 隣の pane が 8 秒のあいだ `seq` を出し続けている**最中**の打鍵（静まりを待たない。標本の 9 割以上が流れている間に取れたことを確かめる）。打鍵の p95 ≤ 50ms。
 *   (b) 16 pane（4×4）の打鍵（p95 ≤ 50ms）と、外側の端末の大きさを変えてから全体を描き直した（`CSI 2J` を含む）フレームが書かれるまで。
 *   (c) エージェントの表示の反映: `PATH` の先頭に置いた偽の `claude`（`sleep` の写し）を別の pane で起動 → サイドバーに「Agents」が出るまで、
 *       Ctrl+C で止めて → 消えるまで（どちらも ≤ 2000ms）。本物のエージェントの 5 状態の遷移は画面の規則で決まるので測らない（`bench/README.md`）。
 * 各場面の最初の 5 標本は暖機として捨てる。共有のマシンで重くしないよう、全体で十数秒に収める（繰り返しの負荷はかけない）。Linux/WSL2 向け。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import WebSocket from "ws";
import xtermHeadless from "@xterm/headless";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import { runTui } from "../runTui.js";
import type { TuiIo, TuiSignal, TuiTarget } from "../types.js";

const SERVER_MAIN = fileURLToPath(new URL("../../../server/dist/main.js", import.meta.url));
const COLS = 200;
const ROWS = 60;
const WARMUP = 5;
const SAMPLES = 60;
/** 1 行に打つ標本の数（素の往復と端末版で 2 文字ずつ。16 pane の狭い pane でも折り返さない数）。 */
const PER_LINE = 12;
const TARGET_MS = 50;
const TARGET_STATUS_MS = 2000;
/** (d) の大量出力を流す秒数。 */
const FLOOD_SECONDS = 8;

// ---------------------------------------------------------------- 偽の外側の端末

interface Frame {
  at: number;
  data: string;
}

type FramePred = (f: Frame, outer: HeadlessTerminal) => boolean;
type HeadlessTerminal = InstanceType<typeof xtermHeadless.Terminal>;

class BenchIo implements TuiIo {
  readonly isTTY = true;
  readonly platform = process.platform;
  readonly env: Record<string, string> = { COLORTERM: "truecolor", TERM: "xterm-256color" };
  lastWriteAt = 0;
  private cols = COLS;
  private rows = ROWS;
  private readonly inputs = new Set<(b: Uint8Array) => void>();
  private readonly resizes = new Set<() => void>();
  readonly outer = new xtermHeadless.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
  private readonly waiters = new Set<(f: Frame) => void>();

  size(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }
  setRawMode(): void {}
  /** 書かれた列はその場で外側の端末へ流し、読み終えたところで待ちに見せる（フレームは溜めない）。 */
  write(data: string): void {
    const f = { at: performance.now(), data };
    this.lastWriteAt = f.at;
    this.outer.write(data, () => {
      for (const w of [...this.waiters]) w(f);
    });
  }
  onInput(cb: (b: Uint8Array) => void): () => void {
    this.inputs.add(cb);
    return () => this.inputs.delete(cb);
  }
  onResize(cb: () => void): () => void {
    this.resizes.add(cb);
    return () => this.resizes.delete(cb);
  }
  onSignal(_cb: (s: TuiSignal) => void): () => void {
    return () => undefined;
  }
  onFatal(_cb: (e: unknown) => void): () => void {
    return () => undefined;
  }
  onExit(_cb: () => void): () => void {
    return () => undefined;
  }
  writeError(text: string): void {
    process.stderr.write(text);
  }

  type(text: string): number {
    const bytes = new TextEncoder().encode(text);
    const at = performance.now();
    for (const cb of [...this.inputs]) cb(bytes);
    return at;
  }
  resize(cols: number, rows: number): number {
    this.cols = cols;
    this.rows = rows;
    this.outer.resize(cols, rows);
    const at = performance.now();
    for (const cb of [...this.resizes]) cb();
    return at;
  }
  /** `since` 以後に書かれ、読み終えた外側の端末が `pred` を満たすフレームの時刻（書かれた時刻）。 */
  nextFrame(pred: FramePred, timeoutMs: number, since: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(w);
        reject(new Error("timed out waiting for a frame"));
      }, timeoutMs);
      const w = (f: Frame): void => {
        if (f.at < since || !pred(f, this.outer)) return;
        clearTimeout(timer);
        this.waiters.delete(w);
        resolve(f.at);
      };
      this.waiters.add(w);
    });
  }
  /** 書いた列を読み終えるまで待つ。 */
  flush(): Promise<void> {
    return new Promise((resolve) => this.outer.write("", resolve));
  }
  cursor(): { x: number; y: number } {
    const b = this.outer.buffer.active;
    return { x: b.cursorX, y: b.cursorY };
  }
  async screen(): Promise<string> {
    await this.flush();
    const lines: string[] = [];
    for (let y = 0; y < this.outer.rows; y++)
      lines.push((this.outer.buffer.active.getLine(y)?.translateToString(true) ?? "").trimEnd());
    return lines.join("\n");
  }
  /** 出力が `quietMs` のあいだ止まるまで待つ（準備の区切り。測定の途中では使わない）。 */
  async settle(quietMs = 50, maxMs = 2000): Promise<void> {
    const start = performance.now();
    while (performance.now() - this.lastWriteAt < quietMs && performance.now() - start < maxMs)
      await sleep(quietMs);
    await this.flush();
  }
  async waitScreen(pred: (s: string) => boolean, timeoutMs: number): Promise<number> {
    const start = performance.now();
    for (;;) {
      if (pred(await this.screen())) return performance.now();
      if (performance.now() - start > timeoutMs)
        throw new Error("timed out waiting for the screen");
      await sleep(20);
    }
  }
  dispose(): void {
    this.outer.dispose();
  }
}

function cellAt(outer: HeadlessTerminal, x: number, y: number): string {
  return outer.buffer.active.getLine(y)?.getCell(x)?.getChars() ?? "";
}

// ---------------------------------------------------------------- WS の RPC（外部クライアント。構成の組み立てと素の往復）

class RpcClient {
  private nextId = 1;
  private readonly pending = new Map<
    string,
    { resolve(v: unknown): void; reject(e: Error): void }
  >();
  private readonly outputListeners = new Set<(paneId: string, chunk: Uint8Array) => void>();
  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        const f = decodeFrame(new Uint8Array(data));
        if (f.type === FRAME_TYPE.OUTPUT)
          for (const cb of this.outputListeners) cb(f.paneId, f.chunk);
        return;
      }
      const msg = JSON.parse(data.toString("utf8")) as {
        id?: string;
        result?: unknown;
        error?: { code: string; message: string };
      };
      if (msg.id === undefined) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result);
    });
  }
  static open(baseUrl: string, cookie: string): Promise<RpcClient> {
    const u = new URL(baseUrl);
    const ws = new WebSocket(`ws://${u.host}/ws`, {
      headers: { cookie, origin: baseUrl, host: u.host },
    });
    return new Promise((resolve, reject) => {
      ws.once("open", () => resolve(new RpcClient(ws)));
      ws.once("error", reject);
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(this.nextId++);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  sendInput(paneId: string, text: string): number {
    const at = performance.now();
    this.ws.send(encodeInputFrame(paneId, new TextEncoder().encode(text)));
    return at;
  }
  /** `paneId` の OUTPUT に `text` が来た時刻。 */
  nextOutput(paneId: string, text: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.outputListeners.delete(cb);
        reject(new Error("timed out waiting for the echo"));
      }, timeoutMs);
      const cb = (id: string, chunk: Uint8Array): void => {
        if (id !== paneId || !new TextDecoder().decode(chunk).includes(text)) return;
        clearTimeout(timer);
        this.outputListeners.delete(cb);
        resolve(performance.now());
      };
      this.outputListeners.add(cb);
    });
  }
  close(): void {
    this.ws.close(1000, "done");
  }
}

interface PaneLite {
  id: string;
}

// ---------------------------------------------------------------- 補助

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

interface Stats {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

function stats(xs: readonly number[]): Stats {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number): number => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] ?? NaN;
  const r = (v: number): number => Math.round(v * 10) / 10;
  return { n: s.length, p50: r(q(0.5)), p95: r(q(0.95)), max: r(s.at(-1) ?? NaN) };
}

interface Samples {
  /** 端末版：打鍵 → その文字を描いたフレーム。 */
  typing: number[];
  /** 素の往復：INPUT → echo の OUTPUT。 */
  raw: number[];
  /** 標本ごとの 端末版 − 素の往復。 */
  added: number[];
  /** 端末版の打鍵を送った時刻（(d) の「流れている間か」の判定用）。 */
  typedAt: number[];
}

interface Summary {
  typing: Stats;
  raw: Stats;
  added: Stats;
}

const summary = (s: Samples): Summary => ({
  typing: stats(s.typing),
  raw: stats(s.raw),
  added: stats(s.added),
});

const LETTERS = "abcdefgijknoprstuvwxyz";

/** 焦点の pane のカーソルの位置 `p` に `ch` が描かれ、カーソルが 1 つ進んだフレーム。 */
const echoedAt =
  (p: { x: number; y: number }, ch: string): FramePred =>
  (_f, outer) =>
    cellAt(outer, p.x, p.y) === ch &&
    outer.buffer.active.cursorX === p.x + 1 &&
    outer.buffer.active.cursorY === p.y;

/**
 * 焦点の pane（`cat` が動いていて、`paneId` がその pane）で、素の往復と端末版の打鍵を交互に `WARMUP + SAMPLES` 回測る。最初の `WARMUP` 回は捨てる。
 * 次の標本へは待たずに進む（出力の静まりを待たない。(d) で大量出力の最中に打つため）。`PER_LINE` 回ごとに Ctrl+U で行を消して折り返しを避ける。
 */
async function typingSamples(io: BenchIo, rpc: RpcClient, paneId: string): Promise<Samples> {
  const out: Samples = { typing: [], raw: [], added: [], typedAt: [] };
  await io.flush();
  const lineStart = io.cursor();
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    if (i > 0 && i % PER_LINE === 0) {
      io.type("\x15");
      await io
        .nextFrame((_f, o) => o.buffer.active.cursorX === lineStart.x, 3000, -Infinity)
        .catch(async () => {
          await io.flush();
          if (io.cursor().x !== lineStart.x)
            throw new Error("Ctrl+U did not return to the line start");
        });
      await io.flush();
    }
    const rawCh = LETTERS[(2 * i) % LETTERS.length]!.toUpperCase();
    const ch = LETTERS[(2 * i + 1) % LETTERS.length]!;
    // 素の往復（同じ pane。端末版がその文字を描き終えるまで待ってから次へ——カーソルの位置を基準にするため）。
    await io.flush();
    const p0 = io.cursor();
    const rawEcho = rpc.nextOutput(paneId, rawCh, 3000);
    const drawnRaw = io.nextFrame(echoedAt(p0, rawCh), 3000, performance.now());
    const r0 = rpc.sendInput(paneId, rawCh);
    const raw = (await rawEcho) - r0;
    await drawnRaw;
    await io.flush();
    // 端末版。
    const p1 = io.cursor();
    const drawn = io.nextFrame(echoedAt(p1, ch), 3000, performance.now());
    const t0 = io.type(ch);
    const typing = (await drawn) - t0;
    if (i >= WARMUP) {
      out.typing.push(typing);
      out.raw.push(raw);
      out.added.push(typing - raw);
      out.typedAt.push(t0);
    }
  }
  io.type("\x15");
  return out;
}

// ---------------------------------------------------------------- 本体

interface Result {
  a: Summary;
  d: Summary & { heavyMs: number; duringFlood: number };
  b: Summary & { panes: number; redrawMs: number };
  c: { agentAppearMs: number | null; agentGoneMs: number | null };
  violations: string[];
  pass: boolean;
}

async function startServer(
  stateDir: string,
  env: NodeJS.ProcessEnv,
): Promise<{ server: ChildProcess; baseUrl: string; login(): Promise<string>; cookie: string }> {
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(
      process.execPath,
      [
        SERVER_MAIN,
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--state-dir",
        stateDir,
        "--shell",
        "/bin/sh",
      ],
      { env, stdio: ["ignore", "ignore", "pipe"] },
    );
    let serverErr = "";
    server.stderr?.on("data", (d: Buffer) => (serverErr += d.toString("utf8")));
    const login = async (): Promise<string> => {
      const auth = JSON.parse(await readFile(join(stateDir, "local-auth.json"), "utf8")) as {
        secret: string;
      };
      const res = await fetch(`${baseUrl}/api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ secret: auth.secret }),
      });
      const cookie = res.headers.get("set-cookie")?.split(";")[0];
      if (res.status !== 204 || !cookie) throw new Error(`local login failed: HTTP ${res.status}`);
      return cookie;
    };
    let cookie: string | undefined;
    for (let i = 0; i < 300 && cookie === undefined && server.exitCode === null; i++) {
      cookie = await login().catch(() => undefined);
      if (cookie === undefined) await sleep(50);
    }
    if (cookie !== undefined) return { server, baseUrl, login, cookie };
    if (server.exitCode === null) server.kill("SIGKILL");
    // 選んだポートを使う前に他に取られた（空きポートを選んでから使うまでの競合）ときだけ、ポートを替えてやり直す。
    if (attempt < 3 && /cannot listen|EADDRINUSE/i.test(serverErr)) continue;
    throw new Error(`soda serve did not become ready: ${serverErr}`);
  }
}

async function main(): Promise<number> {
  const json = process.argv.includes("--json");
  const log = (s: string): void => {
    if (!json) process.stdout.write(`${s}\n`);
  };
  const dir = await mkdtemp(join(tmpdir(), "soda-bench-"));
  let server: ChildProcess | undefined;
  const io = new BenchIo();
  let rpc: RpcClient | undefined;
  let running: Promise<number> | undefined;
  try {
    const stateDir = join(dir, "state");
    const bin = join(dir, "bin");
    const home = join(dir, "home");
    await mkdir(bin);
    await mkdir(home);
    await mkdir(stateDir);
    // はじめの案内は済ませた扱い（案内が打鍵を受けて画面を覆わない）。
    await writeFile(
      join(stateDir, "prefs.json"),
      JSON.stringify({ schema: 1, rev: 1, prefs: { onboarding: false } }),
    );
    // 偽のエージェント（ProcessMatcher はプロセス名で見る）。
    await copyFile("/bin/sleep", join(bin, "claude")).catch(() =>
      copyFile("/usr/bin/sleep", join(bin, "claude")),
    );

    const started = await startServer(stateDir, {
      PATH: `${bin}:${process.env["PATH"] ?? "/usr/bin:/bin"}`,
      HOME: home,
      SHELL: "/bin/sh",
      PS1: "bench$ ",
      ENV: "",
      LANG: "C.UTF-8",
      TERM: "xterm-256color",
    });
    server = started.server;
    const { baseUrl, login } = started;

    // 復元までは /ws が 503 なので、繋がるまで繰り返す。
    for (let i = 0; i < 300 && rpc === undefined; i++) {
      rpc = await RpcClient.open(baseUrl, started.cookie).catch(() => undefined);
      if (rpc === undefined) await sleep(50);
    }
    if (rpc === undefined) throw new Error("/ws did not accept the connection");
    const hello = await rpc.request<{ snapshot: { panes: PaneLite[] } }>("client.hello", {
      protocol: 1,
      kind: "external",
    });
    const first = hello.snapshot.panes[0]!.id;

    const target: TuiTarget = { baseUrl, origin: baseUrl, stateDir, login };
    running = runTui(target, io);
    await io.waitScreen((s) => s.includes("bench$"), 20_000);
    await rpc.request("pane.subscribe", { paneId: first, scrollbackLines: 0 });

    // ---- (a) 1 pane
    io.type("cat\r");
    await sleep(200);
    await io.settle();
    const a = await typingSamples(io, rpc, first);
    log(`(a) 1 pane       ${fmt(summary(a))}`);

    // ---- (d) 大量出力の最中に打鍵
    const heavy = (
      await rpc.request<{ pane: PaneLite }>("pane.split", { paneId: first, direction: "right" })
    ).pane.id;
    await rpc.request("pane.focus", { paneId: first });
    await sleep(300);
    await io.settle();
    const doneFile = join(dir, "flood-done");
    // 8 秒のあいだ出し続ける（数十 KB ずつ途切れずに。打鍵の標本を取り終えるより長く流す）。
    rpc.sendInput(
      heavy,
      `end=$(($(date +%s)+${FLOOD_SECONDS})); while [ $(date +%s) -lt $end ]; do seq 1 20000; done; touch ${doneFile}\r`,
    );
    const heavyStart = performance.now();
    let floodEnd = Infinity;
    const floodWatch = (async () => {
      while (!existsSync(doneFile) && performance.now() - heavyStart < 60_000) await sleep(20);
      floodEnd = performance.now();
    })();
    await sleep(200); // 流れ始めるまで（seq の起動）
    const d = await typingSamples(io, rpc, first);
    const duringFlood = d.typedAt.filter((t) => t < floodEnd).length / d.typedAt.length;
    await floodWatch;
    const heavyMs = Math.round(floodEnd - heavyStart);
    log(
      `(d) 大量出力の最中 ${fmt(summary(d))}（隣の pane が ${heavyMs} ms 出し続けた。標本の ${Math.round(duringFlood * 100)}% が流れている間）`,
    );

    // ---- (b) 16 pane（4×4）
    await io.settle(50, 3000);
    const c2 = (
      await rpc.request<{ pane: PaneLite }>("pane.split", {
        paneId: heavy,
        direction: "right",
        ratio: 0.34,
      })
    ).pane.id;
    const c3 = (
      await rpc.request<{ pane: PaneLite }>("pane.split", {
        paneId: c2,
        direction: "right",
        ratio: 0.5,
      })
    ).pane.id;
    const all: string[] = [];
    for (const top of [first, heavy, c2, c3]) {
      all.push(top);
      const r1 = (
        await rpc.request<{ pane: PaneLite }>("pane.split", {
          paneId: top,
          direction: "down",
          ratio: 0.25,
        })
      ).pane.id;
      const r2 = (
        await rpc.request<{ pane: PaneLite }>("pane.split", {
          paneId: r1,
          direction: "down",
          ratio: 0.34,
        })
      ).pane.id;
      const r3 = (
        await rpc.request<{ pane: PaneLite }>("pane.split", {
          paneId: r2,
          direction: "down",
          ratio: 0.5,
        })
      ).pane.id;
      all.push(r1, r2, r3);
    }
    await rpc.request("pane.focus", { paneId: first });
    rpc.sendInput(heavy, "clear\r");
    for (const id of all)
      if (id !== first && id !== heavy) rpc.sendInput(id, `echo pane-${id.slice(-4)}\r`);
    await sleep(800);
    await io.settle(50, 3000);
    const b = await typingSamples(io, rpc, first);
    await io.settle(50, 3000);
    const tResize = io.resize(COLS - 10, ROWS - 4);
    const tRedraw = await io.nextFrame((f) => f.data.includes("\x1b[2J"), 3000, tResize);
    const redrawMs = Math.round((tRedraw - tResize) * 10) / 10;
    log(
      `(b) 16 pane      ${fmt(summary(b))} / 大きさの変更→全体の描き直し ${redrawMs} ms（pane ${all.length} 個）`,
    );
    await sleep(300);

    // ---- (c) エージェントの表示の反映
    let agentAppearMs: number | null = null;
    let agentGoneMs: number | null = null;
    const agentPane = all[all.length - 1]!;
    await io.settle(50, 2000);
    const tStart = rpc.sendInput(agentPane, "claude 30\r");
    try {
      agentAppearMs = Math.round((await io.waitScreen((s) => s.includes("Agents"), 5000)) - tStart);
      const tStop = rpc.sendInput(agentPane, "\x03");
      agentGoneMs = Math.round((await io.waitScreen((s) => !s.includes("Agents"), 5000)) - tStop);
    } catch (err) {
      log(`(c) エージェントの反映を測れなかった: ${String(err)}`);
    }
    log(
      `(c) エージェント 起動→サイドバーに出る ${agentAppearMs ?? "-"} ms / 止める→消える ${agentGoneMs ?? "-"} ms`,
    );

    // ---- 目安（AC17）
    const violations: string[] = [];
    const sa = summary(a);
    const sd = summary(d);
    const sb = summary(b);
    if (!(sa.added.p95 <= TARGET_MS))
      violations.push(`(a) added p95 ${sa.added.p95} ms > ${TARGET_MS} ms`);
    if (!(sd.typing.p95 <= TARGET_MS))
      violations.push(`(d) typing p95 ${sd.typing.p95} ms > ${TARGET_MS} ms`);
    if (duringFlood < 0.9)
      violations.push(
        `(d) only ${Math.round(duringFlood * 100)}% of the samples were taken while the flood was running`,
      );
    if (!(sb.typing.p95 <= TARGET_MS))
      violations.push(`(b) typing p95 ${sb.typing.p95} ms > ${TARGET_MS} ms`);
    if (agentAppearMs === null || agentAppearMs > TARGET_STATUS_MS)
      violations.push(
        `(c) agent appear ${agentAppearMs ?? "not measured"} > ${TARGET_STATUS_MS} ms`,
      );
    if (agentGoneMs === null || agentGoneMs > TARGET_STATUS_MS)
      violations.push(`(c) agent gone ${agentGoneMs ?? "not measured"} > ${TARGET_STATUS_MS} ms`);

    const result: Result = {
      a: sa,
      d: { ...sd, heavyMs, duringFlood: Math.round(duringFlood * 100) / 100 },
      b: { ...sb, panes: all.length, redrawMs },
      c: { agentAppearMs, agentGoneMs },
      violations,
      pass: violations.length === 0,
    };
    if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else if (violations.length === 0) log(`目安（AC17）: すべて満たした`);
    else log(`目安（AC17）を外れた:\n  ${violations.join("\n  ")}`);
    return violations.length === 0 ? 0 : 1;
  } finally {
    if (running) {
      io.type("\x02q");
      await Promise.race([running, sleep(3000)]);
    }
    rpc?.close();
    io.dispose();
    if (server && server.exitCode === null) {
      const s = server;
      s.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => s.once("exit", resolve)), sleep(10_000)]);
      if (s.exitCode === null) s.kill("SIGKILL");
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function fmt(s: Summary): string {
  const f = (x: Stats): string => `p50 ${x.p50} / p95 ${x.p95} / max ${x.max}`;
  return `打鍵→フレーム ${f(s.typing)} ms・素の往復 ${f(s.raw)} ms・足した遅延 ${f(s.added)} ms（n=${s.typing.n}）`;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(
      `bench failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(2);
  },
);
