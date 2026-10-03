import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { Graph, GraphLink } from "@sodashitsu/protocol";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261003-graph-auto-nodes の T6：エージェントが起動したエージェントの自動載せを、実物の `composeServer`（空きポート・自前の一時 stateDir）・
 * 実 PTY の bash・実際の検出の上の偽の `claude` で確かめる（AC1〜AC3・AC5〜AC10・AC12・AC13）。
 * 偽の `claude` は PATH の先頭に置いた bash の `exec -a claude` で node の偽のエージェントを起動する（検出は argv[0] で行う。本物は起動しない）。
 * 偽のエージェントは `q` を受け取ると終わる（入れ替わりの検出を起こすため）。
 */
vi.setConfig({ testTimeout: 30_000 });

const fakeAgent = (sinkDir: string) => `
import { appendFileSync } from "node:fs";
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
// 受け取った入力はファイルへ書き出す（親に届く監督の知らせを外から見るため。pane の環境の SODA_SERVER_URL・SODA_PANE_ID で名前を決める）。
const sink = ${JSON.stringify(sinkDir)} + "/input-" + String(process.env.SODA_SERVER_URL).replace(/\\W/g, "_") + "-" + process.env.SODA_PANE_ID;
process.stdin.on("data", (d) => {
  appendFileSync(sink, String(d));
  if (String(d).includes("q")) process.exit(0);
});
`;

interface Client {
  request(method: string, params: unknown): Promise<{ result?: unknown; error?: { code: string } }>;
  /** 受け取った graph.changed の rev（順番どおり）。 */
  changedRevs: number[];
}

interface LogLine {
  level: string;
  msg: string;
  reason?: string;
  child?: string;
  parent?: string;
  nodes?: number;
  links?: number;
}

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))(
  "composeServer: エージェントが起動したエージェントの自動載せ（20261003-graph-auto-nodes・実 PTY・偽の claude）",
  () => {
    let dir: string;
    let savedEnv: Record<string, string | undefined> = {};
    const cleanups: (() => Promise<unknown> | unknown)[] = [];

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), "soda-lineage-it-"));
      await mkdir(join(dir, "bin"));
      await writeFile(join(dir, "fake-agent.mjs"), fakeAgent(dir));
      const wrapper = join(dir, "bin", "claude");
      await writeFile(
        wrapper,
        `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`,
      );
      await chmod(wrapper, 0o755);
      // pane のシェルの環境：利用者の rc を読ませず（HOME）、PATH の先頭を偽の claude にする。
      savedEnv = {
        HOME: process.env["HOME"],
        PATH: process.env["PATH"],
        ENV: process.env["ENV"],
        PS1: process.env["PS1"],
      };
      process.env["HOME"] = dir;
      process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
      delete process.env["ENV"];
    });

    afterEach(async () => {
      for (const fn of cleanups.splice(0).reverse()) await fn();
    });

    afterAll(async () => {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    });

    /** テストごとに自前の stateDir・空きポートのサーバ（グラフの rev を独立にするため）。 */
    async function boot(): Promise<{
      server: ComposedServer;
      stateDir: string;
      clients: Client[];
    }> {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const server = await composeServerOnFreePort({
        host: "127.0.0.1",
        stateDir,
        origin: [],
        shell: "/bin/bash",
      });
      let closed = false;
      const close = server.close.bind(server);
      server.close = async () => {
        if (closed) return;
        closed = true;
        await close();
      };
      cleanups.push(() => server.close());
      const port = server.options.port;
      const origin = `http://127.0.0.1:${port}`;
      const login = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ token: server.freshToken }),
      });
      expect(login.status).toBe(204);
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const clients: Client[] = [];
      for (let i = 0; i < 2; i++) clients.push(await connect(port, cookie, origin));
      return { server, stateDir, clients };
    }

    async function connect(port: number, cookie: string, origin: string): Promise<Client> {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { cookie, origin, host: `127.0.0.1:${port}` },
      });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      cleanups.push(() => ws.close());
      const pending = new Map<
        string,
        (v: { result?: unknown; error?: { code: string } }) => void
      >();
      const changedRevs: number[] = [];
      ws.on("message", (raw, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(raw.toString()) as {
          id?: string;
          result?: unknown;
          error?: { code: string };
          event?: string;
          data?: { graph?: { rev: number } };
        };
        if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.(msg.error !== undefined ? { error: msg.error } : { result: msg.result });
        } else if (msg.event === "graph.changed") changedRevs.push(msg.data!.graph!.rev);
      });
      let seq = 0;
      const request = (method: string, params: unknown) =>
        new Promise<{ result?: unknown; error?: { code: string } }>((resolve) => {
          const id = `r${++seq}`;
          pending.set(id, resolve);
          ws.send(JSON.stringify({ id, method, params }));
        });
      await request("client.hello", { protocol: 1, kind: "desktop" });
      return { request, changedRevs };
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const graphOf = (s: ComposedServer): Graph => s.graph.get();
    const key = (paneId: string) => `local:${paneId}`;
    const linksOf = (g: Graph, kind: string): GraphLink[] => g.links.filter((l) => l.kind === kind);
    async function logLines(stateDir: string): Promise<LogLine[]> {
      const raw = await readFile(join(stateDir, "server.log"), "utf8").catch(() => "");
      return raw
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .map((l) => JSON.parse(l) as LogLine)
        .filter((l) => l.msg.startsWith("graph.auto:"));
    }

    async function ok<T>(p: Promise<{ result?: unknown; error?: { code: string } }>): Promise<T> {
      const r = await p;
      if (r.error !== undefined) throw new Error(`request failed: ${r.error.code}`);
      return r.result as T;
    }
    const split = (c: Client, paneId: string, callerPaneId?: string): Promise<string> =>
      ok<{ pane: { id: string } }>(
        c.request("pane.split", {
          paneId,
          direction: "right",
          ...(callerPaneId === undefined ? {} : { callerPaneId }),
        }),
      ).then((r) => r.pane.id);

    /** シェルが入力を読める状態になったこと（印のファイル）を待つ。待たずに打つと取りこぼす。 */
    async function shellReady(server: ComposedServer, paneId: string): Promise<void> {
      const marker = join(dir, `ready-${server.options.port}-${paneId}`);
      server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), {
        timeout: 10_000,
        interval: 50,
      });
    }
    const agentOf = (server: ComposedServer, paneId: string) =>
      server.session.getPane(paneId)?.agent ?? null;
    /** 打ち込みで偽のエージェントを起動し、検出されるまで待つ。直前の検出の instanceId と違うものを待つ。 */
    async function typeClaude(server: ComposedServer, paneId: string): Promise<void> {
      const prev = agentOf(server, paneId)?.instanceId;
      server.terminals.get(paneId)!.write("claude\r");
      await vi.waitFor(
        () => {
          const a = agentOf(server, paneId);
          expect(a !== null && a.instanceId !== prev).toBe(true);
        },
        { timeout: 15_000, interval: 50 },
      );
    }
    /** 偽のエージェントを終わらせて、検出が外れるまで待つ。 */
    async function quitAgent(server: ComposedServer, paneId: string): Promise<void> {
      server.terminals.get(paneId)!.write("q");
      await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), {
        timeout: 15_000,
        interval: 50,
      });
    }
    /** 偽のエージェント（pane の環境で名前が決まる）が受け取った入力。 */
    const inputOf = (server: ComposedServer, paneId: string): string => {
      const name = `input-${`http://127.0.0.1:${server.options.port}`.replace(/\W/g, "_")}-${paneId}`;
      return existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
    };
    /**
     * 「何も起きない」ことの確認の前の短い待ち。検出（agent の現れ）は呼び出し側が待ってあるので、ここで待つのは検出の後に
     * 非同期で走る自動載せの処理（グラフの更新）が、もし起きるなら起きるのに足りる時間だけ。起きた場合は rev が進んで検査が落ちる。
     */
    const settle = () => sleep(300);
    const waitRev = (server: ComposedServer, rev: number) =>
      vi.waitFor(() => expect(graphOf(server).rev).toBe(rev), { timeout: 10_000, interval: 25 });

    it("callerPaneId つきの pane.split → 打ち込みで検出 → 子と親のノード・監督・承認（notify・40・limit 10）の線が 1 回の更新で載り、graph.changed が届く（AC1・AC2・AC5・AC6・AC12）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const child = await split(c, parent, parent);
      await shellReady(server, child);
      expect(graphOf(server).rev).toBe(0);
      await typeClaude(server, child);
      await waitRev(server, 1);

      const g = graphOf(server);
      expect(g.nodes.map((n) => n.key).sort()).toEqual([key(child), key(parent)].sort());
      expect(g.nodes.every((n) => n.stale !== true)).toBe(true);
      const sup = linksOf(g, "supervise");
      expect(sup).toHaveLength(1);
      expect(sup[0]).toMatchObject({ from: key(child), to: key(parent), limit: 10 });
      const app = linksOf(g, "approval");
      expect(app).toHaveLength(1);
      expect(app[0]).toMatchObject({
        from: key(child),
        to: key(parent),
        approval: { mode: "notify", lines: 40 },
        limit: 10,
      });
      expect(g.links).toHaveLength(2);
      // 2 つのブラウザ相当の接続の両方に、rev 1 の graph.changed が 1 回だけ届く（まとめて 1 回の更新）。
      await vi.waitFor(() => expect(clients.every((x) => x.changedRevs.includes(1))).toBe(true));
      for (const x of clients) expect(x.changedRevs).toEqual([1]);
      expect(await ok<Graph>(c.request("graph.get", {}))).toEqual(g);
      expect((await logLines(server.options.stateDir)).map((l) => l.msg)).toContain(
        "graph.auto: added",
      );

      // 1 pane につき 1 回だけ：利用者が子のノード（線も一緒に消える）を外したあと、エージェントが入れ替わって再検出されても重ねて載せない。
      // （「載せ済み」の記録が無ければ、子のノードが無いので再び載ってしまう。重複する線で何も足されないだけの状態では確かめられない。）
      await ok(
        c.request("graph.update", { baseRev: 1, ops: [{ op: "remove_node", key: key(child) }] }),
      );
      expect(graphOf(server).links).toEqual([]);
      await quitAgent(server, child);
      await typeClaude(server, child);
      await settle();
      expect(graphOf(server).rev).toBe(2);
      expect(graphOf(server).nodes.map((n) => n.key)).toEqual([key(parent)]);
      expect(graphOf(server).links).toEqual([]);
      expect(clients[0]!.changedRevs).toEqual([1, 2]);
    });

    it("親もエージェントなら、子が載って約 2 秒後に、親へ配下（子の pane ID）を知らせる監督の知らせが実際に届く。承認の代理の知らせは出ない（AC5）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const child = await split(c, parent, parent);
      await shellReady(server, parent);
      await shellReady(server, child);
      await typeClaude(server, parent); // 親もエージェント（監督役になれる）
      expect(inputOf(server, parent)).toBe("");
      await typeClaude(server, child);
      await waitRev(server, 1);
      // 約 2 秒のまとめ待ちのあと、監督役（親のエージェント）の入力として知らせが届く。固定の待ちは置かず、届くまで待つ。
      await vi.waitFor(() => expect(inputOf(server, parent)).toContain(child), {
        timeout: 15_000,
        interval: 50,
      });
      expect(inputOf(server, parent)).toContain("監督役");
      expect(inputOf(server, child)).toBe(""); // 子には何も届かない（承認待ちは起きていない）
    });

    it("agent.start 経由：agent start を打った pane が親になる（作った人とは別の pane）。作った人が居ても打った人を優先する（AC1・AC3）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const p0 = server.session.snapshot().panes[0]!.id;
      const creator = await split(c, p0);
      const starter = await split(c, p0);
      const child = await split(c, p0, creator); // 作った人は creator
      await shellReady(server, child);
      await ok(
        c.request("agent.start", {
          callerPaneId: starter,
          name: "kid",
          kind: "claude",
          paneId: child,
          args: [],
        }),
      );
      await vi.waitFor(() => expect(agentOf(server, child)).not.toBeNull(), { timeout: 15_000 });
      await waitRev(server, 1);
      const g = graphOf(server);
      expect(g.nodes.map((n) => n.key).sort()).toEqual([key(child), key(starter)].sort());
      expect(linksOf(g, "supervise")[0]).toMatchObject({ from: key(child), to: key(starter) });
      expect(linksOf(g, "approval")[0]).toMatchObject({ from: key(child), to: key(starter) });
    });

    it("手で作った pane に pane の中の agent start で起動しても載る。callerPaneId なしの agent.start は何も載せない（AC4・AC13）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const p0 = server.session.snapshot().panes[0]!.id;
      const manual = await split(c, p0); // callerPaneId なし＝旧形の params
      const other = await split(c, p0);
      await shellReady(server, manual);
      await shellReady(server, other);
      await ok(
        c.request("agent.start", { name: "legacy", kind: "claude", paneId: other, args: [] }),
      );
      await vi.waitFor(() => expect(agentOf(server, other)).not.toBeNull(), { timeout: 15_000 });
      await typeClaude(server, manual);
      await settle();
      expect(graphOf(server).rev).toBe(0);
      expect(graphOf(server).nodes).toEqual([]);
      expect(await logLines(server.options.stateDir)).toEqual([]);
      // 手で作った pane（manual）に agent start を打った pane が親になる。
      await quitAgent(server, manual);
      await ok(
        c.request("agent.start", {
          callerPaneId: p0,
          name: "via-start",
          kind: "claude",
          paneId: manual,
          args: [],
        }),
      );
      await waitRev(server, 1);
      expect(linksOf(graphOf(server), "supervise")[0]).toMatchObject({
        from: key(manual),
        to: key(p0),
      });
    });

    it("旧形の params（callerPaneId なし）の pane.split は従来どおり成功し、実在しない callerPaneId は無視されて成功する（AC13）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const p0 = server.session.snapshot().panes[0]!.id;
      const legacy = await split(c, p0);
      const ghost = await split(c, p0, "p9999");
      await shellReady(server, legacy);
      await shellReady(server, ghost);
      await typeClaude(server, legacy);
      await typeClaude(server, ghost);
      await settle();
      expect(graphOf(server).rev).toBe(0);
      expect(clients[0]!.changedRevs).toEqual([]);
    });

    it("workspace.create で作った pane でも同じように載る（AC1）。tab.create も同じ", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const ws = await ok<{ pane: { id: string } }>(
        c.request("workspace.create", { callerPaneId: parent, label: "w2" }),
      );
      await shellReady(server, ws.pane.id);
      await typeClaude(server, ws.pane.id);
      await waitRev(server, 1);
      expect(linksOf(graphOf(server), "supervise")[0]).toMatchObject({
        from: key(ws.pane.id),
        to: key(parent),
      });

      const tab = await ok<{ pane: { id: string } }>(
        c.request("tab.create", { callerPaneId: parent }),
      );
      await shellReady(server, tab.pane.id);
      await typeClaude(server, tab.pane.id);
      await waitRev(server, 2);
      const g = graphOf(server);
      expect(g.nodes).toHaveLength(3); // 親は 1 つのまま
      expect(
        linksOf(g, "supervise")
          .map((l) => l.from)
          .sort(),
      ).toEqual([key(ws.pane.id), key(tab.pane.id)].sort());
    });

    it("手で置いたノードの位置・線の設定・一時停止は変わらず、重複する線は足さない（AC8）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const child = await split(c, parent, parent);
      await shellReady(server, child);
      // 手で置く：親のノードを離れた場所に、同じ向きの承認の線を別の設定で（一時停止にして）。
      await ok(
        c.request("graph.update", {
          baseRev: 0,
          ops: [
            { op: "add_node", key: key(parent), x: 777, y: 555 },
            { op: "add_node", key: key(child), x: 12, y: 34 },
            {
              op: "add_link",
              kind: "approval",
              from: key(child),
              to: key(parent),
              approval: { mode: "notify", lines: 7 },
              limit: 3,
            },
          ],
        }),
      );
      const linkId = linksOf(graphOf(server), "approval")[0]!.id;
      await ok(c.request("graph.pause", { linkId }));
      const before = graphOf(server);
      expect(before.rev).toBe(2);
      expect(linksOf(before, "approval")[0]!.paused).not.toBeNull();

      await typeClaude(server, child);
      await waitRev(server, 3);
      const after = graphOf(server);
      // 既存のノードは動かない・既存の線は設定も一時停止も変わらず重複しない・足されたのは監督の線だけ。
      expect(after.nodes).toEqual(before.nodes);
      expect(linksOf(after, "approval")).toEqual(linksOf(before, "approval"));
      expect(linksOf(after, "supervise")).toHaveLength(1);
      expect(after.links).toHaveLength(2);
      expect((await logLines(server.options.stateDir)).map((l) => l.reason)).toContain(
        "duplicate_link",
      );
    });

    it("同じ配下に別の監督役の線があるときは監督の線を引かず、ノードと承認の線は足す。理由をログに残す（AC8）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const boss = await split(c, parent);
      const child = await split(c, parent, parent);
      await shellReady(server, child);
      await ok(
        c.request("graph.update", {
          baseRev: 0,
          ops: [
            { op: "add_node", key: key(boss), x: 0, y: 0 },
            { op: "add_node", key: key(child), x: 240, y: 0 },
            { op: "add_link", kind: "supervise", from: key(child), to: key(boss) },
          ],
        }),
      );
      await typeClaude(server, child);
      await waitRev(server, 2);
      const g = graphOf(server);
      expect(linksOf(g, "supervise")).toHaveLength(1);
      expect(linksOf(g, "supervise")[0]).toMatchObject({ from: key(child), to: key(boss) });
      expect(linksOf(g, "approval")[0]).toMatchObject({ from: key(child), to: key(parent) });
      expect(g.nodes.map((n) => n.key)).toContain(key(parent));
      expect((await logLines(server.options.stateDir)).map((l) => l.reason)).toContain(
        "supervisor_taken",
      );
    });

    it("外した子は戻らず、外した親は別の子が新しく検出されたときに戻る（AC7）", async () => {
      const { server, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const c1 = await split(c, parent, parent);
      const c2 = await split(c, parent, parent);
      await shellReady(server, c1);
      await shellReady(server, c2);
      await typeClaude(server, c1);
      await waitRev(server, 1);

      // 利用者が子のノードを外す（線も一緒に消える）。同じ子でエージェントが入れ替わっても戻らない。
      await ok(
        c.request("graph.update", { baseRev: 1, ops: [{ op: "remove_node", key: key(c1) }] }),
      );
      expect(graphOf(server).nodes.map((n) => n.key)).toEqual([key(parent)]);
      await quitAgent(server, c1);
      await typeClaude(server, c1);
      await settle();
      expect(graphOf(server).rev).toBe(2);
      expect(graphOf(server).nodes.map((n) => n.key)).toEqual([key(parent)]);

      // 親も外す。同じ子ではやはり戻らない。
      await ok(
        c.request("graph.update", { baseRev: 2, ops: [{ op: "remove_node", key: key(parent) }] }),
      );
      await quitAgent(server, c1);
      await typeClaude(server, c1);
      await settle();
      expect(graphOf(server).rev).toBe(3);
      expect(graphOf(server).nodes).toEqual([]);

      // 別の子が新しく検出されると、親も一緒に戻る。外した子は戻らない。
      await typeClaude(server, c2);
      await waitRev(server, 4);
      const g = graphOf(server);
      expect(g.nodes.map((n) => n.key).sort()).toEqual([key(c2), key(parent)].sort());
      expect(linksOf(g, "supervise")).toHaveLength(1);
      expect(g.nodes.map((n) => n.key)).not.toContain(key(c1));
    });

    it("親の pane を閉じてから子を検出すると、何も足さずログに残す（AC10）", async () => {
      const { server, stateDir, clients } = await boot();
      const [c] = clients as [Client, Client];
      const p0 = server.session.snapshot().panes[0]!.id;
      const parent = await split(c, p0);
      const child = await split(c, p0, parent);
      await shellReady(server, child);
      await ok(c.request("pane.close", { paneId: parent }));
      expect(server.session.getPane(parent)).toBeUndefined();
      await typeClaude(server, child);
      await vi.waitFor(
        async () => {
          const lines = await logLines(stateDir);
          expect(
            lines.some((l) => l.msg === "graph.auto: skipped" && l.reason === "parent_gone"),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );
      expect(graphOf(server).rev).toBe(0);
      expect(graphOf(server).nodes).toEqual([]);
      expect(clients[0]!.changedRevs).toEqual([]);
    });

    it("ノードが上限（64）に達していれば、何も足さず（部分的にも）、理由をログに残す。pane.split は成功している（AC9）", async () => {
      const { server, stateDir, clients } = await boot();
      const [c] = clients as [Client, Client];
      const parent = server.session.snapshot().panes[0]!.id;
      const child = await split(c, parent, parent);
      await shellReady(server, child);
      const machine = "d".repeat(32);
      await ok(
        c.request("graph.update", {
          baseRev: 0,
          ops: Array.from({ length: 64 }, (_, i) => ({
            op: "add_node",
            key: `${machine}:p${i + 1}`,
            x: i * 10,
            y: 0,
          })),
        }),
      );
      expect(graphOf(server).nodes).toHaveLength(64);
      await typeClaude(server, child);
      await vi.waitFor(
        async () => {
          expect((await logLines(stateDir)).some((l) => l.reason === "too_many_nodes")).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );
      const g = graphOf(server);
      expect(g.rev).toBe(1);
      expect(g.nodes).toHaveLength(64);
      expect(g.links).toEqual([]);
    });
  },
);
