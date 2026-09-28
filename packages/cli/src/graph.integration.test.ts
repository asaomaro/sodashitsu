import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInfo, Graph, GraphLink, LinkRun } from "@sodashitsu/protocol";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { GraphAction } from "./cliArgs.js";
import { runGraph } from "./commands/graph.js";
import { reportAndExit } from "./output.js";
import { FsSessionStore } from "./session.js";

/**
 * `sodactl graph …` を実物のサーバで確かめる（20260927-agent-graph の 05 T2。AC15・AC16）。
 * - 変更は別のブラウザ相当の接続へ `graph.changed` で即座に届く（画面への反映は web の試験で担保済み）。
 * - `rev_conflict` は、CLI が `graph.get` を読んだ後・`graph.update` を送る前に、サーバの中から別の変更を当てて起こす（`connect` を包む）。
 */

/** `graph.update` を送る前に、サーバで別の変更を当てる回数（rev_conflict を起こす）。 */
let conflictsToInject = 0;
let injectConflict: (() => Promise<void>) | null = null;

vi.mock("./wsClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./wsClient.js")>();
  return {
    ...actual,
    connect: async (url: string, cookie: string) => {
      const client = await actual.connect(url, cookie);
      const request = client.request.bind(client);
      client.request = (async (method: string, params: unknown) => {
        if (method === "graph.update" && conflictsToInject > 0 && injectConflict !== null) {
          conflictsToInject--;
          await injectConflict();
        }
        return request(method as never, params as never);
      }) as typeof client.request;
      return client;
    },
  };
});

function captureStdout(): { text(): string; restore(): void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk),
    );
    return true;
  });
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

function agentInfo(completionSeq: number): AgentInfo {
  return {
    instanceId: "graph-cli-it",
    kind: "claude",
    label: "Claude Code",
    state: "idle",
    completionSeq,
    serverSeenSeq: 0,
    verified: true,
    since: Date.now(),
  };
}

async function waitFor(what: string, cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("sodactl graph integration（実物のサーバ）", () => {
  let server: ComposedServer;
  let stateDir: string;
  let sessionDir: string;
  let store: FsSessionStore;
  let url: string;
  let token: string;
  let panes: string[];
  /** 画面の代わりの接続が受けた `graph.changed`。 */
  const changed: { graph: Graph; byClientId: string | null }[] = [];

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "sodactl-graph-it-state-"));
    server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    token = server.freshToken;
    url = `http://${server.options.host}:${server.options.port}`;
    sessionDir = await mkdtemp(join(tmpdir(), "sodactl-graph-it-session-"));
    store = new FsSessionStore(join(sessionDir, "session.json"));
    const first = server.session.snapshot().panes[0]!.id;
    panes = [first];
    for (let i = 0; i < 3; i++)
      panes.push((await server.session.splitPane(first, "right", undefined)).pane.id);

    // 画面の代わり（ブラウザの接続）。
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie, origin, host: `127.0.0.1:${port}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as { event?: string; data?: unknown };
      if (msg.event === "graph.changed") changed.push(msg.data as (typeof changed)[number]);
    });
    ws.send(
      JSON.stringify({ id: "h", method: "client.hello", params: { protocol: 1, kind: "desktop" } }),
    );
    viewer = ws;

    injectConflict = async () => {
      // 画面が配置を動かした、に当たる別の変更（rev が 1 進む）。
      const g = server.graph.get();
      const node = g.nodes[0];
      if (node === undefined) throw new Error("the conflict needs a node");
      await server.graph.update(
        g.rev,
        [{ op: "move_node", key: node.key, x: node.x + 20, y: node.y }],
        "other-browser",
      );
    };
  }, 30_000);
  let viewer: WebSocket;

  // 割り込ませる変更の残りを次の試験へ持ち越さない（送り直しを壊したときに、後の試験まで巻き込んで落ちないように）。
  afterEach(() => {
    conflictsToInject = 0;
  });

  afterAll(async () => {
    viewer?.close();
    await server.close();
    await rm(stateDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  });

  /** `sodactl graph …` を 1 回（--json）。出力の JSON を返す。 */
  async function graph<T = { graph: Graph }>(action: GraphAction, json = true): Promise<T> {
    const out = captureStdout();
    try {
      await runGraph({ kind: "graph", opts: { url, token }, json, action }, store);
    } finally {
      out.restore();
    }
    return (json ? JSON.parse(out.text()) : out.text()) as T;
  }

  /** 失敗したコマンドを、main と同じ `reportAndExit` に通したときの終了コードと stderr。 */
  async function failure(action: GraphAction): Promise<{ exit: number; stderr: string }> {
    const err = await runGraph(
      { kind: "graph", opts: { url, token }, json: true, action },
      store,
    ).then(
      () => {
        throw new Error("expected the command to fail");
      },
      (e: unknown) => e,
    );
    let exit = -1;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      exit = code;
    }) as never);
    const chunks: string[] = [];
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => {
      chunks.push(String(c));
      return true;
    });
    const logSpy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      chunks.push(a.join(" "));
    });
    try {
      reportAndExit(err);
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
    return { exit, stderr: chunks.join("") };
  }

  const local = (p: string) => `local:${p}`;

  it("link add は端のノードを一緒に載せて線を作り、画面の接続へ graph.changed が届く。show は表で出す", async () => {
    const [p1, p2] = panes as [string, string];
    const before = changed.length;
    const r = await graph<{ link: GraphLink; graph: Graph }>({
      kind: "link-add",
      from: p1,
      to: p2,
      linkKind: "trigger",
      config: { prompt: "レビューして {output}", output: 40 },
    });
    expect(r.link).toMatchObject({
      id: "l1",
      kind: "trigger",
      from: local(p1),
      to: local(p2),
      trigger: { output: { lines: 40 } },
    });
    expect(r.graph.nodes.map((n) => n.key)).toEqual([local(p1), local(p2)]);
    expect(server.graph.get().links).toHaveLength(1);
    await waitFor("graph.changed on the viewer", () => changed.length > before);
    expect(changed.at(-1)!.graph.links.map((l) => l.id)).toEqual(["l1"]);

    const text = await graph<string>({ kind: "show" }, false);
    expect(text).toContain("graph: running");
    expect(text).toMatch(
      new RegExp(`^l1 +trigger +${p1} +${p2} +0/10 +active +on=done output=40 busy=wait`, "m"),
    );
  });

  it("link set・link pause・link resume・pause・resume が保存と画面へ反映される", async () => {
    let r = await graph({ kind: "link-set", linkId: "l1", config: { whenBusy: "skip", limit: 3 } });
    expect(r.graph.links[0]).toMatchObject({
      limit: 3,
      trigger: { whenBusy: "skip", prompt: "レビューして {output}" },
    });
    r = await graph({ kind: "link-pause", linkId: "l1" });
    expect(r.graph.links[0]!.paused).toBe("user");
    r = await graph({ kind: "link-resume", linkId: "l1" });
    expect(r.graph.links[0]!.paused).toBeNull();
    r = await graph({ kind: "pause" });
    expect(r.graph.paused).toBe(true);
    await waitFor("the paused graph on the viewer", () => changed.at(-1)?.graph.paused === true);
    r = await graph({ kind: "resume" });
    expect(r.graph.paused).toBe(false);
    expect(server.graph.get()).toMatchObject({
      paused: false,
      links: [{ id: "l1", limit: 3, paused: null }],
    });
  });

  it("監督・承認の代理の線（既定は知らせるだけ）。同じ配下に 2 つ目の監督役は画面と同じ規則で断る（終了コード 1）", async () => {
    const [p1, , p3, p4] = panes as [string, string, string, string];
    const s = await graph<{ link: GraphLink }>({
      kind: "link-add",
      from: p1,
      to: p3,
      linkKind: "supervise",
      config: {},
    });
    expect(s.link).toMatchObject({ kind: "supervise", from: local(p1), to: local(p3) });
    const a = await graph<{ link: GraphLink }>({
      kind: "link-add",
      from: p1,
      to: p3,
      linkKind: "approval",
      config: {},
    });
    expect(a.link.approval).toEqual({ mode: "notify", lines: 40 });
    const f = await failure({
      kind: "link-add",
      from: p1,
      to: p4,
      linkKind: "supervise",
      config: {},
    });
    expect(f.exit).toBe(1);
    expect(JSON.parse(f.stderr)).toMatchObject({
      error: { code: "invalid_params", message: expect.stringContaining("supervisor_taken") },
    });
    expect(server.graph.get().nodes.map((n) => n.key)).not.toContain(local(p4)); // 断った操作の中のノードも載らない
  });

  it("node add・node rekey（線ごと付け替える）・node rm（線も消える）", async () => {
    const [p1, p2, p3, p4] = panes as [string, string, string, string];
    let r = await graph({ kind: "node-add", panes: [p4, p1] });
    expect(r.graph.nodes.map((n) => n.key)).toEqual([local(p1), local(p2), local(p3), local(p4)]);
    r = await graph({ kind: "node-rm", pane: p4 });
    r = await graph({ kind: "node-rekey", pane: p3, newPane: p4 });
    expect(r.graph.nodes.map((n) => n.key)).toEqual([local(p1), local(p2), local(p4)]);
    expect(r.graph.links.filter((l) => l.kind !== "trigger").map((l) => l.to)).toEqual([
      local(p4),
      local(p4),
    ]);
    r = await graph({ kind: "node-rm", pane: p4 });
    expect(r.graph.links.map((l) => l.id)).toEqual(["l1"]);
    const f = await failure({ kind: "node-add", panes: ["p999"] });
    expect(f.exit).toBe(1);
    expect(JSON.parse(f.stderr)).toMatchObject({ error: { code: "not_found" } });
  });

  it("history は実行の履歴を新しい順に返す", async () => {
    const [p1] = panes as [string];
    server.session.updatePaneRuntime(p1, { agent: agentInfo(0) as never });
    server.session.updatePaneRuntime(p1, { agent: agentInfo(1) as never }); // 完了 → 先（p2）にはエージェントが居ない
    await waitFor("a run", () => server.graphHistory("l1").length > 0);
    const r = await graph<{ runs: LinkRun[] }>({ kind: "history", linkId: "l1", limit: undefined });
    expect(r.runs[0]).toMatchObject({ linkId: "l1", result: "skipped", reason: "target_absent" });
    const text = await graph<string>({ kind: "history", linkId: undefined, limit: 1 }, false);
    expect(text).toMatch(/^time +link +result +reason +text\n\S+ +l1 +skipped +target_absent/);
  });

  it("rev_conflict（読んだ後に画面が変えた）は取り直して 1 回だけ送り直し、成功する", async () => {
    const revBefore = server.graph.get().rev;
    conflictsToInject = 1;
    const r = await graph({ kind: "link-set", linkId: "l1", config: { limit: 7 } });
    expect(conflictsToInject).toBe(0);
    expect(r.graph.links[0]!.limit).toBe(7);
    expect(r.graph.rev).toBe(revBefore + 2); // 割り込んだ変更 + 送り直した変更
    expect(server.graph.get().nodes[0]!.x).toBeGreaterThan(0); // 割り込んだ変更は消えていない
  });

  it("2 回続けて rev_conflict なら送り直しをやめて終了コード 1（rev_conflict）", async () => {
    conflictsToInject = 2;
    const f = await failure({ kind: "link-set", linkId: "l1", config: { limit: 9 } });
    expect(conflictsToInject).toBe(0);
    expect(f.exit).toBe(1);
    expect(JSON.parse(f.stderr)).toMatchObject({ error: { code: "rev_conflict" } });
    expect(server.graph.get().links[0]!.limit).toBe(7);
  });

  it("知らない線は not_found（終了コード 1）", async () => {
    for (const action of [
      { kind: "link-pause", linkId: "l99" },
      { kind: "link-rm", linkId: "l99" },
    ] as const) {
      const f = await failure(action);
      expect(f.exit).toBe(1);
      expect(JSON.parse(f.stderr)).toMatchObject({ error: { code: "not_found" } });
    }
    const removed = await graph({ kind: "link-rm", linkId: "l1" });
    expect(removed.graph.links).toEqual([]);
  });
});
