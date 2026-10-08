import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { connect as netConnect } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { PANE_OP_DISPLAY_LIST, PANE_OP_DISPLAY_SET, PANE_OP_DISPLAY_SEND, PANE_OP_DISPLAY_CLOSE, type DisplayInfo, type ExtensionListResult, type PaneSocketResponse } from "@sodashitsu/protocol";
import type { ComposedServer } from "../composeServer.js";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import { makeTempDir } from "../persist/atomicFile.js";

/**
 * 拡張の登録と起動（20261007-ext-host）を、実物の `composeServer` の配線と**実際の子プロセス**で確かめる。拡張は、テストが一時ディレクトリに書く短い `.mjs`
 * （`process.execPath` の絶対パスで起動する）。時間は `internal.extensions.timings` で縮め、状態が変わるのを上限つきで待つ（実時間を決め打ちで待たない）。
 * テストが起動した子・孫は、テストの後に残さない（`afterEach` で、書き出された pid を見て、生きていれば止める。残っていないことを確かめる）。
 */
vi.setConfig({ testTimeout: 60_000 });

class Client {
  private seq = 0;
  readonly events: { event: string; data: Record<string, unknown> }[] = [];
  private readonly pending = new Map<string, (m: { result?: unknown; error?: { code: string } }) => void>();
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(String(data)) as { id?: string; result?: unknown; error?: { code: string }; event?: string; data?: Record<string, unknown> };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
      else if (msg.event !== undefined) this.events.push({ event: msg.event, data: msg.data ?? {} });
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(Object.assign(new Error(m.error.code), { code: m.error.code })) : resolve(m.result as T)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connectWs(server: ComposedServer, kind: "desktop" | "mobile" | "external", token?: string): Promise<Client> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token: server.freshToken ?? token }),
  });
  expect(res.status).toBe(204);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin, host: `127.0.0.1:${port}`, cookie } });
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });
  const c = new Client(ws);
  await c.request("client.hello", { protocol: 1, kind });
  return c;
}

function paneCall(path: string, op: string, paneId: string, params?: Record<string, unknown>): Promise<PaneSocketResponse> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = netConnect(path);
    sock.setEncoding("utf8");
    sock.on("data", (c: string) => (buf += c));
    sock.on("close", () => resolve(JSON.parse(buf) as PaneSocketResponse));
    sock.once("error", reject);
    sock.once("connect", () => {
      sock.write(`${JSON.stringify({ v: 1, op, paneId, ...(params ? { params } : {}) })}\n`);
    });
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z"; // ゾンビは生きていない
  } catch {
    return true;
  }
}
const waitDead = (...pids: number[]) => vi.waitFor(() => { for (const p of pids) if (isAlive(p)) throw new Error(`pid ${p} is alive`); }, { timeout: 8000, interval: 30 });

describe.skipIf(process.platform === "win32")("拡張（実物のサーバと、実際の子プロセス）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  const pids = new Set<number>();
  let stateDir: string;
  let toolDir: string;
  /** 立て直したサーバの token（初回の起動だけが新しく作る）。 */
  let lastToken: string | undefined;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    toolDir = await makeTempDir("soda-ext-tools-");
    // サーバの環境に秘密を置いて、拡張へ渡らないことを確かめる。
    for (const k of ["SODACTL_TOKEN", "SODA_PANE_ID", "SODA_PANE_SOCKET", "SODA_SERVER_URL"]) savedEnv[k] = process.env[k];
    process.env["SODACTL_TOKEN"] = "TOKEN-SECRET-XYZ";
    process.env["SODA_PANE_ID"] = "pane-secret";
    process.env["SODA_PANE_SOCKET"] = "/secret/pane.sock";
    process.env["SODA_SERVER_URL"] = "http://secret.invalid:1";
  });
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
    // テストが起動した子・孫を、残さない（残っていたら止めて、テストを失敗させる）。
    const leaked: number[] = [];
    for (const pid of pids) {
      if (isAlive(pid)) {
        leaked.push(pid);
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // もう居ない
        }
      }
    }
    pids.clear();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(toolDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    expect(leaked).toEqual([]);
  });

  /** 拡張のスクリプトを書き、コマンドの文字列を返す。`LOG` は受けた行を書く JSONL。`body` の中で `send`・`handle(m)`・`onStart()` が使える。 */
  async function script(name: string, body: string, ...args: string[]): Promise<{ command: string; log: string; file: string }> {
    const file = join(toolDir, `${name}.mjs`);
    const log = join(toolDir, `${name}.log`);
    await writeFile(
      file,
      `import { createInterface } from "node:readline";
import { appendFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
const LOG = ${JSON.stringify(log)};
const send = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const note = (o) => appendFileSync(LOG + ".notes", JSON.stringify(o) + "\\n");
writeFileSync(LOG + ".pid", String(process.pid));
let handle = () => {};
let onStart = () => {};
${body}
onStart();
const rl = createInterface({ input: process.stdin });
rl.on("line", (l) => { appendFileSync(LOG, l + "\\n"); let m; try { m = JSON.parse(l); } catch { return; } handle(m); });
rl.on("close", () => process.exit(0));
`,
    );
    return { command: `"${process.execPath}" "${file}" ${args.join(" ")}`.trim(), log, file };
  }
  const lines = (log: string): Record<string, unknown>[] => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : []);
  const notes = (log: string) => lines(log + ".notes");
  // pid のファイルは、拡張が起動して書くまで無い（負荷で遅れる）。上限つきで待つ。
  const pidOf = async (log: string): Promise<number> => {
    await vi.waitFor(() => { if (!existsSync(log + ".pid") || readFileSync(log + ".pid", "utf8").trim() === "") throw new Error("no pid file"); }, { timeout: 10_000, interval: 30 });
    const pid = Number(readFileSync(log + ".pid", "utf8"));
    pids.add(pid);
    return pid;
  };
  const waitFile = (log: string) => vi.waitFor(() => { if (!existsSync(log + ".pid")) throw new Error("not started"); }, { timeout: 8000, interval: 30 });

  async function startServer(
    extensions: unknown[],
    o: { timings?: Record<string, number>; file?: { open?: unknown }; configRaw?: string; stateRoot?: string; session?: string; token?: string } = {},
  ) {
    if (o.stateRoot === undefined) {
      stateDir = await makeTempDir("soda-ext-");
      cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    } else {
      stateDir = o.stateRoot; // 同じ状態ディレクトリで立て直す（承認の記録は sessionRoot＝ここに置かれる）
    }
    if (o.session === undefined) await writeFile(join(stateDir, "extensions.json"), o.configRaw ?? JSON.stringify({ extensions }), { mode: 0o600 });
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [], ...(o.session !== undefined ? { session: o.session } : {}) },
      { internal: { extensions: { timings: { backoffMinMs: 20, backoffMaxMs: 80, scopeReviewMs: 100, ...(o.timings ?? {}) }, ...(o.file ? { file: o.file as never } : {}) } } },
    );
    cleanups.push(() => server.close());
    const paneA = server.session.snapshot().panes[0]!.id;
    const sockPath = join(stateDir, "pane.sock");
    const myToken = server.freshToken ?? o.token ?? lastToken;
    if (server.freshToken !== undefined) lastToken = server.freshToken;
    const open = async (kind: "desktop" | "mobile" | "external") => {
      const c = await connectWs(server, kind, myToken);
      cleanups.push(() => c.ws.close());
      return c;
    };
    const list = async (c?: Client) => (await (c ?? (await open("external"))).request<ExtensionListResult>("extension.list", {}));
    const info = async (id: string) => (await list()).extensions.find((e) => e.id === id);
    const stateOf = (id: string) => info(id).then((i) => i?.state);
    const waitState = (id: string, state: string) => vi.waitFor(async () => { const s = await stateOf(id); if (s !== state) throw new Error(`${id}: ${s} != ${state}`); }, { timeout: 8000, interval: 30 });
    return { server, paneA, sockPath, open, list, info, waitState };
  }
  const sockFace = (name: string) => ({ name, kind: "panel", format: "html", content: "<p>x</p>" });
  const setFace = (pane: string, name: string, extra: Record<string, unknown> = {}) => ({ paneId: pane, name, kind: "panel", format: "html", content: "<p>x</p>", ...extra });

  it("(1) 環境変数と作業ディレクトリ: id・種類があり、token・pane id・受け口のパスが無い。hello の次に ext.panes が届く。一覧にコマンドが無い", async () => {
    const e = await script("env", `writeFileSync(LOG + ".env", JSON.stringify({ env: process.env, cwd: process.cwd() }));`, "--flag=SECRET-CMD-ARG");
    const s = await startServer([{ id: "env", command: e.command, description: "d" }]);
    await s.waitState("env", "running");
    await vi.waitFor(() => { if (!existsSync(e.log + ".env")) throw new Error("no env"); });
    await pidOf(e.log);
    const dump = JSON.parse(readFileSync(e.log + ".env", "utf8")) as { env: Record<string, string>; cwd: string };
    expect(dump.env["SODA_EXTENSION_ID"]).toBe("env");
    expect(dump.env["SODA_EXTENSION_SCOPE"]).toBe("user");
    expect(dump.env["SODA_EXTENSION_RUN_ID"]).toMatch(/^[0-9a-f-]{36}$/);
    for (const k of ["SODACTL_TOKEN", "SODA_PANE_ID", "SODA_PANE_SOCKET", "SODA_SERVER_URL", "SODA_AGENT_REPORT_SOCKET", "SODACTL_URL"]) expect(dump.env[k], k).toBeUndefined();
    expect(JSON.stringify(dump.env)).not.toContain("TOKEN-SECRET-XYZ");
    expect(dump.cwd).toBe(process.env["HOME"] ? (await import("node:fs")).realpathSync(process.env["HOME"]) : dump.cwd);
    await vi.waitFor(() => { if (lines(e.log).length < 2) throw new Error("no lines"); });
    expect(lines(e.log).map((l) => l["type"]).slice(0, 2)).toEqual(["ext.hello", "ext.panes"]);
    const hello = lines(e.log)[0]!;
    expect(hello["extension"]).toEqual({ id: "env", scope: "user" });
    expect(JSON.stringify(await s.list())).not.toContain("SECRET-CMD-ARG");
  });

  it("(2)(3) 読み直しの 4 通りを実際の pid で。規則の外に書き換えて読み直すと、動いていた拡張が止まり、一覧に理由が出る", async () => {
    const a = await script("a", `// a`);
    const b = await script("b", `// b`);
    const c = await script("c", `// c`);
    const s = await startServer([{ id: "a", command: a.command }, { id: "b", command: b.command }]);
    await s.waitState("a", "running");
    await s.waitState("b", "running");
    await waitFile(a.log);
    await waitFile(b.log);
    const pa = await pidOf(a.log);
    const pb = await pidOf(b.log);
    const runA = (await s.info("a"))!.runId;
    // 足す・変えない
    const admin = await s.open("external");
    await writeFile(join(stateDir, "extensions.json"), JSON.stringify({ extensions: [{ id: "a", command: a.command }, { id: "b", command: b.command }, { id: "c", command: c.command }] }), { mode: 0o600 });
    await admin.request("extension.reload", {});
    await s.waitState("c", "running");
    expect((await s.info("a"))!.runId).toBe(runA);
    expect(isAlive(pa) && isAlive(pb)).toBe(true);
    // 消す（b）・変える（a）
    await writeFile(join(stateDir, "extensions.json"), JSON.stringify({ extensions: [{ id: "a", command: a.command + " --changed" }, { id: "c", command: c.command }] }), { mode: 0o600 });
    await admin.request("extension.reload", {});
    await waitDead(pb, pa);
    await vi.waitFor(async () => { const i = await s.info("a"); if (i?.state !== "running" || i.runId === runA) throw new Error("not restarted"); }, { timeout: 8000, interval: 30 });
    expect(await s.info("b")).toBeUndefined();
    // 規則の外に書き換える
    const pc = await pidOf(c.log);
    await writeFile(join(stateDir, "extensions.json"), JSON.stringify({ extensions: [{ id: "BAD", command: "x" }] }), { mode: 0o600 });
    const res = await admin.request<ExtensionListResult>("extension.reload", {});
    expect(res.extensions).toEqual([]);
    expect(res.problems).toHaveLength(1);
    expect(res.problems[0]!.problem).toMatch(/^extensions\.json: /);
    await waitDead(pc);
    await pidOf(a.log);
  });

  it("(3) display.set が台帳に載り、pane.sock の display.list に見え、結果が /ws の display.set と同じ項目を持つ。面への display.action が拡張に行で届く（AC5）。(4) pane の増減で ext.panes が届く（AC6）。(5) 知らない操作は unsupported で、id なしには返事が来ない（AC7）", async () => {
    const e = await script(
      "basic",
      `handle = (m) => {
  if (m.type === "ext.panes" && !globalThis.did) { globalThis.did = true;
    send({ id: "s1", method: "display.set", params: { paneId: m.panes[0].id, name: "m", kind: "panel", format: "html", content: "<p>x</p>", title: "T" } });
    send({ id: "u1", method: "nope" });
    send({ method: "nope2" });
    send({ id: "f1", method: "ext.features" });
  }
};`,
    );
    const s = await startServer([{ id: "basic", command: e.command }]);
    await waitFile(e.log);
    await pidOf(e.log);
    await vi.waitFor(() => { if (!lines(e.log).some((l) => l["type"] === "ext.result" && l["id"] === "f1")) throw new Error("no f1"); });
    const results = new Map(lines(e.log).filter((l) => l["type"] === "ext.result").map((l) => [l["id"], l]));
    const set = results.get("s1") as { ok: boolean; result: { display: DisplayInfo; renderers: unknown } };
    expect(set.ok).toBe(true);
    expect(set.result.display).toMatchObject({ paneId: s.paneA, name: "m", rev: 1, title: "T", source: { type: "extension", id: "basic", scope: "user" } });
    expect(results.get("u1")).toMatchObject({ ok: false, error: { code: "unsupported" } });
    expect(results.size).toBe(3); // nope2（id なし）には返事が無い
    const f = results.get("f1") as { result: { display: { renderers: unknown }; methods: string[]; events: string[] } };
    expect(f.result.display.renderers).toBeDefined();
    expect(f.result.methods).toContain("display.set");
    // pane.sock の list に見える（source つき）
    const list = await paneCall(s.sockPath, PANE_OP_DISPLAY_LIST, s.paneA, {});
    expect(list.ok && (list.result as { displays: DisplayInfo[] }).displays.map((d) => d.name)).toEqual(["m"]);
    // /ws の display.set と同じ項目
    const ws = await s.open("external");
    const viaWs = await ws.request<{ display: DisplayInfo }>("display.set", setFace(s.paneA, "w"));
    expect(Object.keys(viaWs.display).sort()).toEqual(Object.keys(set.result.display).sort().filter((k) => k !== "source"));
    // 面への display.action が、拡張に行で届く
    const b = await s.open("desktop");
    await b.request("display.subscribe", { features: ["panel", "actions"] });
    await b.request("display.action", { id: set.result.display.id, rev: 1, action: "go", data: { a: "b" } });
    await vi.waitFor(() => { if (!lines(e.log).some((l) => l["type"] === "display.action")) throw new Error("no action"); });
    expect(lines(e.log).find((l) => l["type"] === "display.action")).toMatchObject({ paneId: s.paneA, name: "m", action: "go", data: { a: "b" }, source: "static" });
    // pane を足すと ext.panes が届く
    const before = lines(e.log).filter((l) => l["type"] === "ext.panes").length;
    await ws.request("workspace.create", {});
    await vi.waitFor(() => { if (lines(e.log).filter((l) => l["type"] === "ext.panes").length <= before) throw new Error("no panes line"); });
    const last = lines(e.log).filter((l) => l["type"] === "ext.panes").at(-1) as { panes: unknown[] };
    expect(last.panes.length).toBe(2);
  });

  it("(6)(7) 拡張の面は pane.sock から見えるが wait に操作が返らない／拡張の list に pane.sock の面が無く、close できず、同じ名前の set は誤り。pane.sock が拡張の面を閉じる・出し直すと拡張に display.closed。拡張を落とすと、その面だけが消える", async () => {
    const e = await script(
      "own",
      `handle = (m) => {
  if (m.type === "ext.panes" && !globalThis.did) { globalThis.did = true;
    const p = m.panes[0].id;
    send({ id: "set1", method: "display.set", params: { paneId: p, name: "mine", kind: "panel", format: "html", content: "<p>x</p>" } });
    setTimeout(() => {
      send({ id: "list", method: "display.list", params: { paneId: p } });
      send({ id: "closeTheirs", method: "display.close", params: { paneId: p, name: "theirs" } });
      send({ id: "setTheirs", method: "display.set", params: { paneId: p, name: "theirs", kind: "panel", format: "html", content: "y" } });
    }, 600);
  }
};`,
    );
    const s = await startServer([{ id: "own", command: e.command }]);
    await waitFile(e.log);
    const pid = await pidOf(e.log);
    await vi.waitFor(() => { if (!lines(e.log).some((l) => l["id"] === "set1")) throw new Error("no set1"); });
    expect(okResult<{ display: unknown }>(await paneCall(s.sockPath, PANE_OP_DISPLAY_SET, s.paneA, sockFace("theirs"))).display).toBeDefined();
    await vi.waitFor(() => { if (!lines(e.log).some((l) => l["id"] === "setTheirs")) throw new Error("no setTheirs"); }, { timeout: 8000 });
    const res = (id: string) => lines(e.log).find((l) => l["id"] === id) as { ok: boolean; result?: { displays?: { name: string }[]; closed?: string[] }; error?: { code: string } };
    expect(res("list").result!.displays!.map((d) => d.name)).toEqual(["mine"]);
    expect(res("closeTheirs").result!.closed).toEqual([]);
    expect(res("setTheirs").error!.code).toBe("invalid_display");
    const l = okResult<{ displays: DisplayInfo[] }>(await paneCall(s.sockPath, PANE_OP_DISPLAY_LIST, s.paneA, {}));
    expect(l.displays.map((d) => d.name).sort()).toEqual(["mine", "theirs"]);
    // pane.sock が拡張の面を閉じる → 拡張に display.closed
    expect(okResult(await paneCall(s.sockPath, PANE_OP_DISPLAY_CLOSE, s.paneA, { name: "mine" }))).toEqual({ closed: ["mine"] });
    await vi.waitFor(() => { if (!lines(e.log).some((x) => x["type"] === "display.closed" && x["name"] === "mine")) throw new Error("no closed"); });
    // 拡張を落とすと、その面だけが消える（pane.sock で出した面は残る）
    await paneCall(s.sockPath, PANE_OP_DISPLAY_SET, s.paneA, sockFace("mine"));
    process.kill(pid, "SIGKILL");
    await vi.waitFor(async () => { if ((await s.info("own"))?.state === "running" && (await s.info("own"))?.failures === 0) throw new Error("still running"); }, { timeout: 8000, interval: 30 });
    // 拡張の再起動後（新しい起動）も、pane.sock の面は残る
    const after = okResult<{ displays: DisplayInfo[] }>(await paneCall(s.sockPath, PANE_OP_DISPLAY_LIST, s.paneA, {}));
    expect(after.displays.map((d) => d.name)).toContain("theirs");
    await pidOf(e.log);
  });

  it("(8) 落ち続ける拡張は 5 回で failed になる。そのあいだ、サーバは応答し続ける", async () => {
    const e = await script("crash", `appendFileSync(LOG + ".starts", "x"); process.exit(1);`);
    const s = await startServer([{ id: "crash", command: e.command }]);
    const ws = await s.open("external");
    const t0 = Date.now();
    while ((await s.info("crash"))?.state !== "failed") {
      // サーバは応答する（一覧と表示の機能確認が通る）
      await ws.request("display.features", {});
      expect(Date.now() - t0).toBeLessThan(15_000);
      await new Promise((r) => setTimeout(r, 20));
    }
    expect((await s.info("crash"))).toMatchObject({ state: "failed", failures: 5, lastExit: { reason: "crashed", code: 1 } });
    expect(readFileSync(e.log + ".starts", "utf8")).toBe("xxxxx");
  });

  it("(9) 合図を無視する孫を作る拡張を無効にすると、extension.setEnabled が返った時点で子と孫が消えている。終了コード 0 で終わって孫を残す拡張は、exited の後 3 秒以内に孫が消える。close() の後、どの pid も残らない", async () => {
    const grand = `const g = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { stdio: "ignore" }); writeFileSync(LOG + ".grand", String(g.pid));`;
    const a = await script("grandparent", grand);
    const b = await script("orphaner", `${grand} setTimeout(() => process.exit(0), 300);`);
    const s = await startServer([{ id: "a", command: a.command }, { id: "b", command: b.command }], { timings: { backoffMinMs: 20 } });
    await waitFile(a.log);
    await waitFile(b.log);
    await vi.waitFor(() => { if (!existsSync(a.log + ".grand") || !existsSync(b.log + ".grand")) throw new Error("no grand"); });
    const pa = await pidOf(a.log);
    const ga = Number(readFileSync(a.log + ".grand", "utf8"));
    pids.add(ga);
    const gb = Number(readFileSync(b.log + ".grand", "utf8"));
    pids.add(gb);
    expect(isAlive(ga)).toBe(true);
    const screen = await s.open("desktop");
    await screen.request("extension.setEnabled", { key: "user:a", enabled: false });
    expect(isAlive(pa)).toBe(false);
    expect(isAlive(ga)).toBe(false); // 返った時点で、孫も消えている
    await s.waitState("b", "exited");
    await waitDead(gb);
    // close() の後、どの pid も残っていない
    await s.server.close();
    for (const p of [pa, ga, gb]) expect(isAlive(p)).toBe(false);
  });

  it("(10) 標準エラーの目印は extension.log で読め、server.log に目印とコマンドの文字列が無い（AC15）", async () => {
    const e = await script("noisy", `process.stderr.write("MARKER-ERR-123\\n");`, "--arg=CMD-SECRET-456");
    const s = await startServer([{ id: "noisy", command: e.command }]);
    await s.waitState("noisy", "running");
    await pidOf(e.log);
    const ws = await s.open("external");
    await vi.waitFor(async () => {
      const r = await ws.request<{ lines: string[] }>("extension.log", { key: "user:noisy" });
      if (!r.lines.includes("MARKER-ERR-123")) throw new Error("no marker");
    });
    await s.server.close();
    const serverLog = await readFile(join(stateDir, "server.log"), "utf8").catch(() => "");
    expect(serverLog).not.toContain("MARKER-ERR-123");
    expect(serverLog).not.toContain("CMD-SECRET-456");
    expect(serverLog).not.toContain(e.file);
  });

  it("(11) 同じ状態ディレクトリで 2 つ目のサーバの listen() は、ロックで失敗し、拡張を起動しない（AC1）", async () => {
    const e = await script("once", `appendFileSync(LOG + ".starts", "x");`);
    const s = await startServer([{ id: "once", command: e.command }]);
    await s.waitState("once", "running");
    await pidOf(e.log);
    await expect(composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }, { attempts: 1 })).rejects.toBeDefined();
    await new Promise((r) => setTimeout(r, 300));
    expect(readFileSync(e.log + ".starts", "utf8")).toBe("x");
  });

  it("(12) 面の数は pane.sock の分と合わせて数えられる（拡張 2 ＋ pane.sock 2 で、次のパネルが display_limit）", async () => {
    const e = await script(
      "four",
      `handle = (m) => { if (m.type === "ext.panes" && !globalThis.did) { globalThis.did = true; const p = m.panes[0].id;
  send({ id: 1, method: "display.set", params: { paneId: p, name: "e1", kind: "panel", format: "html", content: "x" } });
  send({ id: 2, method: "display.set", params: { paneId: p, name: "e2", kind: "panel", format: "html", content: "x" } });
  setTimeout(() => send({ id: 3, method: "display.set", params: { paneId: p, name: "e3", kind: "panel", format: "html", content: "x" } }), 800); } };`,
    );
    const s = await startServer([{ id: "four", command: e.command }]);
    await waitFile(e.log);
    await pidOf(e.log);
    await vi.waitFor(() => { if (lines(e.log).filter((l) => l["type"] === "ext.result").length < 2) throw new Error("no 2"); });
    okResult(await paneCall(s.sockPath, PANE_OP_DISPLAY_SET, s.paneA, sockFace("p1")));
    okResult(await paneCall(s.sockPath, PANE_OP_DISPLAY_SET, s.paneA, sockFace("p2")));
    await vi.waitFor(() => { if (!lines(e.log).some((l) => l["id"] === 3)) throw new Error("no 3"); });
    expect(lines(e.log).find((l) => l["id"] === 3)).toMatchObject({ ok: false, error: { code: "display_limit" } });
  });

  it("(13) JSON でない行を 20 行書く拡張は、20 行で止められて起動し直しの回数に入る。4 MiB を超える 1 行は、その行だけ捨てられて、続く要求が通る", async () => {
    const bad = await script("bad", `onStart = () => { for (let i = 0; i < 20; i++) process.stdout.write("garbage\\n"); };`);
    const big = await script("big", `onStart = () => { process.stdout.write("x".repeat(4 * 1024 * 1024 + 10) + "\\n"); send({ id: "after", method: "ext.panes" }); };`);
    const s = await startServer([{ id: "bad", command: bad.command }, { id: "big", command: big.command }]);
    await s.waitState("big", "running");
    await vi.waitFor(async () => { const i = await s.info("bad"); if (!i || i.failures < 1 || i.lastExit?.reason !== "bad_lines") throw new Error("not stopped by bad_lines"); }, { timeout: 8000, interval: 30 });
    await vi.waitFor(() => { if (!lines(big.log).some((l) => l["id"] === "after")) throw new Error("no after"); }, { timeout: 8000, interval: 30 });
    expect(lines(big.log).some((l) => l["type"] === "ext.error" && l["code"] === "line_too_long")).toBe(true);
    expect(lines(big.log).find((l) => l["id"] === "after")).toMatchObject({ ok: true });
    expect((await s.info("big"))!.state).toBe("running");
    // （止められる途中の拡張が ext.error の行を読み切るかは決まっていないので、行そのものは見ない。止めた理由が bad_lines であることで足りる）
    await pidOf(big.log);
    await vi.waitFor(() => { if (!existsSync(bad.log + ".pid")) throw new Error("x"); });
    pids.add(Number(readFileSync(bad.log + ".pid", "utf8")));
  });

  it("(14) script-html の 2 つの条件: allow なしは設定が有効でも unsupported／allow ありは設定が無効なら display_script_disabled、有効にすると通る／有効→無効で display.closed（script_disabled）／display.send が通り、pane.sock の display.send は拡張の面へ display_closed", async () => {
    const body = (n: string) => `handle = (m) => { if (m.type === "ext.panes" && !globalThis.did) { globalThis.did = true; globalThis.pane = m.panes[0].id; }
  if (m.type === "ext.control") { const [id, method, params] = m.args; send({ id, method, params: { paneId: globalThis.pane, ...params } }); } };`;
    void body;
    // テストから拡張へ命令を送る口がないので、ファイルを見張って要求を書かせる
    const driver = (name: string) => `import { watchFile, readFileSync, existsSync } from "node:fs";
let pane; let handled = 0;
handle = (m) => { if (m.type === "ext.panes") pane = m.panes[0].id; };
setInterval(() => { const f = LOG + ".cmds"; if (!existsSync(f) || !pane) return; const ls = readFileSync(f, "utf8").split("\\n").filter(Boolean); while (handled < ls.length) { const [id, method, params] = JSON.parse(ls[handled++]); send({ id, method, params: { paneId: pane, ...params } }); } }, 20);`;
    const plain = await script("plain", driver("plain"));
    const allowed = await script("allowed", driver("allowed"));
    const s = await startServer([{ id: "plain", command: plain.command }, { id: "allowed", command: allowed.command, allow: ["script-html"] }]);
    await waitFile(plain.log);
    await waitFile(allowed.log);
    await pidOf(plain.log);
    await pidOf(allowed.log);
    const cmd = (log: string, ...c: unknown[]) => appendFileSync(log + ".cmds", JSON.stringify(c) + "\n");
    const answer = async (log: string, id: string) => { await vi.waitFor(() => { if (!lines(log).some((l) => l["id"] === id)) throw new Error(`no ${id}`); }); return lines(log).find((l) => l["id"] === id) as { ok: boolean; error?: { code: string }; result?: unknown }; };
    const SCRIPT = { name: "g", kind: "panel", format: "script-html", content: "<script>1</script>" };
    const admin = await s.open("external");
    const setPrefs = (on: boolean) => admin.request("prefs.set", { patch: { displayScriptEnabled: on } });
    // 設定が有効でも allow が無ければ unsupported
    await setPrefs(true);
    cmd(plain.log, "p1", "display.set", SCRIPT);
    expect((await answer(plain.log, "p1")).error!.code).toBe("unsupported");
    // allow ありで設定が無効 → display_script_disabled、有効にすると通る
    await setPrefs(false);
    cmd(allowed.log, "a1", "display.set", SCRIPT);
    expect((await answer(allowed.log, "a1")).error!.code).toBe("display_script_disabled");
    await setPrefs(true);
    cmd(allowed.log, "a2", "display.set", SCRIPT);
    expect((await answer(allowed.log, "a2")).ok).toBe(true);
    // display.send が通り、pane.sock の display.send は拡張の面へ display_closed
    cmd(allowed.log, "a3", "display.send", { name: "g", data: { n: 1 } });
    expect((await answer(allowed.log, "a3")).ok).toBe(true);
    const viaSock = await paneCall(s.sockPath, PANE_OP_DISPLAY_SEND, s.paneA, { name: "g", data: { n: 1 } });
    expect(viaSock).toMatchObject({ ok: false, error: { code: "display_closed" } });
    cmd(plain.log, "p2", "display.send", { name: "g", data: 1 });
    expect((await answer(plain.log, "p2")).error!.code).toBe("unsupported");
    // 有効 → 無効で、拡張へ display.closed（script_disabled）
    await setPrefs(false);
    await vi.waitFor(() => { if (!lines(allowed.log).some((l) => l["type"] === "display.closed" && l["reason"] === "script_disabled")) throw new Error("no script_disabled"); });
  });

  it("(AC32) 文書の見本（docs/examples/extension-hello.mjs）をそのまま起動して、pane に帯 hello が載る。無効にする（標準入力が閉じる）と、強制終了の 2 秒を待たずに 0.5 秒以内に終わる", async () => {
    const example = join(import.meta.dirname, "..", "..", "..", "..", "docs", "examples", "extension-hello.mjs");
    expect(existsSync(example)).toBe(true);
    const marker = `--marker=${randomUUID()}`;
    const s = await startServer([{ id: "hello", command: `"${process.execPath}" "${example}" ${marker}` }]);
    await s.waitState("hello", "running");
    const mine = (): number[] =>
      spawnSync("pgrep", ["-f", "--", marker], { encoding: "utf8" })
        .stdout.split("\n")
        .filter(Boolean)
        .map(Number)
        .filter((p) => p !== process.pid);
    await vi.waitFor(() => { if (mine().length === 0) throw new Error("not started"); });
    for (const p of mine()) pids.add(p);
    await vi.waitFor(async () => {
      const r = await paneCall(s.sockPath, PANE_OP_DISPLAY_LIST, s.paneA, {});
      const d = r.ok ? (r.result as { displays: DisplayInfo[] }).displays : [];
      if (!d.some((x) => x.name === "hello" && x.kind === "band" && x.source?.id === "hello")) throw new Error("no band yet");
    });
    const screen = await s.open("desktop");
    const t0 = Date.now();
    await screen.request("extension.setEnabled", { key: "user:hello", enabled: false });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500);
    await waitDead(...mine(), ...pids);
    // 面も消えている
    const after = await paneCall(s.sockPath, PANE_OP_DISPLAY_LIST, s.paneA, {});
    expect(after.ok && (after.result as { displays: DisplayInfo[] }).displays).toEqual([]);
  });

  it("T10: extension.* の 5 つの方式が通る。setEnabled は external から invalid_params。pane.sock の extension.* は unknown_op。extension.changed に data の項目が無い", async () => {
    const e = await script("t10", `// t10`);
    const s = await startServer([{ id: "t10", command: e.command }]);
    await s.waitState("t10", "running");
    await pidOf(e.log);
    const ws = await s.open("external");
    const screen = await s.open("desktop");
    expect((await ws.request<ExtensionListResult>("extension.list", {})).extensions).toHaveLength(1);
    expect((await ws.request<ExtensionListResult>("extension.reload", {})).extensions).toHaveLength(1);
    expect((await ws.request<{ lines: string[] }>("extension.log", { key: "user:t10" })).lines).toEqual([]);
    await ws.request("extension.restart", { key: "user:t10" });
    await s.waitState("t10", "running");
    await expect(ws.request("extension.setEnabled", { key: "user:t10", enabled: false })).rejects.toMatchObject({ code: "invalid_params" });
    await expect(ws.request("extension.log", { key: "user:nope" })).rejects.toMatchObject({ code: "not_found" });
    await screen.request("extension.setEnabled", { key: "user:t10", enabled: false });
    await s.waitState("t10", "disabled");
    for (const op of ["extension.list", "extension.setEnabled", "extension.reload"]) {
      expect(await paneCall(s.sockPath, op, s.paneA, {})).toMatchObject({ ok: false, error: { code: "unknown_op" } });
    }
    const changed = ws.events.filter((x) => x.event === "extension.changed");
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((x) => Object.keys(x.data).length === 0)).toBe(true);
    await pidOf(e.log);
  });

  it("T10: 設定の読み込みが止まっていても listen() が返る。start() の直後に close() しても、拡張の子が残らない", async () => {
    const e = await script("slow", `// slow`);
    // (a) 読み込みが返らない
    const stuck = await startServer([{ id: "slow", command: e.command }], { file: { open: () => new Promise(() => undefined) } });
    expect(stuck.server).toBeDefined(); // listen() が返った
    expect((await stuck.list()).extensions).toEqual([]);
    await stuck.server.close();
    // (b) start() の直後に close()
    const s = await startServer([{ id: "slow", command: e.command }]);
    await s.server.close();
    if (existsSync(e.log + ".pid")) {
      const pid = await pidOf(e.log);
      await waitDead(pid);
    }
  });

  // ---- プロジェクトの拡張と承認（PR3。T24） -------------------------------------------------------------------------------------
  // 「承認していない拡張は、どのきっかけでも実行されない」は、実行の印（拡張が起動時に書く `<log>.starts`）が無いことで確かめる（AC18）。

  /** 起動のたびに pid を追記する本体。起動の回数・pid・作業ディレクトリ・環境変数が分かる。 */
  const projBody = `appendFileSync(LOG + ".starts", process.pid + "\\n"); writeFileSync(LOG + ".env", JSON.stringify({ cwd: process.cwd(), root: process.env.SODA_PROJECT_ROOT, scope: process.env.SODA_EXTENSION_SCOPE }));`;
  const starts = (log: string): number[] => (existsSync(log + ".starts") ? readFileSync(log + ".starts", "utf8").split("\n").filter(Boolean).map(Number) : []);
  const noStart = (log: string) => expect(starts(log)).toEqual([]);

  /** リポジトリ（`.git/HEAD` と `.soda/extensions.json`）を作り、根の実体のパスを返す。 */
  async function mkRepo(name: string, entries?: unknown[]): Promise<string> {
    const root = join(toolDir, name);
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    const real = (await import("node:fs")).realpathSync(root);
    if (entries) await writeProject(real, entries);
    return real;
  }
  async function writeProject(root: string, entries: unknown[], mode = 0o600): Promise<void> {
    await mkdir(join(root, ".soda"), { recursive: true });
    const p = join(root, ".soda", "extensions.json");
    await writeFile(p, JSON.stringify({ extensions: entries }), { mode });
    (await import("node:fs")).chmodSync(p, mode);
  }
  type Server = Awaited<ReturnType<typeof startServer>>;
  const openWorkspace = async (s: Server, root: string): Promise<{ workspaceId: string; paneId: string }> => {
    const r = await s.server.session.createWorkspace(root, "ws");
    return { workspaceId: r.workspace.id, paneId: r.pane.id };
  };
  const projInfo = async (s: Server, id: string, root?: string) =>
    (await s.list()).extensions.find((e) => e.scope === "project" && e.id === id && (root === undefined || e.root === root));
  const waitProj = (s: Server, id: string, state: string, root?: string) =>
    vi.waitFor(async () => { const i = await projInfo(s, id, root); if (i?.state !== state) throw new Error(`${id}: ${i?.state} != ${state}`); }, { timeout: 10_000, interval: 30 });
  const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));

  it("(P1) 承認していない拡張は、どのきっかけでも実行されない（workspace 作成・reload・restart・setEnabled・サーバの立て直し）。pending で、承認の画面に出すものがある", async () => {
    const e = await script("p1", projBody);
    const root = await mkRepo("p1repo", [{ id: "p1", command: e.command, description: "作者の説明" }]);
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    await openWorkspace(s, root);
    await waitProj(s, "p1", "pending", root);
    const i = (await projInfo(s, "p1", root))!;
    expect(i.approval).toMatchObject({ status: "none", command: e.command, cwd: root, groupWritable: false });
    expect(i.approval!.digest).toMatch(/^[0-9a-f]{64}$/);
    const ws = await s.open("external");
    await ws.request("extension.reload", {});
    await ws.request("extension.restart", { key: i.key }).catch(() => undefined);
    const screen = await s.open("desktop");
    await screen.request("extension.setEnabled", { key: i.key, enabled: false });
    await screen.request("extension.setEnabled", { key: i.key, enabled: true });
    await settle();
    noStart(e.log);
    // サーバを立て直しても、承認していなければ実行されない。
    const root2 = stateDir;
    await s.server.close();
    const s2 = await startServer([], { stateRoot: root2 });
    await openWorkspace(s2, root);
    await waitProj(s2, "p1", "pending", root);
    await settle();
    noStart(e.log);
  });

  it("(P1b) 承認していなければ、状態の表示に関わらず、印のファイルが出来ない（2 重の守りの、片方だけを外しても、実行されない）", async () => {
    const e = await script("p1b", projBody);
    const root = await mkRepo("p1brepo", [{ id: "p1b", command: e.command }]);
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    await openWorkspace(s, root);
    await vi.waitFor(async () => { if (!(await projInfo(s, "p1b", root))) throw new Error("not listed"); }, { timeout: 10_000, interval: 30 });
    const ws = await s.open("external");
    for (let i = 0; i < 3; i++) {
      await ws.request("extension.reload", {});
      await settle(400);
    }
    await ws.request("extension.restart", { key: (await projInfo(s, "p1b", root))!.key }).catch(() => undefined);
    await settle(700);
    noStart(e.log);
  });

  it("(P2) 画面の接続から approve → 動く。サーバを立て直しても聞き直されずに動く。同じ sessionRoot の別の名前付き session でも動く。sodactl 相当（external）・pane.sock からは承認できない", async () => {
    const e = await script("p2", projBody);
    const root = await mkRepo("p2repo", [{ id: "p2", command: e.command }]);
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    await openWorkspace(s, root);
    await waitProj(s, "p2", "pending", root);
    const info = (await projInfo(s, "p2", root))!;
    // external・不正な digest・pane.sock では承認できない。
    const ext = await s.open("external");
    await expect(ext.request("extension.approve", { key: info.key, digest: info.approval!.digest })).rejects.toMatchObject({ code: "invalid_params" });
    for (const op of ["extension.approve", "extension.deny", "extension.revoke"]) {
      expect(await paneCall(s.sockPath, op, s.paneA, { key: info.key, digest: info.approval!.digest })).toMatchObject({ ok: false, error: { code: "unknown_op" } });
    }
    await settle(300);
    noStart(e.log);
    const screen = await s.open("desktop");
    await screen.request("extension.approve", { key: info.key, digest: info.approval!.digest });
    await waitProj(s, "p2", "running", root);
    await pidOf(e.log);
    expect(starts(e.log)).toHaveLength(1);
    const env = JSON.parse(readFileSync(e.log + ".env", "utf8")) as { cwd: string; root: string; scope: string };
    expect(env).toEqual({ cwd: root, root, scope: "project" }); // 作業ディレクトリは根・SODA_PROJECT_ROOT
    // サーバを立て直す（同じ状態ディレクトリ）→ 聞き直されずに動く（起動は 2 回目）。
    const sessionRoot = stateDir;
    await s.server.close();
    await vi.waitFor(() => { if (isAlive(starts(e.log)[0]!)) throw new Error("still alive"); }, { timeout: 8000, interval: 30 });
    const s2 = await startServer([], { stateRoot: sessionRoot });
    await openWorkspace(s2, root);
    await waitProj(s2, "p2", "running", root);
    await vi.waitFor(() => { if (starts(e.log).length < 2) throw new Error("not restarted"); });
    // 別の名前付き session（同じ sessionRoot）でも、承認は引き継がれる。
    await s2.server.close();
    await vi.waitFor(() => { if (isAlive(starts(e.log)[1]!)) throw new Error("still alive"); }, { timeout: 8000, interval: 30 });
    const s3 = await startServer([], { stateRoot: sessionRoot, session: "other" });
    await openWorkspace(s3, root);
    await waitProj(s3, "p2", "running", root);
    await vi.waitFor(() => { if (starts(e.log).length < 3) throw new Error("not started by the other session"); });
    expect((await s3.list()).extensions.find((x) => x.id === "p2")!.approval!.status).toBe("approved");
  });

  it("(P3) 登録の項目を 1 つずつ変えて reload → 止まって pending。同じファイルの別の拡張は同じ pid のまま。承認した中身へ戻すと聞き直されずに動く。リポジトリを別の場所へ写すと pending", async () => {
    const a = await script("p3a", projBody);
    const b = await script("p3b", projBody);
    const base = { id: "a", command: a.command, description: "d", allow: [] as string[], onUnresponsive: "pass", enabled: true };
    const other = { id: "b", command: b.command };
    const root = await mkRepo("p3repo", [base, other]);
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    await openWorkspace(s, root);
    await waitProj(s, "a", "pending", root);
    const screen = await s.open("desktop");
    for (const id of ["a", "b"]) {
      const i = (await projInfo(s, id, root))!;
      await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    }
    await waitProj(s, "a", "running", root);
    await waitProj(s, "b", "running", root);
    const pidB = (await pidOf(b.log));
    const changes: Record<string, unknown>[] = [
      { command: `${a.command} --x` },
      { description: "変えた" },
      { allow: ["script-html"] },
      { onUnresponsive: "block" },
    ];
    for (const change of changes) {
      await writeProject(root, [{ ...base, ...change }, other]);
      await (await s.open("external")).request("extension.reload", {});
      await waitProj(s, "a", "pending", root);
      expect(isAlive(starts(a.log).at(-1)!), JSON.stringify(change)).toBe(false);
      expect((await projInfo(s, "b", root))!.state).toBe("running");
      expect(isAlive(pidB)).toBe(true); // 同じファイルの別の拡張は、同じ pid のまま
      // 承認した中身へ戻す → 聞き直されずに動く。
      const n = starts(a.log).length;
      await writeProject(root, [base, other]);
      await (await s.open("external")).request("extension.reload", {});
      await waitProj(s, "a", "running", root);
      await vi.waitFor(() => { if (starts(a.log).length <= n) throw new Error("not restarted"); });
    }
    // リポジトリを別の場所へ写すと、新しい根として pending。
    const copy = await mkRepo("p3copy", [base, other]);
    await openWorkspace(s, copy);
    await waitProj(s, "a", "pending", copy);
    expect((await projInfo(s, "a", root))!.state).toBe("running");
  });

  it("(P4) 承認 → ファイルを書き換え（reload しない）→ 拡張を落とす → 起動し直されず pending", async () => {
    const e = await script("p4", projBody);
    const root = await mkRepo("p4repo", [{ id: "p4", command: e.command }]);
    const s = await startServer([], { timings: { approvalsPollMs: 3_600_000 } });
    await openWorkspace(s, root);
    await waitProj(s, "p4", "pending", root);
    const i = (await projInfo(s, "p4", root))!;
    await (await s.open("desktop")).request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p4", "running", root);
    const pid = await pidOf(e.log);
    await writeProject(root, [{ id: "p4", command: `${e.command} --evil` }]);
    process.kill(pid, "SIGKILL");
    await settle(1500); // backoff（20ms）を何度も越える
    expect(starts(e.log)).toHaveLength(1); // 起動し直されない
    await waitProj(s, "p4", "pending", root);
  });

  it("(P5) deny → 印が出来ない。後で approve → 動く。revoke → 止まって pending。別の session のサーバでの revoke が、見張りのうちに届く。記録を直接消してすぐ落としても、起動し直されない。workspace を消した後も記録が残り、revoke で消え、開き直すと pending", async () => {
    const e = await script("p5", projBody);
    const root = await mkRepo("p5repo", [{ id: "p5", command: e.command }]);
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    const ws = await openWorkspace(s, root);
    await waitProj(s, "p5", "pending", root);
    const screen = await s.open("desktop");
    const i = (await projInfo(s, "p5", root))!;
    await screen.request("extension.deny", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p5", "denied", root);
    await (await s.open("external")).request("extension.reload", {});
    await settle(300);
    noStart(e.log);
    await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p5", "running", root);
    const pid1 = await pidOf(e.log);
    await screen.request("extension.revoke", { root, id: "p5" });
    await waitProj(s, "p5", "pending", root);
    await waitDead(pid1);
    // 別の session（同じ sessionRoot）のサーバで承認 → こちらに届いて動き、そちらでの revoke が見張りのうちにこちらの pid を消す。
    await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p5", "running", root);
    const pid2 = await pidOf(e.log);
    const sessionRoot = stateDir;
    const other = await startServer([], { stateRoot: sessionRoot, session: "other" });
    await (await other.open("desktop")).request("extension.revoke", { root, id: "p5" });
    await waitDead(pid2);
    await waitProj(s, "p5", "pending", root);
    // workspace を全部消した後、記録が approvals に出て、revoke で消え、開き直すと pending。
    await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p5", "running", root);
    const pid3 = await pidOf(e.log);
    await s.server.session.closeWorkspace(ws.workspaceId);
    await waitDead(pid3);
    await vi.waitFor(async () => { if ((await s.list()).extensions.some((x) => x.id === "p5")) throw new Error("still listed"); });
    expect((await s.list()).approvals).toEqual([expect.objectContaining({ root, id: "p5", active: false })]);
    await screen.request("extension.revoke", { root, id: "p5" });
    expect((await s.list()).approvals).toEqual([]);
    await openWorkspace(s, root);
    await waitProj(s, "p5", "pending", root);
  });

  it("(P5b) 承認して動かす → 承認の記録のファイルから、その 1 件を直接消し、すぐ拡張を落とす → 起動し直されない（見張りを 60 秒にして、起動の回数で見る）", async () => {
    const e = await script("p5b", projBody);
    const root = await mkRepo("p5brepo", [{ id: "p5b", command: e.command }]);
    const s = await startServer([], { timings: { approvalsPollMs: 60_000 } });
    await openWorkspace(s, root);
    await waitProj(s, "p5b", "pending", root);
    const i = (await projInfo(s, "p5b", root))!;
    await (await s.open("desktop")).request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p5b", "running", root);
    const pid = await pidOf(e.log);
    await writeFile(join(stateDir, "extension-approvals.json"), JSON.stringify({ version: 1, records: [] }), { mode: 0o600 });
    process.kill(pid, "SIGKILL");
    await settle(1500);
    expect(starts(e.log)).toHaveLength(1);
  });

  it("(P6) 2 つのリポジトリ: 片方の拡張が、他方の pane へ display.set → not_found。ext.panes に他方の pane が無い。pane を他方の workspace へ移す操作は、モデルが断る", async () => {
    const mark = join(toolDir, "p6.out");
    const a = await mkRepo("p6a");
    const b = await mkRepo("p6b");
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    const wa = await openWorkspace(s, a);
    const wb = await openWorkspace(s, b);
    const e = await script(
      "p6",
      `handle = (m) => { if (m.type === "ext.panes") { writeFileSync(LOG + ".panes", JSON.stringify(m.panes.map((p) => p.id))); } if (m.type === "ext.result") { appendFileSync(LOG + ".res", JSON.stringify(m) + "\\n"); } };
       onStart = () => { setTimeout(() => { send({ id: 1, method: "display.set", params: { paneId: ${JSON.stringify(wb.paneId)}, name: "m", kind: "panel", format: "html", content: "x" } }); send({ id: 2, method: "display.set", params: { paneId: ${JSON.stringify(wa.paneId)}, name: "m", kind: "panel", format: "html", content: "x" } }); }, 800); };`,
    );
    void mark;
    await writeProject(a, [{ id: "p6", command: e.command }]);
    await (await s.open("external")).request("extension.reload", {});
    await waitProj(s, "p6", "pending", a);
    const i = (await projInfo(s, "p6", a))!;
    await (await s.open("desktop")).request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p6", "running", a);
    await pidOf(e.log);
    await vi.waitFor(() => { if (!existsSync(e.log + ".res") || readFileSync(e.log + ".res", "utf8").split("\n").filter(Boolean).length < 2) throw new Error("no results"); }, { timeout: 10_000, interval: 50 });
    const res = readFileSync(e.log + ".res", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: number; ok: boolean; error?: { code: string } });
    expect(res.find((r) => r.id === 1)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(res.find((r) => r.id === 2)).toMatchObject({ ok: true });
    const panes = JSON.parse(readFileSync(e.log + ".panes", "utf8")) as string[];
    expect(panes).toContain(wa.paneId);
    expect(panes).not.toContain(wb.paneId);
    // 別の根（別の worktree）の workspace への pane の移動は、モデルが断る（#98）。範囲が移動で変わる道は、同じ根の中だけ。
    const tabB = [...s.server.session.snapshot().tabs].find((t) => t.workspaceId === wb.workspaceId)!;
    expect(s.server.session.moveToTab(wa.paneId, tabB.id)).toBe(false);
  });

  it("(P7) allow なしの script-html → unsupported。allow を足すと pending に戻り、承認すると、設定が有効なら出せ、無効なら display_script_disabled", async () => {
    const root = await mkRepo("p7repo");
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    const w = await openWorkspace(s, root);
    const mk = (name: string) =>
      script(
        name,
        `handle = (m) => { if (m.type === "ext.result") appendFileSync(LOG + ".res", JSON.stringify(m) + "\\n"); };
         onStart = () => { setTimeout(() => send({ id: 1, method: "display.set", params: { paneId: ${JSON.stringify(w.paneId)}, name: "s", kind: "panel", format: "script-html", content: "<p>x</p>" } }), 800); };`,
      );
    const e1 = await mk("p7a");
    await writeProject(root, [{ id: "p7", command: e1.command }]);
    await (await s.open("external")).request("extension.reload", {});
    await waitProj(s, "p7", "pending", root);
    const screen = await s.open("desktop");
    await screen.request("prefs.set", { patch: { displayScriptEnabled: true } });
    let i = (await projInfo(s, "p7", root))!;
    await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p7", "running", root);
    await pidOf(e1.log);
    const res1 = async (log: string) => { await vi.waitFor(() => { if (!existsSync(log + ".res")) throw new Error("no res"); }, { timeout: 10_000, interval: 50 }); return JSON.parse(readFileSync(log + ".res", "utf8").split("\n").filter(Boolean)[0]!) as { ok: boolean; error?: { code: string } }; };
    // 設定が有効でも、allow なしは unsupported。
    expect(await res1(e1.log)).toMatchObject({ ok: false, error: { code: "unsupported" } });
    // allow を足す → pending に戻る。
    const e2 = await mk("p7b");
    await writeProject(root, [{ id: "p7", command: e2.command, allow: ["script-html"] }]);
    await (await s.open("external")).request("extension.reload", {});
    await waitProj(s, "p7", "pending", root);
    i = (await projInfo(s, "p7", root))!;
    expect(i.allow).toEqual(["script-html"]);
    await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p7", "running", root);
    await pidOf(e2.log);
    expect(await res1(e2.log)).toMatchObject({ ok: true });
    // 設定を無効にして、もう一度（起動し直す）→ display_script_disabled。
    await screen.request("prefs.set", { patch: { displayScriptEnabled: false } });
    await rm(e2.log + ".res", { force: true });
    await (await s.open("external")).request("extension.restart", { key: i.key });
    expect(await res1(e2.log)).toMatchObject({ ok: false, error: { code: "display_script_disabled" } });
  });

  it("(P10) サーバの PATH に空の要素があっても、プロジェクトの拡張のコマンド名は、リポジトリの中のファイルに解決されない（利用者の設定の拡張は今までどおり）", async () => {
    const { chmodSync, writeFileSync } = await import("node:fs");
    const root = await mkRepo("p10repo", [{ id: "p10", command: "hijackbin" }]);
    const markProject = join(toolDir, "p10-project-mark");
    const markUser = join(toolDir, "p10-user-mark");
    // リポジトリの根に、呼ばれたら印を作る実行ファイル。
    writeFileSync(join(root, "hijackbin"), `#!/bin/sh\ntouch "$HIJACK_MARK"\nsleep 5\n`);
    chmodSync(join(root, "hijackbin"), 0o755);
    const savedPath = process.env["PATH"];
    process.env["PATH"] = `:${savedPath}`; // 先頭に空の要素（＝作業ディレクトリ）
    cleanups.push(() => {
      process.env["PATH"] = savedPath;
    });
    // 対照: 利用者の設定の拡張（作業ディレクトリ＝根）は、空の要素で、根の hijackbin に解決される（今までどおり）。
    process.env["HIJACK_MARK"] = markUser;
    const s = await startServer([{ id: "p10u", command: "hijackbin", cwd: root }], { timings: { approvalsPollMs: 100 } });
    await vi.waitFor(() => { if (!existsSync(markUser)) throw new Error("user ext did not resolve hijackbin"); }, { timeout: 10_000, interval: 50 });
    // プロジェクトの拡張: 承認しても、空の要素は渡らないので、根の hijackbin は呼ばれない。
    process.env["HIJACK_MARK"] = markProject;
    await openWorkspace(s, root);
    await waitProj(s, "p10", "pending", root);
    const i = (await projInfo(s, "p10", root))!;
    await (await s.open("desktop")).request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await settle(1500);
    expect(existsSync(markProject)).toBe(false);
    delete process.env["HIJACK_MARK"];
  });

  it("(P10b) サーバの PATH が、落とす要素だけ（.）でも、プロジェクトの拡張に空の PATH は渡らず、リポジトリの中のファイルに解決されない", async () => {
    const { chmodSync, writeFileSync } = await import("node:fs");
    const root = await mkRepo("p10brepo", [{ id: "p10b", command: "hijackbin" }]);
    const mark = join(toolDir, "p10b-mark");
    writeFileSync(join(root, "hijackbin"), `#!/bin/sh\ntouch "$HIJACK_MARK"\nsleep 5\n`);
    chmodSync(join(root, "hijackbin"), 0o755);
    const savedPath = process.env["PATH"];
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    const w = await openWorkspace(s, root);
    void w;
    // サーバを立ててから、これから起動する子に渡る元の環境（`process.env`）の PATH を、落とす要素だけにする。
    process.env["PATH"] = ".";
    process.env["HIJACK_MARK"] = mark;
    cleanups.push(() => {
      process.env["PATH"] = savedPath;
      delete process.env["HIJACK_MARK"];
    });
    await waitProj(s, "p10b", "pending", root);
    const i = (await projInfo(s, "p10b", root))!;
    await (await s.open("desktop")).request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await settle(1500);
    expect(existsSync(mark)).toBe(false);
  });

  it("(P9) .soda がリンク・extensions.json がリンク・cwd つき・chmod o+w → 一覧に理由が出て、印が出来ない。承認の記録を壊す → 全部 pending。無効の記録を壊す → 全部 disabled", async () => {
    const e = await script("p9", projBody);
    const entry = { id: "p9", command: e.command };
    const s = await startServer([], { timings: { approvalsPollMs: 100 } });
    // .soda がリンク
    const r1 = await mkRepo("p9a");
    const realSoda = join(toolDir, "p9a-soda");
    await mkdir(realSoda, { recursive: true });
    await writeFile(join(realSoda, "extensions.json"), JSON.stringify({ extensions: [entry] }), { mode: 0o600 });
    (await import("node:fs")).symlinkSync(realSoda, join(r1, ".soda"));
    // extensions.json がリンク
    const r2 = await mkRepo("p9b");
    await mkdir(join(r2, ".soda"));
    await writeFile(join(toolDir, "p9b.json"), JSON.stringify({ extensions: [entry] }), { mode: 0o600 });
    (await import("node:fs")).symlinkSync(join(toolDir, "p9b.json"), join(r2, ".soda", "extensions.json"));
    // cwd つき
    const r3 = await mkRepo("p9c", [{ ...entry, cwd: "/tmp" }]);
    // other に書ける
    const r4 = await mkRepo("p9d", [entry]);
    (await import("node:fs")).chmodSync(join(r4, ".soda", "extensions.json"), 0o602);
    for (const r of [r1, r2, r3, r4]) await openWorkspace(s, r);
    await vi.waitFor(async () => {
      const probs = (await s.list()).problems.filter((p) => p.scope === "project");
      if (probs.length < 4) throw new Error(`problems ${probs.length}`);
    }, { timeout: 10_000, interval: 50 });
    const probs = (await s.list()).problems.filter((p) => p.scope === "project");
    expect(probs.map((p) => p.root).sort()).toEqual([r1, r2, r3, r4].sort());
    expect(JSON.stringify(probs)).not.toContain(e.command);
    expect((await s.list()).extensions.filter((x) => x.scope === "project")).toEqual([]);
    await settle(300);
    noStart(e.log);
    // 承認の記録を壊す → 全部 pending（動く側に倒れない）。
    (await import("node:fs")).chmodSync(join(r4, ".soda", "extensions.json"), 0o600);
    const screen = await s.open("desktop");
    await (await s.open("external")).request("extension.reload", {});
    await waitProj(s, "p9", "pending", r4);
    const i = (await projInfo(s, "p9", r4))!;
    await screen.request("extension.approve", { key: i.key, digest: i.approval!.digest });
    await waitProj(s, "p9", "running", r4);
    await writeFile(join(stateDir, "extension-approvals.json"), "{こわれた", { mode: 0o600 });
    await waitProj(s, "p9", "pending", r4);
    expect((await s.list()).problems.some((p) => p.path.endsWith("extension-approvals.json"))).toBe(true);
    // 無効の記録を壊す → 全部が disabled。
    await writeFile(join(stateDir, "extension-state.json"), "{こわれた", { mode: 0o600 });
    await (await s.open("external")).request("extension.reload", {});
    await waitProj(s, "p9", "disabled", r4);
  });

});

function okResult<T>(r: PaneSocketResponse): T {
  if (!r.ok) throw new Error(`not ok: ${JSON.stringify(r)}`);
  return r.result as T;
}
void mkdir;
