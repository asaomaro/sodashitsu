import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { DISPLAY_CONTENT_MAX_BYTES } from "@sodashitsu/protocol";
import { CliUsageError, parseArgs } from "./cliArgs.js";
import { REAL_DISPLAY_DEPS, runDisplay, type DisplayDeps } from "./commands/display.js";
import { login } from "./httpAuth.js";
import { callPaneOp } from "./paneSocket.js";
import { FsSessionStore } from "./session.js";
import { connect, type SodaClient } from "./wsClient.js";

/**
 * `sodactl display` を実サーバに対して確かめる（20261007-soda-extensions の T5・T6）。pane の中の環境（`SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_PANE_SOCKET`）を
 * 与えて解釈した実物のコマンドを、実物の経路（ログインなしの受け口／ログイン済みの `/ws`）で走らせる。画面の役は `/ws` の desktop 接続。
 * 実物の `dist/main.js` を子プロセスで動かす確かめは、起動確認（`handoffSmoke.ts`）と E2E。
 */
vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(process.platform === "win32")("sodactl display（実サーバ）", () => {
  let server: ComposedServer;
  let stateDir: string;
  let sessionDir: string;
  let tmp: string;
  let url: string;
  let token: string;
  let loggedIn: FsSessionStore;
  let anonymous: FsSessionStore;
  let paneA: string;
  const clients: SodaClient[] = [];

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "sodactl-display-state-"));
    server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell: "/bin/sh" });
    url = `http://127.0.0.1:${(server.httpServer.server.address() as AddressInfo).port}`;
    token = server.freshToken!;
    sessionDir = await mkdtemp(join(tmpdir(), "sodactl-display-session-"));
    tmp = await mkdtemp(join(tmpdir(), "sodactl-display-files-"));
    loggedIn = new FsSessionStore(join(sessionDir, "logged-in.json"));
    anonymous = new FsSessionStore(join(sessionDir, "anonymous.json")); // 空（ログインしていない）
    await loggedIn.set(url, await login(url, token));
    paneA = server.session.snapshot().panes[0]!.id;
    // スクリプトが動く表示は既定で無効。この試験は、設定で有効にしてから始める（無効の筋は下の別の test）。
    const admin = await connect(url, await login(url, token));
    await admin.request("client.hello", { protocol: 1, kind: "external" });
    await admin.request("prefs.set", { patch: { displayScriptEnabled: true } });
    admin.close();
  }, 30_000);

  afterAll(async () => {
    for (const c of clients) c.close();
    await server?.close();
    await rm(stateDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
  });

  /** pane の中の環境（ログインなし・受け口あり）。 */
  const inPane = (paneId: string): NodeJS.ProcessEnv => ({ SODA_PANE_ID: paneId, SODA_SERVER_URL: url, SODA_PANE_SOCKET: join(stateDir, "pane.sock") }) as NodeJS.ProcessEnv;
  /** pane の外（`/ws`。token つき）。 */
  const outsideEnv = (): NodeJS.ProcessEnv => ({ SODACTL_URL: url, SODACTL_TOKEN: token }) as NodeJS.ProcessEnv;

  interface Run {
    code: number;
    lines: Record<string, unknown>[];
  }
  /** `sodactl display …` を走らせる。出力は 1 行ずつ集める。 */
  async function run(argv: string[], env: NodeJS.ProcessEnv, session = anonymous, over: Partial<DisplayDeps> = {}): Promise<Run> {
    const lines: Record<string, unknown>[] = [];
    const cmd = parseArgs(["display", ...argv], env, "linux");
    if (cmd.kind !== "display") throw new Error("not display");
    const code = await runDisplay(cmd, session, { ...REAL_DISPLAY_DEPS, print: (v) => void lines.push(v as Record<string, unknown>), outputClosed: () => false, ...over });
    return { code, lines };
  }
  /** 出し続けるコマンドを背景で走らせる。 */
  function runBg(argv: string[], env: NodeJS.ProcessEnv, session = anonymous): { lines: Record<string, unknown>[]; done: Promise<number> } {
    const lines: Record<string, unknown>[] = [];
    const cmd = parseArgs(["display", ...argv], env, "linux");
    if (cmd.kind !== "display") throw new Error("not display");
    const done = runDisplay(cmd, session, { ...REAL_DISPLAY_DEPS, print: (v) => void lines.push(v as Record<string, unknown>), outputClosed: () => false });
    return { lines, done };
  }
  function runBgWith(argv: string[], env: NodeJS.ProcessEnv, over: Partial<DisplayDeps>): { lines: Record<string, unknown>[]; done: Promise<number> } {
    const lines: Record<string, unknown>[] = [];
    const cmd = parseArgs(["display", ...argv], env, "linux");
    if (cmd.kind !== "display") throw new Error("not display");
    const done = runDisplay(cmd, anonymous, { ...REAL_DISPLAY_DEPS, print: (v) => void lines.push(v as Record<string, unknown>), outputClosed: () => false, ...over });
    return { lines, done };
  }
  const waitLine = (lines: Record<string, unknown>[], pred: (l: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> =>
    vi.waitFor(
      () => {
        const l = lines.find(pred);
        if (!l) throw new Error(`waiting for a line; have ${JSON.stringify(lines.map((x) => x["type"] ?? x["status"]))}`);
        return l;
      },
      { timeout: 10_000, interval: 25 },
    );

  /** 画面の役（desktop）。`display.subscribe` 済み。 */
  async function screen(): Promise<SodaClient> {
    const c = await connect(url, await login(url, token));
    clients.push(c);
    await c.request("client.hello", { protocol: 1, kind: "desktop" });
    await c.request("display.subscribe", { features: ["panel", "band", "actions", "script-html"] });
    return c;
  }
  async function newPane(): Promise<{ paneId: string; workspaceId: string }> {
    const c = await connect(url, await login(url, token));
    clients.push(c);
    await c.request("client.hello", { protocol: 1, kind: "external" });
    const r = (await c.request("workspace.create", {})) as { pane: { id: string }; workspace: { id: string } };
    c.close();
    return { paneId: r.pane.id, workspaceId: r.workspace.id };
  }
  async function closeWorkspace(workspaceId: string): Promise<void> {
    const c = await connect(url, await login(url, token));
    clients.push(c);
    await c.request("client.hello", { protocol: 1, kind: "external" });
    await c.request("workspace.close", { workspaceId });
    c.close();
  }

  it("受け口の経路（ログインなし）: set → list → close → --features。2 MiB ちょうどの --html-file が通る", async () => {
    const env = inPane(paneA);
    const file = join(tmp, "big.html");
    await writeFile(file, "a".repeat(DISPLAY_CONTENT_MAX_BYTES));
    const set = await run(["set", "main", "--kind", "panel", "--title", "進捗", "--html-file", file], env);
    expect(set.code).toBe(0);
    expect(set.lines[0]).toMatchObject({ status: "ok", display: { paneId: paneA, name: "main", kind: "panel", format: "html", title: "進捗", rev: 1, bytes: DISPLAY_CONTENT_MAX_BYTES }, renderers: { panel: 0, band: 0, actions: 0 }, epoch: expect.any(String), next: 0 });
    const again = await run(["set", "main", "--kind", "panel", "--text", "t"], env);
    expect(again.lines[0]).toMatchObject({ display: { rev: 2, format: "text", bytes: 1 } });
    expect((await run(["list"], env)).lines[0]).toMatchObject({ status: "ok", displays: [{ name: "main", rev: 2 }] });
    expect((await run(["close", "main"], env)).lines[0]).toEqual({ status: "ok", closed: ["main"] });
    expect((await run(["close", "main"], env)).lines[0]).toEqual({ status: "ok", closed: [] });
    expect((await run(["list"], env)).lines[0]).toEqual({ status: "ok", displays: [] });
    const f = (await run(["--features"], env)).lines[0] as { sodactl: string[]; server: { epoch: string; limits: { requestLineBytes: number } } };
    expect(f.sodactl).toContain("format:html");
    expect(f.server.limits.requestLineBytes).toBe(4 * 1024 * 1024);
  });

  it("2 MiB + 1 バイトは終了コード 2（使い方の誤り）で、面は出ない。標準入力の経路も同じ", async () => {
    const env = inPane(paneA);
    const file = join(tmp, "over.html");
    await writeFile(file, "a".repeat(DISPLAY_CONTENT_MAX_BYTES + 1));
    await expect(run(["set", "over", "--kind", "panel", "--html-file", file], env)).rejects.toBeInstanceOf(CliUsageError);
    // 中身の指定が無く標準入力が空なら、空の面を出さずに使い方の誤り
    await expect(run(["set", "over", "--kind", "panel"], env, anonymous, { readStdin: async () => Buffer.alloc(0) })).rejects.toBeInstanceOf(CliUsageError);
    expect((await run(["list"], env)).lines[0]).toEqual({ status: "ok", displays: [] });
  });

  it("引用符だらけで 1 行が膨らむ 2 MiB 弱の中身も、受け口を通る（1 行 4 MiB の上限の内側）", async () => {
    const env = inPane(paneA);
    const file = join(tmp, "quotes.html");
    await writeFile(file, '"'.repeat(DISPLAY_CONTENT_MAX_BYTES - 1024));
    const r = await run(["set", "quotes", "--kind", "panel", "--html-file", file], env);
    expect(r.lines[0]).toMatchObject({ status: "ok", display: { bytes: DISPLAY_CONTENT_MAX_BYTES - 1024 } });
    await run(["close", "quotes"], env);
  });

  it("/ws の経路（ログイン済み・SODA_PANE_SOCKET なし・--pane）: set → list → close。無い pane は not_found（終了コード 1）", async () => {
    const r = await run(["set", "viaws", "--kind", "band", "--markdown-file", await mk("a.md", "# hi"), "--pane", paneA], outsideEnv(), loggedIn);
    expect(r.lines[0]).toMatchObject({ status: "ok", display: { paneId: paneA, name: "viaws", kind: "band", format: "markdown" } });
    expect((await run(["list", "--pane", paneA], outsideEnv(), loggedIn)).lines[0]).toMatchObject({ displays: [{ name: "viaws" }] });
    // 先頭の部分でも指せる
    expect((await run(["list", "--pane", paneA.slice(0, 8)], outsideEnv(), loggedIn)).lines[0]).toMatchObject({ displays: [{ name: "viaws" }] });
    expect((await run(["close", "--all", "--pane", paneA], outsideEnv(), loggedIn)).lines[0]).toEqual({ status: "ok", closed: ["viaws"] });
    await expect(run(["list", "--pane", "00000000-0000-0000-0000-000000000000"], outsideEnv(), loggedIn)).rejects.toMatchObject({ code: "not_found" });
    await expect(run(["set", "x", "--kind", "band", "--text", "a", "--pane", "00000000-0000-0000-0000-000000000000"], outsideEnv(), loggedIn)).rejects.toMatchObject({ code: "not_found" });
  });

  it("ログインなしで、受け口を使えない（--pane が呼び出し元と違う）と unauthenticated（終了コード 1）", async () => {
    await expect(run(["list", "--pane", "00000000-0000-0000-0000-000000000000"], inPane(paneA), anonymous)).rejects.toThrow(/no cached session|--token/);
    // 呼び出し元の pane 自身を --pane で指せば、受け口を使う（ログイン不要）
    expect((await run(["list", "--pane", paneA], inPane(paneA), anonymous)).lines[0]).toMatchObject({ status: "ok" });
  });

  async function mk(name: string, content: string): Promise<string> {
    const p = join(tmp, name);
    await writeFile(p, content);
    return p;
  }

  it("events（受け口の経路）: 最初に display.ready。画面の操作・利用者が閉じた・pane を閉じたが行になり、display.end(pane_closed) で終了コード 0", async () => {
    const { paneId, workspaceId } = await newPane();
    const env = inPane(paneId);
    const b = await screen();
    const ev = runBg(["events"], env);
    const ready = await waitLine(ev.lines, (l) => l["type"] === "display.ready");
    expect(ready).toMatchObject({ v: 1, paneId, features: expect.arrayContaining(["panel"]), renderers: { panel: 1, band: 1, actions: 1 } });
    const set = await run(["set", "m", "--kind", "panel", "--html-file", await mk("m.html", "<button data-soda-action=go>go</button>")], env);
    const id = (set.lines[0] as { display: { id: string } }).display.id;
    await b.request("display.action", { id, rev: 1, action: "go", data: { who: "me" } });
    await waitLine(ev.lines, (l) => l["type"] === "display.action");
    expect(ev.lines.find((l) => l["type"] === "display.action")).toMatchObject({ paneId, name: "m", rev: 1, action: "go", data: { who: "me" }, seq: 1 });
    await b.request("display.dismiss", { id });
    expect(await waitLine(ev.lines, (l) => l["type"] === "display.closed")).toMatchObject({ name: "m", reason: "dismissed", seq: 2 });
    // 画面の報告 navigated
    const set2 = await run(["set", "n", "--kind", "band", "--text", "x"], env);
    await b.request("display.report", { id: (set2.lines[0] as { display: { id: string } }).display.id, problem: "navigated" });
    await waitLine(ev.lines, (l) => l["type"] === "display.closed" && l["reason"] === "navigated");
    // 自分の close も届く
    await run(["set", "o", "--kind", "band", "--text", "x"], env);
    await run(["close", "o"], env);
    await waitLine(ev.lines, (l) => l["type"] === "display.closed" && l["reason"] === "closed");
    await closeWorkspace(workspaceId);
    expect(await ev.done).toBe(0);
    expect(ev.lines.at(-1)).toEqual({ type: "display.end", reason: "pane_closed" });
  });

  it("events: display.ready の後・最初の display.wait が登録される前に起きた出来事も届く（順序は時間でなく門で決める）", async () => {
    const { paneId, workspaceId } = await newPane();
    const env = inPane(paneId);
    const b = await screen();
    const set = await run(["set", "m", "--kind", "panel", "--html-file", await mk("gate.html", "<button data-soda-action=go>go</button>")], env);
    const id = (set.lines[0] as { display: { id: string } }).display.id;
    // display.wait の送信を、門が開くまで止める（ready は出た・wait はまだ登録されていない、という状態を作る）
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const gated = (async (path, req, opts) => {
      if (req.op === "display.wait") await gate;
      return callPaneOp(path, req, opts);
    }) as typeof callPaneOp;
    const ev = runBgWith(["events"], env, { callPaneOp: gated });
    await waitLine(ev.lines, (l) => l["type"] === "display.ready");
    await b.request("display.action", { id, rev: 1, action: "between" }); // ready の後・wait の登録の前
    open();
    expect(await waitLine(ev.lines, (l) => l["type"] === "display.action")).toMatchObject({ action: "between", seq: 1 });
    await closeWorkspace(workspaceId);
    expect(await ev.done).toBe(0);
  });

  it("events（/ws の経路・--pane）でも同じ行が出る。wait <名前> は 1 行出して終わり、set --wait は set の行を出さずに最初の出来事を出す", async () => {
    const { paneId, workspaceId } = await newPane();
    const b = await screen();
    const ev = runBg(["events", "--pane", paneId], outsideEnv(), loggedIn);
    await waitLine(ev.lines, (l) => l["type"] === "display.ready");
    const waiter = runBg(["wait", "w", "--pane", paneId], outsideEnv(), loggedIn);
    const setWait = runBg(["set", "w", "--kind", "panel", "--html-file", await mk("w.html", "<button data-soda-action=ok>ok</button>"), "--wait", "--pane", paneId], outsideEnv(), loggedIn);
    const display = await vi.waitFor(async () => {
      const l = await run(["list", "--pane", paneId], outsideEnv(), loggedIn);
      const d = (l.lines[0] as { displays: { id: string }[] }).displays[0];
      if (!d) throw new Error("not yet");
      return d;
    }, { timeout: 10_000, interval: 50 });
    // wait は set より前に始まっているが、set の後の出来事を拾う
    await new Promise((r) => setTimeout(r, 100));
    await b.request("display.action", { id: display.id, rev: 1, action: "ok" });
    expect(await waiter.done).toBe(0);
    expect(waiter.lines).toHaveLength(1);
    expect(waiter.lines[0]).toMatchObject({ type: "display.action", name: "w", action: "ok" });
    expect(await setWait.done).toBe(0);
    expect(setWait.lines).toHaveLength(1);
    expect(setWait.lines[0]).toMatchObject({ type: "display.action", action: "ok" });
    await waitLine(ev.lines, (l) => l["type"] === "display.action");
    await closeWorkspace(workspaceId);
    expect(await ev.done).toBe(0);
    expect(ev.lines.at(-1)).toEqual({ type: "display.end", reason: "pane_closed" });
  });

  it("wait --timeout は display.timeout の行で終わる。pane が閉じると wait は not_found（終了コード 1）", async () => {
    const { paneId, workspaceId } = await newPane();
    const env = inPane(paneId);
    const t = await run(["wait", "--timeout", "1000"], env);
    expect(t).toEqual({ code: 0, lines: [{ type: "display.timeout" }] });
    const pending = runBg(["wait"], env);
    pending.done.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 200));
    await closeWorkspace(workspaceId);
    await expect(pending.done).rejects.toMatchObject({ code: "not_found" });
  });

  it("入れ替え・再起動を見分ける: 古い epoch で wait すると display.reset の行", async () => {
    const env = inPane(paneA);
    const r = await run(["wait", "--since", "0", "--epoch", "stale-epoch"], env);
    expect(r.lines).toEqual([{ type: "display.reset", reason: "server_restarted", epoch: expect.any(String) }]);
  });

  it("上限の超過は終了コード 1 のエラー（display_limit）で、既にある面は変わらない", async () => {
    const env = inPane(paneA);
    for (let i = 0; i < 2; i++) await run(["set", `b${i}`, "--kind", "band", "--text", "x"], env);
    await expect(run(["set", "b2", "--kind", "band", "--text", "x"], env)).rejects.toMatchObject({ code: "display_limit" });
    expect((await run(["list"], env)).lines[0]).toMatchObject({ displays: [{ name: "b0" }, { name: "b1" }] });
    await run(["close", "--all"], env);
  });

  it("script-html: ログインなしで --script-html-file を set → send。/ws の経路でも同じ。events の action の行に source", async () => {
    const env = inPane(paneA);
    const b = await screen();
    await b.request("display.subscribe", { features: ["panel", "band", "actions", "script-html"] });
    const set = await run(["set", "sg", "--kind", "panel", "--script-html-file", await mk("sg.html", "<script>document.body.textContent='ok'</script>")], env);
    expect(set.code).toBe(0);
    expect(set.lines[0]).toMatchObject({ status: "ok", display: { name: "sg", format: "script-html" }, renderers: { scriptHtml: expect.any(Number) } });
    expect((set.lines[0] as { renderers: { scriptHtml: number } }).renderers.scriptHtml).toBeGreaterThanOrEqual(1); // これまでの画面が残っていることもある
    const id = (set.lines[0] as { display: { id: string } }).display.id;
    const ev = runBg(["events", "sg"], env);
    await waitLine(ev.lines, (l) => l["type"] === "display.ready");
    expect((await run(["send", "sg", "--json", '{"n":1}'], env)).lines[0]).toMatchObject({ status: "ok", delivered: expect.any(Number) });
    // /ws の経路（ログイン済み・--pane）
    expect((await run(["send", "sg", "--json", "[2]", "--pane", paneA], outsideEnv(), loggedIn)).lines[0]).toMatchObject({ status: "ok", delivered: expect.any(Number) });
    const viaWs = await run(["set", "sg2", "--kind", "band", "--format", "script-html", "--pane", paneA], outsideEnv(), loggedIn, { readStdin: async () => Buffer.from("<script>1</script>") });
    expect(viaWs.lines[0]).toMatchObject({ status: "ok", display: { name: "sg2", format: "script-html" } });
    // 静的な面への send は誤り
    await run(["set", "st", "--kind", "panel", "--text", "t"], env);
    await expect(run(["send", "st", "--json", "1"], env)).rejects.toMatchObject({ code: "invalid_params" });
    // action の出来事に source
    await b.request("display.action", { id, rev: 1, action: "pick", data: { id: "3" } });
    expect(await waitLine(ev.lines, (l) => l["type"] === "display.action")).toMatchObject({ name: "sg", action: "pick", source: "script" });
    await run(["close", "--all"], env);
    await waitLine(ev.lines, (l) => l["type"] === "display.closed" && l["name"] === "sg");
  });

  it("script-html: 冷却中の set（display_busy）は理由つきで失敗し、静的な形式は出せる", async () => {
    const { paneId } = await newPane();
    const env = inPane(paneId);
    const b = await screen();
    const set = await run(["set", "cg", "--kind", "panel", "--script-html-file", await mk("cg.html", "<script>1</script>")], env);
    const id = (set.lines[0] as { display: { id: string } }).display.id;
    for (let i = 0; i < 3; i++) await b.request("display.report", { id, problem: "focus_steal", paneId, format: "script-html" });
    await expect(run(["set", "cg", "--kind", "panel", "--script-html-file", await mk("cg2.html", "<script>2</script>")], env)).rejects.toMatchObject({ code: "display_busy" });
    expect((await run(["set", "cg", "--kind", "panel", "--html-file", await mk("cg3.html", "<p>ok</p>")], env)).code).toBe(0);
  });

  it("script-html が設定で無効のとき: set・send は display_script_disabled（終了コード 1 のエラー）。--features の server.scriptEnabled が偽。静的な形式は出せる。pane の中（ログインなし）からは有効にできない", async () => {
    const { paneId } = await newPane();
    const env = inPane(paneId);
    const setEnabled = async (v: boolean): Promise<void> => {
      const admin = await connect(url, await login(url, token));
      await admin.request("client.hello", { protocol: 1, kind: "external" });
      await admin.request("prefs.set", { patch: { displayScriptEnabled: v } });
      admin.close();
    };
    await setEnabled(false);
    try {
      const f = (await run(["--features"], env)).lines[0] as { server: { scriptEnabled: boolean; features: string[] } };
      expect(f.server.scriptEnabled).toBe(false);
      expect(f.server.features).toContain("format:script-html");
      await expect(run(["set", "dg", "--kind", "panel", "--script-html-file", await mk("dg.html", "<p>x</p>")], env)).rejects.toMatchObject({ code: "display_script_disabled" });
      await expect(run(["send", "dg", "--json", "1"], env)).rejects.toMatchObject({ code: "display_script_disabled" });
      expect((await run(["set", "dg", "--kind", "panel", "--html-file", await mk("dg2.html", "<p>x</p>")], env)).code).toBe(0);
      await setEnabled(true);
      expect((await run(["set", "dg", "--kind", "panel", "--script-html-file", await mk("dg3.html", "<p>x</p>")], env)).code).toBe(0);
    } finally {
      await setEnabled(true);
    }
  });
});
