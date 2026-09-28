/**
 * 端末版の性能の測定（20260927-cli-mode の 06-docs-verify T4・AC17。requirements の非機能要件「キー入力から反映まで追加遅延 p95 50ms 以内の目安・
 * pane 16 個・状態反映 2 秒以内・大量出力の pane があっても他の pane と画面の操作が固まらない」）。
 *
 * 使い方（先に `pnpm build`）: `node packages/tui/dist/bench/latency.js [--json]`
 *
 * ビルドした `soda serve`（`packages/server/dist/main.js`）を一時の状態ディレクトリ・空いているポートで子として起動し、`runTui` を偽の外側の端末
 * （`TuiIo`。出力を溜めて headless の外側の端末へ流す）で繋ぐ。測るもの:
 *   (a) 1 pane: 打鍵（`cat` の動く pane へ 1 文字）→ その文字を含むフレームが外側の端末へ書かれるまで。比較のため、同じ pane へ WS の INPUT を直接送って
 *       OUTPUT の echo が返るまで（どのクライアントでも払う分。以下「素の往復」）も測る。差が端末版が足した遅延。
 *   (b) 16 pane（4×4）: 同じ打鍵の遅延と、外側の端末の大きさを変えてから全体を描き直したフレームが書かれるまで。
 *   (c) エージェントの状態の反映: `PATH` の先頭に置いた偽の `claude`（`sleep` の写し）を別の pane で起動 → サイドバーに「Agents」が出るまで、
 *       Ctrl+C で止めて → 消えるまで。本物のエージェントの 5 状態の遷移（working→idle 等）は画面の規則で決まるので、ここでは測らない
 *       （手で測る方法は `bench/README.md`）。
 *   (d) 大量出力: 隣の pane で `seq` が数 MB を書いている間に、(a) と同じ打鍵の遅延。
 * 共有のマシンで重くしないよう、全体で十数秒に収める（busy loop・長い繰り返しはしない）。Linux/WSL2 向け（偽の `claude` は `/bin/sleep` の写し）。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
const SAMPLES = 30;

// ---------------------------------------------------------------- 偽の外側の端末

interface Frame {
  at: number;
  data: string;
}

class BenchIo implements TuiIo {
  readonly isTTY = true;
  readonly platform = process.platform;
  // 一時の状態ディレクトリで始めるので、はじめの案内を出させない（打鍵が案内に吸われる）。
  readonly env: Record<string, string> = {
    COLORTERM: "truecolor",
    TERM: "xterm-256color",
    SODA_NO_ONBOARDING: "1",
  };
  readonly frames: Frame[] = [];
  private cols = COLS;
  private rows = ROWS;
  private readonly inputs = new Set<(b: Uint8Array) => void>();
  private readonly resizes = new Set<() => void>();
  private readonly outer = new xtermHeadless.Terminal({
    cols: COLS,
    rows: ROWS,
    allowProposedApi: true,
  });
  private fed = 0;
  private readonly writeWaiters = new Set<(f: Frame) => void>();

  size(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }
  setRawMode(): void {}
  write(data: string): void {
    const f = { at: performance.now(), data };
    this.frames.push(f);
    for (const w of [...this.writeWaiters]) w(f);
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
  /** `pred` を満たすフレームが書かれるまで待ち、その時刻を返す。 */
  nextFrame(pred: (f: Frame) => boolean, timeoutMs: number, since = -Infinity): Promise<number> {
    const hit = this.frames.find((f) => f.at >= since && pred(f));
    if (hit) return Promise.resolve(hit.at);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.writeWaiters.delete(w);
        reject(new Error("timed out waiting for a frame"));
      }, timeoutMs);
      const w = (f: Frame): void => {
        if (f.at < since || !pred(f)) return;
        clearTimeout(timer);
        this.writeWaiters.delete(w);
        resolve(f.at);
      };
      this.writeWaiters.add(w);
    });
  }
  /** 溜めた出力を外側の端末（headless）へ流して画面の文字を返す。 */
  async screen(): Promise<string> {
    const chunk = this.frames
      .slice(this.fed)
      .map((f) => f.data)
      .join("");
    this.fed = this.frames.length;
    await new Promise<void>((resolve) => this.outer.write(chunk, resolve));
    const lines: string[] = [];
    for (let y = 0; y < this.outer.rows; y++)
      lines.push((this.outer.buffer.active.getLine(y)?.translateToString(true) ?? "").trimEnd());
    return lines.join("\n");
  }
  /** 出力が `quietMs` のあいだ止まるまで待つ（次の打鍵の前）。 */
  async settle(quietMs = 30, maxMs = 1000): Promise<void> {
    const start = performance.now();
    for (;;) {
      const last = this.frames.at(-1)?.at ?? 0;
      const now = performance.now();
      if (now - last >= quietMs || now - start >= maxMs) return;
      await sleep(quietMs);
    }
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
  onOutput(cb: (paneId: string, chunk: Uint8Array) => void): () => void {
    this.outputListeners.add(cb);
    return () => this.outputListeners.delete(cb);
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

/** 制御の列（CSI・OSC・その他の ESC）を除いた文字。 */
function visibleText(data: string): string {
  /* eslint-disable no-control-regex -- 制御の列そのものを取り除く */
  return data
    .replace(/\x1b\[[0-9;?<>=! ]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-_]/g, "");
  /* eslint-enable no-control-regex */
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

const LETTERS = "abcdefgijknoprstuvwxyz";

/** 焦点の pane（`cat` が動いている）へ 1 文字ずつ打ち、その文字を含むフレームが書かれるまでの時間。 */
async function typingLatency(io: BenchIo, samples: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    await io.settle();
    const ch = LETTERS[i % LETTERS.length]!;
    const t0 = io.type(ch);
    const t1 = await io.nextFrame((f) => visibleText(f.data).includes(ch), 3000, t0);
    out.push(t1 - t0);
  }
  io.type("\r");
  return out;
}

/** 同じ pane へ WS の INPUT を直接送って echo の OUTPUT が返るまで（端末版を通らない素の往復）。 */
async function rawEcho(rpc: RpcClient, paneId: string, samples: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    await sleep(15);
    const ch = LETTERS[i % LETTERS.length]!;
    const elapsed = await new Promise<number>((resolve, reject) => {
      let t0 = 0;
      const timer = setTimeout(() => reject(new Error("raw echo timed out")), 3000);
      const off = rpc.onOutput((id, chunk) => {
        if (id !== paneId || !new TextDecoder().decode(chunk).includes(ch)) return;
        clearTimeout(timer);
        off();
        resolve(performance.now() - t0);
      });
      t0 = rpc.sendInput(paneId, ch);
    });
    out.push(elapsed);
  }
  rpc.sendInput(paneId, "\r");
  return out;
}

// ---------------------------------------------------------------- 本体

interface Result {
  typing1: Stats;
  rawEcho1: Stats;
  typingHeavy: Stats;
  heavyBytes: number;
  heavyMs: number;
  typing16: Stats;
  redraw16Ms: number;
  agentAppearMs: number | null;
  agentGoneMs: number | null;
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const log = (s: string): void => {
    if (!json) process.stdout.write(`${s}\n`);
  };
  const dir = await mkdtemp(join(tmpdir(), "soda-bench-"));
  const stateDir = join(dir, "state");
  const bin = join(dir, "bin");
  const home = join(dir, "home");
  await mkdir(bin);
  await mkdir(home);
  // 偽のエージェント（ProcessMatcher はプロセス名で見る）。
  await copyFile("/bin/sleep", join(bin, "claude")).catch(() =>
    copyFile("/usr/bin/sleep", join(bin, "claude")),
  );

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined;
  const io = new BenchIo();
  let rpc: RpcClient | undefined;
  let running: Promise<number> | undefined;
  try {
    server = spawn(
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
      {
        env: {
          PATH: `${bin}:${process.env["PATH"] ?? "/usr/bin:/bin"}`,
          HOME: home,
          SHELL: "/bin/sh",
          PS1: "bench$ ",
          ENV: "",
          LANG: "C.UTF-8",
          TERM: "xterm-256color",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
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
    // 準備完了（ローカルログインが通る）まで待つ。
    let cookie: string | undefined;
    for (let i = 0; i < 300 && cookie === undefined; i++) {
      cookie = await login().catch(() => undefined);
      if (cookie === undefined) await sleep(50);
      if (server.exitCode !== null) throw new Error(`soda serve exited: ${serverErr}`);
    }
    if (cookie === undefined) throw new Error(`soda serve did not become ready: ${serverErr}`);

    // 復元までは /ws が 503 なので、繋がるまで繰り返す。
    for (let i = 0; i < 300 && rpc === undefined; i++) {
      rpc = await RpcClient.open(baseUrl, cookie).catch(() => undefined);
      if (rpc === undefined) await sleep(50);
    }
    if (rpc === undefined) throw new Error("/ws did not accept the connection");
    const hello = await rpc.request<{ snapshot: { panes: PaneLite[]; tabs: { id: string }[] } }>(
      "client.hello",
      {
        protocol: 1,
        kind: "external",
      },
    );
    const first = hello.snapshot.panes[0]!.id;

    const target: TuiTarget = { baseUrl, origin: baseUrl, stateDir, login };
    running = runTui(target, io);
    await io.waitScreen((s) => s.includes("bench$"), 20_000);

    // ---- (a) 1 pane
    io.type("cat\r");
    await sleep(200);
    const typing1 = await typingLatency(io, SAMPLES);
    await rpc.request("pane.subscribe", { paneId: first, scrollbackLines: 0 });
    const raw1 = await rawEcho(rpc, first, SAMPLES);
    log(
      `(a) 1 pane      打鍵→フレーム ${JSON.stringify(stats(typing1))} ms / 素の往復 ${JSON.stringify(stats(raw1))} ms`,
    );

    // ---- (d) 大量出力の隣で打鍵
    const heavy = (
      await rpc.request<{ pane: PaneLite }>("pane.split", { paneId: first, direction: "right" })
    ).pane.id;
    await rpc.request("pane.focus", { paneId: first });
    await sleep(300);
    let heavyBytes = 0;
    const offHeavy = rpc.onOutput((id, chunk) => {
      if (id === heavy) heavyBytes += chunk.length;
    });
    await rpc.request("pane.subscribe", { paneId: heavy, scrollbackLines: 0 });
    const heavyStart = performance.now();
    rpc.sendInput(heavy, "seq 1 400000; echo HEAVY_DONE\r");
    await sleep(100);
    const typingHeavy = await typingLatency(io, SAMPLES);
    await io
      .waitScreen((s) => s.includes("HEAVY_DONE") && !s.includes("echo HEAVY_DONE\n"), 30_000)
      .catch(() => 0);
    const heavyMs = performance.now() - heavyStart;
    offHeavy();
    log(
      `(d) 大量出力の隣 打鍵→フレーム ${JSON.stringify(stats(typingHeavy))} ms（隣の pane: ${(heavyBytes / 1e6).toFixed(1)} MB を ${Math.round(heavyMs)} ms）`,
    );

    // ---- (b) 16 pane（4×4）
    const cols: string[] = [first];
    // 最初の 2 列は first|heavy。heavy を右に 2 つ割って 4 列（1/4 ずつに近づける）。
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
    cols.push(heavy, c2, c3);
    const all: string[] = [];
    for (const top of cols) {
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
    // 各 pane に 1 行ずつ書かせる（全 pane に中身がある状態で描く）。
    for (const id of all) if (id !== first) rpc.sendInput(id, `echo pane-${id.slice(-4)}\r`);
    await sleep(800);
    await io.settle(50, 2000);
    const typing16 = await typingLatency(io, SAMPLES);
    await io.settle(50, 2000);
    const tResize = io.resize(COLS - 10, ROWS - 4);
    const tRedraw = await io.nextFrame(() => true, 3000, tResize);
    const redraw16Ms = Math.round((tRedraw - tResize) * 10) / 10;
    log(
      `(b) 16 pane     打鍵→フレーム ${JSON.stringify(stats(typing16))} ms / 大きさの変更→全体の描き直し ${redraw16Ms} ms（pane ${all.length} 個）`,
    );
    await sleep(300);

    // ---- (c) エージェントの状態の反映
    let agentAppearMs: number | null = null;
    let agentGoneMs: number | null = null;
    const agentPane = all[all.length - 1]!;
    await io.settle(50, 2000);
    await io.screen();
    const tStart = rpc.sendInput(agentPane, "claude 30\r");
    try {
      agentAppearMs = Math.round((await io.waitScreen((s) => s.includes("Agents"), 5000)) - tStart);
      const tStop = rpc.sendInput(agentPane, "\x03");
      agentGoneMs = Math.round((await io.waitScreen((s) => !s.includes("Agents"), 5000)) - tStop);
    } catch (err) {
      log(`(c) エージェントの反映を測れなかった: ${String(err)}`);
    }
    log(
      `(c) エージェント 起動→サイドバーに出る ${agentAppearMs ?? "-"} ms / 止める→消える ${agentGoneMs ?? "-"} ms（目安 2000 ms 以内）`,
    );

    const result: Result = {
      typing1: stats(typing1),
      rawEcho1: stats(raw1),
      typingHeavy: stats(typingHeavy),
      heavyBytes,
      heavyMs: Math.round(heavyMs),
      typing16: stats(typing16),
      redraw16Ms,
      agentAppearMs,
      agentGoneMs,
    };
    const added = result.typing1.p95 - result.rawEcho1.p95;
    log(
      `端末版が足した遅延（p95 の差の目安）: ${Math.round(added * 10) / 10} ms（目安 50 ms 以内）`,
    );
    if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (running) {
      io.type("\x02q");
      await Promise.race([running, sleep(3000)]);
    }
    rpc?.close();
    io.dispose();
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => server!.once("exit", resolve)), sleep(10_000)]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(
      `bench failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  },
);
